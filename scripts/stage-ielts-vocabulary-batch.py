"""Validate and stage one 25–50 entry editorial proposal batch in Development.

Default is dry-run. No batch is approved or published by this command.
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import importlib.util
import json
import re
import urllib.error
import urllib.request
from pathlib import Path


DEV_REF = "bhactqaxcvusmpeooxwi"
ALLOWED_POS = {"noun", "noun_phrase", "verb", "verb_phrase", "adjective",
               "adjective_phrase", "adverb", "idiom", "prepositional_phrase", "expression"}
ALLOWED_SKILLS = {"speaking", "writing", "reading", "listening"}


def load_local(filename: str):
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(filename.removesuffix(".py").replace("-", "_"), path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {filename}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def qa_flags(entry: dict, audit) -> list[str]:
    examples = entry["examples"]
    normalized = [audit.normalized(example) for example in examples]
    flags = []
    if not any(audit.normalized(entry["term"]) in example for example in normalized):
        flags.append("term_not_literal_in_examples")
    if len(audit.normalized(entry["definition_vi"])) < 10:
        flags.append("short_definition")
    if any(len(example.strip()) < 35 for example in examples):
        flags.append("short_example")
    if len(set(normalized)) != len(normalized):
        flags.append("duplicate_example")
    if any(re.search(r"\bnine\b", example, flags=re.IGNORECASE) for example in examples):
        flags.append("example_contains_nine")
    return flags


def validate_entry(entry: dict, audit) -> None:
    required = {"term", "definition_vi", "pos_standard", "pattern", "examples",
                "collocations", "cefr_proposed", "stage_proposed", "priority_proposed", "skill_tags"}
    if set(entry) != required:
        raise ValueError(f"Unexpected or missing fields for {entry.get('term', '<unknown>')}")
    if not all(isinstance(entry[key], str) and entry[key].strip()
               for key in ("term", "definition_vi", "pos_standard", "pattern", "cefr_proposed", "stage_proposed")):
        raise ValueError("Empty text field")
    if entry["pos_standard"] not in ALLOWED_POS:
        raise ValueError("Unknown part of speech")
    if not isinstance(entry["examples"], list) or len(entry["examples"]) < 2 or not all(
            isinstance(value, str) and value.strip() for value in entry["examples"]):
        raise ValueError("At least two nonempty examples are required")
    if not isinstance(entry["collocations"], list) or not entry["collocations"] or not all(
            isinstance(value, str) and value.strip() for value in entry["collocations"]):
        raise ValueError("At least one nonempty collocation is required")
    if entry["cefr_proposed"] not in ("A1", "A2", "B1", "B2", "C1", "C2"):
        raise ValueError("Invalid proposed CEFR")
    stage = {"A1": "foundation", "A2": "foundation", "B1": "developing",
             "B2": "developing", "C1": "advanced", "C2": "advanced"}[entry["cefr_proposed"]]
    if entry["stage_proposed"] != stage or type(entry["priority_proposed"]) is not int or entry["priority_proposed"] not in (0, 1, 2):
        raise ValueError("Proposed stage or priority is inconsistent")
    if not isinstance(entry["skill_tags"], list) or not entry["skill_tags"] or not set(entry["skill_tags"]) <= ALLOWED_SKILLS:
        raise ValueError("Invalid skill tags")
    if not audit.normalized(entry["term"]):
        raise ValueError("Invalid normalized term")


def stage_payload(ref: str, key: str, payload: dict) -> int:
    request = urllib.request.Request(
        f"https://{ref}.supabase.co/rest/v1/rpc/stage_ielts_vocabulary_draft_batch",
        data=json.dumps({"p_payload": payload}, ensure_ascii=False).encode("utf-8"),
        headers={"apikey": key, "Authorization": f"Bearer {key}", "Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=90) as response:
            return json.load(response)
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"Staging failed with HTTP {error.code}: {error.read().decode('utf-8', errors='replace')[:250]}") from None


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--batch", type=Path, required=True)
    parser.add_argument("--proposals", type=Path, required=True)
    parser.add_argument("--expected-ref", required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    if args.expected_ref != DEV_REF:
        parser.error("This staging command only accepts the Development project")
    out_dir = args.out_dir.resolve()
    if out_dir.is_relative_to(Path(__file__).resolve().parent.parent):
        parser.error("Review report output must be outside the repository")
    out_dir.mkdir(parents=True, exist_ok=True)

    audit = load_local("vocabulary-v2-phase1-audit.py")
    dedup = load_local("vocabulary-v2-phase5-dedup.py")
    payload_source = args.batch.read_bytes()
    batch = json.loads(payload_source)
    proposals = json.loads(args.proposals.read_text(encoding="utf-8"))
    entries = batch["entries"]
    if batch["topic"] != proposals["topic"] or batch["review_status"] != "proposed" or batch["origin"] != "codex_editorial_proposal":
        parser.error("Unexpected batch topic, origin or review state")
    if not isinstance(entries, list) or not 25 <= len(entries) <= 50:
        parser.error("A batch must contain 25–50 entries")
    proposed_terms = {audit.normalized(term) for term in proposals["terms"]}
    if any(audit.normalized(entry["term"]) not in proposed_terms for entry in entries):
        parser.error("Batch contains a term outside the proposal pool")
    for entry in entries:
        validate_entry(entry, audit)
    normalized = [audit.normalized(entry["term"]) for entry in entries]
    if len(set(normalized)) != len(normalized):
        parser.error("Batch contains duplicate normalized terms")

    db = audit.ReadOnlyProject(DEV_REF)
    sources = {
        "ielts": db.rows("ielts_vocabulary_entries", "source_key,term"),
        "cefr_bank": db.rows("vocabulary_bank_entries", "source_id,headword"),
        "lessons": db.rows("vocabulary_entries", "id,word"),
    }
    matches = dedup.classify_terms([entry["term"] for entry in entries], sources, audit)
    if any(item["status"] != "candidate" for item in matches):
        raise RuntimeError("Batch includes exact, alias or near-duplicate leads; inspect the private report")
    topics = db.rows("ielts_learning_topics", "slug,origin,target_new_unique")
    if len(topics) != 40 or sum(row["origin"] == "editorial_expansion" for row in topics) != 15 or sum(
            row["target_new_unique"] for row in topics) != 2650:
        raise RuntimeError("Learning topic catalog is incomplete")
    topic_slug = re.sub(r"[^a-z0-9]+", "-", batch["topic"].lower()).strip("-")
    if not any(row["slug"] == topic_slug and row["origin"] == "editorial_expansion" for row in topics):
        raise RuntimeError("Batch topic is not a registered expansion topic")

    records = []
    for entry, key in zip(entries, normalized):
        encoded = json.dumps(entry, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        records.append({**entry, "candidate_key": "phase5:" + hashlib.sha256(key.encode("utf-8")).hexdigest(),
                        "proposal_sha256": hashlib.sha256(encoded).hexdigest(),
                        "normalized_term": key, "qa_flags": qa_flags(entry, audit)})
    source_sha = hashlib.sha256(payload_source).hexdigest()
    payload = {"batch_key": batch["batch_key"], "topic_slug": topic_slug,
               "source_sha256": source_sha, "origin": batch["origin"], "entries": records}
    current = db.rows("ielts_vocabulary_draft_entries", "candidate_key,proposal_sha256,batch_key,review_status")
    by_key = {row["candidate_key"]: row for row in current}
    if any(item["candidate_key"] in by_key and (by_key[item["candidate_key"]]["proposal_sha256"] != item["proposal_sha256"]
            or by_key[item["candidate_key"]]["batch_key"] != batch["batch_key"]) for item in records):
        raise RuntimeError("Existing draft differs from this proposal")
    pending = sum(item["candidate_key"] not in by_key for item in records)
    observed = by_key
    if args.apply:
        if stage_payload(DEV_REF, db.key, payload) != len(records):
            raise RuntimeError("Staging RPC returned an unexpected count")
        verified = {row["candidate_key"]: row for row in db.rows(
            "ielts_vocabulary_draft_entries", "candidate_key,proposal_sha256,batch_key,review_status")}
        if any(verified.get(item["candidate_key"], {}).get("proposal_sha256") != item["proposal_sha256"]
               for item in records):
            raise RuntimeError("Post-stage verification failed")
        observed = verified

    report = {"environment": "development", "mode": "apply" if args.apply else "dry_run",
              "batch_key": batch["batch_key"], "topic": batch["topic"], "source_sha256": source_sha,
              "entries": len(records), "examples": sum(len(entry["examples"]) for entry in entries),
              "hard_duplicates": 0, "alias_or_near_leads": 0,
              "qa_signal_counts": dict(sorted(collections.Counter(flag for record in records for flag in record["qa_flags"]).items())),
              "new_drafts_before_run": pending,
              "review_status_on_import": "proposed",
              "approved_in_batch": sum(observed.get(item["candidate_key"], {}).get("review_status") == "approved"
                                       for item in records), "published": 0,
              "note": "CEFR, stage and priority are proposals; a human editor must approve each entry before publication."}
    (out_dir / f"{batch['batch_key']}-review-report.json").write_text(
        json.dumps({**report, "dedup_results": matches,
                    "qa_leads": [{"term": record["term"], "flags": record["qa_flags"]}
                                 for record in records if record["qa_flags"]]}, ensure_ascii=False, indent=2) + "\n",
        encoding="utf-8")
    print(json.dumps(report, ensure_ascii=True))


if __name__ == "__main__":
    main()
