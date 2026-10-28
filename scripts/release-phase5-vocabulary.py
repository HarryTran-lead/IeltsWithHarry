"""Stage and publish the 75 owner-authorized Phase 5 proposals in one project.

Dry run by default. Each 25-entry batch is approved and published atomically.
The audit event keeps original heuristic flags; review is attributed to Codex
under the owner's instruction, never to a human editor account.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import urllib.error
import urllib.request
from pathlib import Path


ROOT = Path(__file__).resolve().parent.parent
REFS = {"bhactqaxcvusmpeooxwi", "vpkhriywprepuhrbarye"}


def load(filename: str):
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(filename.replace("-", "_"), path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def rpc(ref: str, key: str, name: str, payload: dict) -> int:
    request = urllib.request.Request(
        f"https://{ref}.supabase.co/rest/v1/rpc/{name}",
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={"apikey": key, "Authorization": f"Bearer {key}",
                 "Content-Type": "application/json"}, method="POST")
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"{name} failed with HTTP {error.code}: "
                           f"{error.read().decode('utf-8', errors='replace')[:250]}") from None


def source_records(path: Path, stage, audit, band):
    raw = path.read_bytes()
    batch = json.loads(raw)
    source_sha = hashlib.sha256(raw.replace(b"\r\n", b"\n")).hexdigest()
    records = []
    items = []
    for entry in batch["entries"]:
        stage.validate_entry(entry, audit)
        normalized = audit.normalized(entry["term"])
        proposal_sha = audit.sha256_json(entry)
        flags = stage.qa_flags(entry, audit)
        candidate_key = "phase5:" + hashlib.sha256(normalized.encode("utf-8")).hexdigest()
        band_level, band_score, band_model = band.suggested_band(entry["term"])
        records.append({**entry, "candidate_key": candidate_key,
                        "proposal_sha256": proposal_sha,
                        "normalized_term": normalized, "qa_flags": flags})
        disposition = ("Reviewed meaning, pattern, two examples and collocations; "
                       "heuristic flags reflect inflection, pronoun substitution "
                       "or concise but clear text, not a confirmed error."
                       if flags else "Reviewed meaning, pattern, two examples and collocations; no heuristic flags.")
        items.append({"candidate_key": candidate_key,
                      "proposal_sha256": proposal_sha,
                      "band_level": band_level, "band_score": band_score,
                      "band_model": band_model, "qa_disposition": disposition})
    if len(records) != 25 or len({row["normalized_term"] for row in records}) != 25:
        raise RuntimeError(f"Expected 25 unique entries in {path.name}")
    return batch, source_sha, records, items


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--expected-ref", required=True, choices=sorted(REFS))
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    audit = load("vocabulary-v2-phase1-audit.py")
    stage = load("stage-ielts-vocabulary-batch.py")
    band = load("vocabulary-v2-band-estimate.py")
    db = audit.ReadOnlyProject(args.expected_ref)
    paths = [ROOT / "content/vocabulary/phase5" / name for name in (
        "everyday-routines-001.json", "everyday-routines-002.json", "friends-001.json")]
    baseline = db.count("ielts_vocabulary_entries", "source_key")
    if baseline not in (5000, 5075):
        raise RuntimeError(f"Unexpected IELTS count {baseline}")
    results = []
    for path in paths:
        batch, source_sha, records, items = source_records(path, stage, audit, band)
        topic_slug = audit.re.sub(r"[^a-z0-9]+", "-", batch["topic"].lower()).strip("-")
        draft_rows = db.rows("ielts_vocabulary_draft_entries",
                             "candidate_key,proposal_sha256,review_status,qa_flags",
                             {"batch_key": f"eq.{batch['batch_key']}"})
        if not draft_rows and args.apply:
            payload = {"batch_key": batch["batch_key"], "topic_slug": topic_slug,
                       "source_sha256": source_sha, "origin": batch["origin"],
                       "entries": records}
            if rpc(args.expected_ref, db.key, "stage_ielts_vocabulary_draft_batch",
                   {"p_payload": payload}) != 25:
                raise RuntimeError("Staging count mismatch")
            draft_rows = db.rows("ielts_vocabulary_draft_entries",
                                 "candidate_key,proposal_sha256,review_status,qa_flags",
                                 {"batch_key": f"eq.{batch['batch_key']}"})
        by_key = {row["candidate_key"]: row for row in draft_rows}
        if draft_rows and (len(by_key) != 25 or any(
                by_key.get(item["candidate_key"], {}).get("proposal_sha256") != item["proposal_sha256"]
                for item in items)):
            raise RuntimeError(f"Database drafts differ from {path.name}")
        state = "unstaged" if not draft_rows else draft_rows[0]["review_status"]
        if draft_rows and any(row["review_status"] != state for row in draft_rows):
            raise RuntimeError("Mixed review states in batch")
        if state == "proposed" and args.apply:
            if rpc(args.expected_ref, db.key, "approve_ielts_vocabulary_draft_batch",
                   {"p_batch_key": batch["batch_key"], "p_items": items}) != 25:
                raise RuntimeError("Approval count mismatch")
            state = "approved"
        elif state not in ("unstaged", "proposed", "approved"):
            raise RuntimeError(f"Unexpected review state {state}")
        results.append({"batch": batch["batch_key"], "state": state,
                        "entries": 25, "qa_leads": sum(bool(row["qa_flags"]) for row in records)})
    final_count = db.count("ielts_vocabulary_entries", "source_key")
    expected = 5075 if args.apply else baseline
    if final_count != expected:
        raise RuntimeError(f"Expected {expected} IELTS entries, got {final_count}")
    print(json.dumps({"project": args.expected_ref,
                      "mode": "apply" if args.apply else "dry_run",
                      "ielts_before": baseline, "ielts_after": final_count,
                      "batches": results}, ensure_ascii=False))


if __name__ == "__main__":
    main()
