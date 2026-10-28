"""Idempotent import of the owner-authorized 25 IELTS CSVs.

Dry-run is the default. --apply writes only to the explicitly named project.
Existing source rows are never overwritten; changed rows stop for review.
Temporary Supabase credentials stay in process memory.
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import importlib.util
import json
import os
import urllib.error
import urllib.parse
import urllib.request
from pathlib import Path


PROJECTS = {
    "development": "bhactqaxcvusmpeooxwi",
    "production": "vpkhriywprepuhrbarye",
}
EXPECTED_ARCHIVE_SHA256 = "9add911cefcecf45cc6d1fbe4f947f0f38387ba0f3399ab07d2e55a1df738674"
DATASET = "forumflash-ielts-v1"
POS_MAP = {
    "Danh từ": "noun",
    "Cụm danh từ": "noun_phrase",
    "Động từ": "verb",
    "Tính từ": "adjective",
    "Cụm tính từ": "adjective_phrase",
    "Cụm động từ": "verb_phrase",
    "Thành ngữ": "idiom",
    "Cụm giới từ": "prepositional_phrase",
}


def load_local(name: str):
    path = Path(__file__).with_name(name)
    spec = importlib.util.spec_from_file_location(name.removesuffix(".py").replace("-", "_"), path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {name}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def source_hash(row: dict[str, str]) -> str:
    fields = {key: row[key] for key in ("Term", "Definition", "Part of speech", "Pattern", "Examples", "Topic")}
    encoded = json.dumps(fields, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
    return hashlib.sha256(encoded).hexdigest()


def make_records(rows: list[dict[str, str]], archive_hash: str, audit, estimator, published: bool) -> list[dict]:
    records = []
    for row in rows:
        normalized_term = audit.normalized(row["Term"])
        band, score, model = estimator.suggested_band(row["Term"])
        records.append({
            "source_key": DATASET + ":" + hashlib.sha256(normalized_term.encode("utf-8")).hexdigest(),
            "term": row["Term"],
            "normalized_term": normalized_term,
            "definition_en": row["Definition"],
            "definition_vi": row["Definition"],
            "pos_raw": row["Part of speech"],
            "pos_standard": POS_MAP[row["Part of speech"]],
            "pattern": row["Pattern"],
            "examples": row["Examples"].split(" | "),
            "topic": row["Topic"],
            "band_level": band,
            "band_method": "suggested",
            "band_score": score,
            "band_model": model,
            "content_status": "source_unreviewed",
            "published": published,
            "source_archive_sha256": archive_hash,
            "source_file": row["source_file"],
            "source_row": int(row["source_row"]),
            "source_row_sha256": source_hash(row),
        })
    return records


def insert_missing(ref: str, key: str, records: list[dict]) -> int:
    base = f"https://{ref}.supabase.co/rest/v1/ielts_vocabulary_entries?on_conflict=source_key"
    inserted = 0
    for offset in range(0, len(records), 100):
        batch = records[offset:offset + 100]
        request = urllib.request.Request(base,
            data=json.dumps(batch, ensure_ascii=False).encode("utf-8"),
            headers={"apikey": key, "Authorization": f"Bearer {key}",
                     "Content-Type": "application/json",
                     "Prefer": "resolution=ignore-duplicates,return=representation"}, method="POST")
        try:
            with urllib.request.urlopen(request, timeout=60) as response:
                inserted += len(json.load(response))
        except urllib.error.HTTPError as error:
            raise RuntimeError(f"Insert batch {offset // 100 + 1} failed with HTTP {error.code}") from None
    return inserted


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--environment", choices=PROJECTS, required=True)
    parser.add_argument("--expected-ref", required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--draft", action="store_true", help="Import with published=false")
    args = parser.parse_args()
    ref = PROJECTS[args.environment]
    if args.expected_ref != ref:
        parser.error("Expected project ref does not match the selected environment")
    output_dir = args.out_dir.resolve()
    if output_dir.is_relative_to(Path(__file__).resolve().parent.parent):
        parser.error("Report output must be outside the repository")
    output_dir.mkdir(parents=True, exist_ok=True)
    audit = load_local("vocabulary-v2-phase1-audit.py")
    estimator = load_local("vocabulary-v2-band-estimate.py")
    rows, source_report = audit.source_rows(args.archive)
    archive_hash = source_report["archive_sha256"]
    if archive_hash != EXPECTED_ARCHIVE_SHA256 or len(rows) != 5000 or source_report["total_examples"] != 10002:
        parser.error("Archive does not match the approved 5,000-row source")
    records = make_records(rows, archive_hash, audit, estimator, not args.draft)
    if len({record["source_key"] for record in records}) != 5000:
        raise RuntimeError("Source keys are not unique")
    bands = dict(sorted(collections.Counter(record["band_level"] for record in records).items()))
    report = {"environment": args.environment, "project_ref": ref, "mode": "apply" if args.apply else "dry_run",
              "archive_sha256": archive_hash, "source_rows": len(records), "examples": sum(len(r["examples"]) for r in records),
              "topics": len({r["topic"] for r in records}), "suggested_band_counts": bands,
              "band_model": estimator.MODEL, "published": not args.draft}
    if args.apply:
        db = audit.ReadOnlyProject(ref)
        existing_rows = db.rows("ielts_vocabulary_entries", "source_key,source_row_sha256,band_level,band_method,published")
        existing = {row["source_key"]: row for row in existing_rows}
        changed = [record["source_key"] for record in records if record["source_key"] in existing and existing[record["source_key"]]["source_row_sha256"] != record["source_row_sha256"]]
        if changed:
            raise RuntimeError(f"{len(changed)} existing source rows changed; review before applying")
        missing = [record for record in records if record["source_key"] not in existing]
        report["already_present"] = len(records) - len(missing)
        report["inserted"] = insert_missing(ref, db.key, missing)
        verified = {row["source_key"]: row for row in db.rows("ielts_vocabulary_entries", "source_key,source_row_sha256,band_level,band_method,published")}
        if any(verified.get(record["source_key"], {}).get("source_row_sha256") != record["source_row_sha256"] for record in records):
            raise RuntimeError("Post-import source checksum verification failed")
        report["verified_rows"] = len(records)
    destination = output_dir / f"{args.environment}-ielts-import-report.json"
    destination.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps(report, ensure_ascii=False))


if __name__ == "__main__":
    main()
