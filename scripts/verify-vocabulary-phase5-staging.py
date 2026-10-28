"""Read-only gate for the Phase 5 Dev release and private review audit."""

from __future__ import annotations

import importlib.util
import hashlib
import json
import os
import subprocess
import urllib.error
import urllib.request
from pathlib import Path


DEV_REF = "bhactqaxcvusmpeooxwi"


def load_audit():
    path = Path(__file__).with_name("vocabulary-v2-phase1-audit.py")
    spec = importlib.util.spec_from_file_location("vocabulary_phase1_audit", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Cannot load audit module")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def anon_key() -> str:
    command = (["cmd.exe", "/c", "npx", "--yes", "supabase"] if os.name == "nt" else ["npx", "--yes", "supabase"])
    command += ["projects", "api-keys", "--project-ref", DEV_REF, "--output", "json"]
    options = {"creationflags": subprocess.CREATE_NO_WINDOW} if os.name == "nt" else {}
    keys = json.loads(subprocess.run(command, capture_output=True, text=True, check=True, timeout=60, **options).stdout)
    value = next((row.get("api_key") for row in keys if row.get("id") == "anon"), None)
    if not value:
        raise RuntimeError("Anon key unavailable")
    return value


def anonymous_visible_rows(table: str, key: str) -> int:
    request = urllib.request.Request(
        f"https://{DEV_REF}.supabase.co/rest/v1/{table}?select=*&limit=1",
        headers={"apikey": key, "Authorization": f"Bearer {key}"})
    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            return len(json.load(response))
    except urllib.error.HTTPError as error:
        if error.code in (401, 403):
            return 0
        raise RuntimeError(f"Anonymous probe failed with HTTP {error.code}") from None


def main() -> None:
    audit = load_audit()
    db = audit.ReadOnlyProject(DEV_REF)
    topics = db.rows("ielts_learning_topics", "slug,title,origin,target_new_unique")
    batches = db.rows("ielts_vocabulary_draft_batches", "batch_key,topic_slug,source_sha256")
    drafts = db.rows("ielts_vocabulary_draft_entries", "candidate_key,batch_key,topic_slug,term,normalized_term,examples,review_status,qa_flags")
    events = db.rows("ielts_vocabulary_review_events", "candidate_key,review_origin,qa_flags_before")
    published = db.rows("ielts_vocabulary_entries", "source_key,content_origin,published,content_status",
                        {"content_origin": "eq.owner_authorized_editorial"})
    original_titles = set(json.loads((Path(__file__).resolve().parent.parent / "src/lib/vocabulary/ielts-topics.json").read_text(encoding="utf-8")))
    matrix = json.loads((Path(__file__).resolve().parent.parent / "content/vocabulary/phase5/coverage-matrix.json").read_text(encoding="utf-8"))
    content_dir = Path(__file__).resolve().parent.parent / "content/vocabulary/phase5"
    source_batches = []
    for path in content_dir.glob("*.json"):
        raw = path.read_bytes()
        parsed = json.loads(raw)
        if "entries" in parsed:
            source_batches.append((parsed, hashlib.sha256(raw.replace(b"\r\n", b"\n")).hexdigest()))
    expected_batch_hashes = {item["batch_key"]: digest for item, digest in source_batches}
    expected_terms = {audit.normalized(entry["term"]) for item, _ in source_batches for entry in item["entries"]}
    expected_examples = sum(len(entry["examples"]) for item, _ in source_batches for entry in item["entries"])
    expansion = {row["title"]: row["target_new_unique"] for row in topics if row["origin"] == "editorial_expansion"}
    source_named = {row["title"] for row in topics if row["origin"] == "source_named"}
    matrix_targets = {row["title"]: row["target_new_unique"] for row in matrix["topics"]}
    key = anon_key()
    result = {
        "topics": len(topics),
        "source_named_topics": len(source_named),
        "expansion_topics": len(expansion),
        "target_new_unique": sum(expansion.values()),
        "catalog_matches_source": source_named == original_titles,
        "coverage_matrix_matches_catalog": matrix_targets == expansion,
        "draft_batches": len(batches),
        "batch_hashes_match_files": {row["batch_key"]: row["source_sha256"] for row in batches} == expected_batch_hashes,
        "draft_entries": len(drafts),
        "draft_examples": sum(len(row["examples"]) for row in drafts),
        "draft_terms_match_files": {row["normalized_term"] for row in drafts} == expected_terms,
        "approved": sum(row["review_status"] == "approved" for row in drafts),
        "review_events": len(events),
        "qa_leads_preserved": sum(bool(row["qa_flags_before"]) for row in events),
        "owner_authorized_events": sum(row["review_origin"] == "owner_authorized_codex" for row in events),
        "published_editorial": sum(row["published"] and row["content_status"] == "owner_authorized_review" for row in published),
        "published_new_unique": db.count("ielts_vocabulary_entries", "source_key") - 5000,
        "unique_normalized_drafts": len({row["normalized_term"] for row in drafts}),
        "anon_topics_visible": anonymous_visible_rows("ielts_learning_topics", key),
        "anon_drafts_visible": anonymous_visible_rows("ielts_vocabulary_draft_entries", key),
        "legacy_cefr_rows": db.count("vocabulary_bank_entries", "source_id"),
        "legacy_lesson_rows": db.count("vocabulary_entries", "id"),
        "existing_ielts_rows": db.count("ielts_vocabulary_entries", "source_key"),
    }
    expected = {"topics": 40, "source_named_topics": 25, "expansion_topics": 15,
                "target_new_unique": 2650, "catalog_matches_source": True,
                "coverage_matrix_matches_catalog": True, "draft_batches": len(source_batches),
                "batch_hashes_match_files": True,
                "draft_entries": len(expected_terms), "draft_examples": expected_examples,
                "draft_terms_match_files": True, "approved": len(expected_terms),
                "review_events": len(expected_terms), "qa_leads_preserved": 13,
                "owner_authorized_events": len(expected_terms),
                "published_editorial": len(expected_terms),
                "published_new_unique": len(expected_terms), "unique_normalized_drafts": len(expected_terms),
                "anon_topics_visible": 0, "anon_drafts_visible": 0,
                "legacy_cefr_rows": 9941, "legacy_lesson_rows": 1237,
                "existing_ielts_rows": 5000 + len(expected_terms)}
    result["pass"] = all(result[field] == value for field, value in expected.items())
    print(json.dumps(result, ensure_ascii=True))
    if not result["pass"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
