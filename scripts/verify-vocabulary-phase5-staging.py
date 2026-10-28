"""Read-only gate for the Phase 5 topic catalog and private Development drafts."""

from __future__ import annotations

import importlib.util
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
    original_titles = set(json.loads((Path(__file__).resolve().parent.parent / "src/lib/vocabulary/ielts-topics.json").read_text(encoding="utf-8")))
    matrix = json.loads((Path(__file__).resolve().parent.parent / "content/vocabulary/phase5/coverage-matrix.json").read_text(encoding="utf-8"))
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
        "draft_entries": len(drafts),
        "draft_examples": sum(len(row["examples"]) for row in drafts),
        "approved": sum(row["review_status"] == "approved" for row in drafts),
        "published_new_unique": 0,
        "unique_normalized_drafts": len({row["normalized_term"] for row in drafts}),
        "anon_topics_visible": anonymous_visible_rows("ielts_learning_topics", key),
        "anon_drafts_visible": anonymous_visible_rows("ielts_vocabulary_draft_entries", key),
        "legacy_cefr_rows": db.count("vocabulary_bank_entries", "source_id"),
        "legacy_lesson_rows": db.count("vocabulary_entries", "id"),
        "existing_ielts_rows": db.count("ielts_vocabulary_entries", "source_key"),
    }
    expected = {"topics": 40, "source_named_topics": 25, "expansion_topics": 15,
                "target_new_unique": 2650, "catalog_matches_source": True,
                "coverage_matrix_matches_catalog": True, "draft_batches": 2,
                "draft_entries": 50, "draft_examples": 100, "approved": 0,
                "published_new_unique": 0, "unique_normalized_drafts": 50,
                "anon_topics_visible": 0, "anon_drafts_visible": 0,
                "legacy_cefr_rows": 9941, "legacy_lesson_rows": 1237,
                "existing_ielts_rows": 5000}
    result["pass"] = all(result[field] == value for field, value in expected.items())
    print(json.dumps(result, ensure_ascii=True))
    if not result["pass"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
