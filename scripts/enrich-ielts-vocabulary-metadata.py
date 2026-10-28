"""Verify the approved archive and apply Phase 4 QA flags in guarded batches.

Dry-run is the default. Detailed review leads and reports stay outside Git.
The script never changes source content, suggested bands, or editorial fields.
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import urllib.error
import urllib.request
from pathlib import Path

from importlib.util import module_from_spec, spec_from_file_location


def local_module(filename: str):
    path = Path(__file__).with_name(filename)
    spec = spec_from_file_location(filename.removesuffix(".py").replace("-", "_"), path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {filename}")
    module = module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def apply_batch(ref: str, key: str, batch: list[dict]) -> None:
    request = urllib.request.Request(
        f"https://{ref}.supabase.co/rest/v1/rpc/apply_ielts_vocabulary_qa_batch",
        data=json.dumps({"p_rows": batch}, ensure_ascii=False).encode("utf-8"),
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            if json.load(response) != len(batch):
                raise RuntimeError("QA batch returned an unexpected row count")
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"QA batch failed with HTTP {error.code}: {error.read().decode('utf-8', errors='replace')[:250]}") from None


def main() -> None:
    importer = local_module("import-ielts-vocabulary.py")
    audit = local_module("vocabulary-v2-phase1-audit.py")
    qa = local_module("vocabulary-v2-source-qa.py")
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--environment", choices=importer.PROJECTS, required=True)
    parser.add_argument("--expected-ref", required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    ref = importer.PROJECTS[args.environment]
    if args.expected_ref != ref:
        parser.error("Expected project ref does not match the selected environment")
    out_dir = args.out_dir.resolve()
    if out_dir.is_relative_to(Path(__file__).resolve().parent.parent):
        parser.error("Report output must be outside the repository")
    out_dir.mkdir(parents=True, exist_ok=True)

    rows, source = audit.source_rows(args.archive)
    if (source["archive_sha256"] != importer.EXPECTED_ARCHIVE_SHA256
            or len(rows) != 5000 or source["total_examples"] != 10002):
        parser.error("Archive does not match the approved 5,000-row source")
    analysis = qa.analyze(rows, source, audit)
    flags_by_location = {(flag["source_file"], flag["source_row"]): flag["signals"]
                         for flag in analysis["flagged_rows"]}
    expected: dict[str, dict] = {}
    for row in rows:
        normalized = audit.normalized(row["Term"])
        key = importer.DATASET + ":" + hashlib.sha256(normalized.encode("utf-8")).hexdigest()
        expected[key] = {
            "source_key": key,
            "source_row_sha256": importer.source_hash(row),
            "definition_vi": row["Definition"],
            "pos_standard": importer.POS_MAP[row["Part of speech"]],
            "qa_flags": flags_by_location.get((row["source_file"], int(row["source_row"])), []),
        }
    if len(expected) != 5000:
        raise RuntimeError("Source keys are not unique")

    db = audit.ReadOnlyProject(ref)
    selected = "source_key,source_row_sha256,definition_vi,pos_standard,qa_flags,qa_model,content_status,cefr_level,learning_stage,learning_priority"
    current = {row["source_key"]: row for row in db.rows("ielts_vocabulary_entries", selected)}
    if set(current) != set(expected):
        raise RuntimeError("Database source keys do not match the approved archive")
    for key, target in expected.items():
        live = current[key]
        if (live["source_row_sha256"] != target["source_row_sha256"]
                or live["definition_vi"] != target["definition_vi"]
                or live["pos_standard"] != target["pos_standard"]):
            raise RuntimeError("Database source checksum or deterministic metadata differs from archive")
        if live["content_status"] != "source_unreviewed":
            raise RuntimeError("An editor-reviewed row needs a separate review workflow")

    ordered = [expected[key] for key in sorted(expected)]
    pending = [entry for entry in ordered if current[entry["source_key"]]["qa_flags"] != entry["qa_flags"]
               or current[entry["source_key"]]["qa_model"] != "source-heuristics-v1"]
    if args.apply:
        for offset in range(0, len(pending), 100):
            batch = [{key: item[key] for key in ("source_key", "source_row_sha256", "qa_flags")}
                     for item in pending[offset:offset + 100]]
            apply_batch(ref, db.key, batch)
        verified = {row["source_key"]: row for row in db.rows("ielts_vocabulary_entries", selected)}
        if len(verified) != 5000 or any(
            verified[key]["qa_flags"] != target["qa_flags"]
            or verified[key]["qa_model"] != "source-heuristics-v1"
            or verified[key]["source_row_sha256"] != target["source_row_sha256"]
            or verified[key]["content_status"] != "source_unreviewed"
            for key, target in expected.items()
        ):
            raise RuntimeError("Post-enrichment metadata verification failed")

    output = {
        "environment": args.environment,
        "project_ref": ref,
        "mode": "apply" if args.apply else "dry_run",
        "archive_sha256": source["archive_sha256"],
        "source_rows": len(rows),
        "part_of_speech_counts": dict(sorted(collections.Counter(item["pos_standard"] for item in ordered).items())),
        "definition_vi_coverage": len(rows),
        "rows_with_qa_signals": analysis["rows_with_any_signal"],
        "signal_counts": analysis["signal_counts"],
        "rows_needing_qa_update": len(pending),
        "cefr_assigned": sum(bool(row["cefr_level"]) for row in current.values()),
        "stage_assigned": sum(bool(row["learning_stage"]) for row in current.values()),
        "priority_assigned": sum(row["learning_priority"] is not None for row in current.values()),
        "editor_reviewed": sum(row["content_status"] == "editor_reviewed" for row in current.values()),
        "note": "QA flags are review leads, not confirmed errors; CEFR, stage and priority require editorial evidence.",
    }
    (out_dir / f"{args.environment}-phase4-metadata-report.json").write_text(
        json.dumps(output, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    (out_dir / "phase4-review-leads.json").write_text(
        json.dumps(analysis, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(output, ensure_ascii=True))


if __name__ == "__main__":
    main()
