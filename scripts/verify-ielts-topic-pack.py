"""Read-only gate for the 15-topic owner pack in Dev or Production."""

from __future__ import annotations

import argparse
import collections
import hashlib
import importlib.util
import json
from pathlib import Path


def load_audit():
    path = Path(__file__).with_name("vocabulary-v2-phase1-audit.py")
    spec = importlib.util.spec_from_file_location("vocabulary_audit", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zip", type=Path, required=True)
    parser.add_argument("--expected-ref", required=True)
    args = parser.parse_args()
    audit = load_audit()
    db = audit.ReadOnlyProject(args.expected_ref)
    digest = hashlib.sha256(args.zip.read_bytes()).hexdigest()
    topics = db.rows("ielts_learning_topics", "slug,origin")
    links = db.rows("ielts_vocabulary_topic_links", "source_key,topic_slug,pack_sha256,pack_row")
    entries = db.rows("ielts_vocabulary_entries", "source_key,content_origin,published")
    reviews = db.rows("ielts_vocabulary_pack_review_events", "source_key,pack_sha256,qa_flags_before")
    linked = {row["source_key"] for row in links}
    published = {row["source_key"] for row in entries if row["published"]}
    expansion = {row["slug"] for row in topics if row["origin"] == "editorial_expansion"}
    per_topic = collections.Counter(row["topic_slug"] for row in links)
    result = {
        "project": args.expected_ref,
        "topics": len(topics), "expansion_topics": len(expansion),
        "total_placements": len(links),
        "per_topic_110": set(per_topic) == expansion and all(per_topic[slug] == 110 for slug in expansion),
        "all_links_published": linked <= published,
        "pack_hash_matches": all(row["pack_sha256"] == digest for row in links + reviews),
        "pack_reviews": len(reviews),
        "review_flags_retained": sum(bool(row["qa_flags_before"]) for row in reviews),
        "ielts_total": len(entries),
        "original_ielts": sum(row["content_origin"] == "source_csv" for row in entries),
        "cefr_total": db.count("vocabulary_bank_entries"),
        "lesson_total": db.count("vocabulary_entries"),
    }
    expected = {"topics": 40, "expansion_topics": 15, "total_placements": 1650,
                "per_topic_110": True, "all_links_published": True,
                "pack_hash_matches": True, "pack_reviews": 971,
                "review_flags_retained": 232, "ielts_total": 6046,
                "original_ielts": 5000, "cefr_total": 9941, "lesson_total": 1237}
    result["pass"] = all(result[key] == value for key, value in expected.items())
    print(json.dumps(result, ensure_ascii=False))
    if not result["pass"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
