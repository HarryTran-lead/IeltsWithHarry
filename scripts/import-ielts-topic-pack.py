"""Import the owner's 15-topic ZIP as unique IELTS entries plus topic placements.

Dry run by default. The ZIP stays local; only approved lexical rows and links are
sent to the allowlisted Supabase project. Safe to resume after a partial batch.
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


REFS = {"bhactqaxcvusmpeooxwi", "vpkhriywprepuhrbarye"}
POS_RAW = {
    "noun": "Danh từ", "noun_phrase": "Cụm danh từ", "verb": "Động từ",
    "verb_phrase": "Cụm động từ", "adjective": "Tính từ",
    "adjective_phrase": "Cụm tính từ", "adverb": "Trạng từ",
    "idiom": "Thành ngữ", "prepositional_phrase": "Cụm giới từ",
    "expression": "Cách diễn đạt",
}
STAGE = {"A1": "foundation", "A2": "foundation", "B1": "developing",
         "B2": "developing", "C1": "advanced", "C2": "advanced"}
ORIGINS = {"published_existing", "prior_draft", "new_authored_proposal",
           "link_existing_ielts_source"}


def load(filename: str):
    path = Path(__file__).with_name(filename)
    spec = importlib.util.spec_from_file_location(filename.replace("-", "_"), path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def post_rows(ref: str, key: str, table: str, rows: list[dict]):
    if not rows:
        return
    request = urllib.request.Request(
        f"https://{ref}.supabase.co/rest/v1/{table}",
        data=json.dumps(rows, ensure_ascii=False).encode("utf-8"),
        headers={"apikey": key, "Authorization": f"Bearer {key}",
                 "Content-Type": "application/json", "Prefer": "return=minimal"},
        method="POST")
    try:
        with urllib.request.urlopen(request, timeout=90):
            pass
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"{table} HTTP {error.code}: "
                           f"{error.read().decode('utf-8', errors='replace')[:500]}") from None


def chunks(rows: list[dict], size: int = 50):
    for start in range(0, len(rows), size):
        yield rows[start:start + size]


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zip", type=Path, required=True)
    parser.add_argument("--expected-ref", required=True, choices=sorted(REFS))
    parser.add_argument("--apply", action="store_true")
    args = parser.parse_args()
    audit = load("vocabulary-v2-phase1-audit.py")
    stage = load("stage-ielts-vocabulary-batch.py")
    band = load("vocabulary-v2-band-estimate.py")
    pack = load("audit-ielts-topic-pack.py")
    db = audit.ReadOnlyProject(args.expected_ref)
    zip_sha = hashlib.sha256(args.zip.read_bytes()).hexdigest()
    rows = pack.pack_rows(args.zip)
    if len(rows) != 1650 or collections.Counter(row["Topic"] for row in rows) != {
            row["Topic"]: 110 for row in rows}:
        raise RuntimeError("Pack is not 15 topics × 110 placements")
    if any(row["Data origin"] not in ORIGINS for row in rows):
        raise RuntimeError("Unknown pack origin")
    topics = db.rows("ielts_learning_topics", "slug,title,origin")
    title_to_slug = {row["title"]: row["slug"] for row in topics
                     if row["origin"] == "editorial_expansion"}
    if len(title_to_slug) != 15 or set(title_to_slug) != {row["Topic"] for row in rows}:
        raise RuntimeError("Pack topics differ from the curriculum catalog")

    live = db.rows("ielts_vocabulary_entries",
                   "source_key,normalized_term,source_row_sha256,content_origin,published")
    by_term = {row["normalized_term"]: row for row in live}
    by_key = {row["source_key"]: row for row in live}
    if len(live) not in (5075, 6046):
        raise RuntimeError(f"Unexpected IELTS baseline {len(live)}")
    authored = [(number, row) for number, row in enumerate(rows, start=2)
                if row["Data origin"] in ("prior_draft", "new_authored_proposal")]
    canonical = {}
    for number, row in authored:
        normalized = audit.normalized(row["Term"])
        if normalized not in canonical:
            canonical[normalized] = (number, row)
    collisions = {term for term in canonical if term in by_term}
    fresh = {term: value for term, value in canonical.items() if term not in collisions}
    if len(canonical) != 976 or len(collisions) != 5 or len(fresh) not in (971, 0):
        # On a resumed run the 971 entries are already live. Their source keys
        # are checked below before they are excluded from pending inserts.
        if len(canonical) != 976:
            raise RuntimeError("Authored unique count changed")

    entries = []
    events = []
    source_key_by_term = {term: row["source_key"] for term, row in by_term.items()}
    qa_count = 0
    for normalized, (number, row) in canonical.items():
        source_key = "topicpack:" + hashlib.sha256(normalized.encode("utf-8")).hexdigest()
        source_hash = audit.sha256_json(row)
        existing = by_term.get(normalized)
        if existing:
            if existing["source_key"] == source_key and existing["source_row_sha256"] != source_hash:
                raise RuntimeError(f"Changed imported row: {row['Term']}")
            continue
        if row["POS"] not in POS_RAW or row["CEFR"] not in STAGE:
            raise RuntimeError(f"Invalid POS or CEFR: {row['Term']}")
        if not row["Priority"].isdigit() or int(row["Priority"]) not in (0, 1, 2):
            raise RuntimeError(f"Invalid priority: {row['Term']}")
        if any(not row[field].strip() for field in
               ("Term", "Meaning VI", "Pattern", "Collocation", "Example 1", "Example 2")):
            raise RuntimeError(f"Incomplete authored row: {row['Term']}")
        if row["Example 1"].strip() == row["Example 2"].strip():
            raise RuntimeError(f"Repeated examples: {row['Term']}")
        flags = stage.qa_flags({"term": row["Term"], "definition_vi": row["Meaning VI"],
                                "examples": [row["Example 1"], row["Example 2"]]}, audit)
        qa_count += bool(flags)
        level, score, model = band.suggested_band(row["Term"])
        entries.append({
            "source_key": source_key, "term": row["Term"], "normalized_term": normalized,
            "definition_en": row["Meaning VI"], "definition_vi": row["Meaning VI"],
            "pos_raw": POS_RAW[row["POS"]], "pos_standard": row["POS"],
            "pattern": row["Pattern"], "examples": [row["Example 1"], row["Example 2"]],
            "topic": row["Topic"], "band_level": level, "band_method": "suggested",
            "band_score": score, "band_model": model,
            "content_status": "owner_authorized_review", "published": True,
            "source_archive_sha256": zip_sha, "source_file": "ALL_15_TOPICS_1650.csv",
            "source_row": number, "source_row_sha256": source_hash,
            "cefr_level": row["CEFR"], "learning_stage": STAGE[row["CEFR"]],
            "learning_priority": int(row["Priority"]) + 1,
            "content_origin": "owner_authorized_editorial",
            "collocations": [row["Collocation"]], "skill_tags": [],
        })
        events.append({"source_key": source_key, "pack_sha256": zip_sha,
                       "source_row_sha256": source_hash, "qa_flags_before": flags,
                       "review_origin": "owner_authorized_codex",
                       "review_note": "Owner authorized bulk publication; heuristic signals retained for later editorial inspection, without a human editor claim."})
        source_key_by_term[normalized] = source_key

    # A resumed import may already have the 971 package entries. Include their
    # stable source keys while resolving all 1,650 placements.
    for normalized in canonical:
        if normalized in by_term:
            source_key_by_term[normalized] = by_term[normalized]["source_key"]
    missing_refs = [row["Term"] for row in rows
                    if audit.normalized(row["Term"]) not in source_key_by_term]
    if missing_refs:
        raise RuntimeError(f"Unresolved source references: {missing_refs[:8]}")
    links = [{"source_key": source_key_by_term[audit.normalized(row["Term"])],
              "topic_slug": title_to_slug[row["Topic"]], "pack_sha256": zip_sha,
              "pack_row": number, "link_kind": row["Data origin"]}
             for number, row in enumerate(rows, start=2)]
    if len({(row["source_key"], row["topic_slug"]) for row in links}) != 1650:
        raise RuntimeError("Duplicate topic placement")
    current_events = {row["source_key"]: row for row in db.rows(
        "ielts_vocabulary_pack_review_events", "source_key,source_row_sha256")}
    for source_key, event in current_events.items():
        match = by_key.get(source_key)
        if not match or match["source_row_sha256"] != event["source_row_sha256"]:
            raise RuntimeError("Changed review event")
    current_links = {(row["source_key"], row["topic_slug"]): row for row in db.rows(
        "ielts_vocabulary_topic_links", "source_key,topic_slug,pack_sha256,pack_row")}
    if any(current_links[key]["pack_sha256"] != zip_sha or
           current_links[key]["pack_row"] != row["pack_row"]
           for row in links if (key := (row["source_key"], row["topic_slug"])) in current_links):
        raise RuntimeError("Changed topic link")

    summary = {"environment": args.expected_ref, "mode": "apply" if args.apply else "dry_run",
               "zip_sha256": zip_sha, "placements": len(links),
               "new_unique_expected": 971, "new_unique_pending": len(entries),
               "existing_source_collisions": 5,
               "review_flags_pending": qa_count,
               "links_pending": sum((row["source_key"], row["topic_slug"]) not in current_links for row in links)}
    print(json.dumps(summary, ensure_ascii=False), flush=True)
    if not args.apply:
        return
    for batch in chunks(entries):
        post_rows(args.expected_ref, db.key, "ielts_vocabulary_entries", batch)
    pending_events = [row for row in events if row["source_key"] not in current_events]
    for batch in chunks(pending_events):
        post_rows(args.expected_ref, db.key, "ielts_vocabulary_pack_review_events", batch)
    pending_links = [row for row in links
                     if (row["source_key"], row["topic_slug"]) not in current_links]
    for batch in chunks(pending_links):
        post_rows(args.expected_ref, db.key, "ielts_vocabulary_topic_links", batch)
    after = {name: db.count(name) for name in (
        "ielts_vocabulary_entries", "ielts_vocabulary_pack_review_events",
        "ielts_vocabulary_topic_links")}
    if after != {"ielts_vocabulary_entries": 6046,
                 "ielts_vocabulary_pack_review_events": 971,
                 "ielts_vocabulary_topic_links": 1650}:
        raise RuntimeError(f"Post-import counts do not match: {after}")
    print(json.dumps({"status": "verified", **after}, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    main()
