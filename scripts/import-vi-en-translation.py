"""Verify and import the 6,650-item VI->EN archive as private editorial drafts.

Dry run by default. --apply requires an explicit Supabase project ref and env file.
Existing exercises are never overwritten, so editor changes and learner progress survive reruns.
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import os
import re
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path

REFS = {"bhactqaxcvusmpeooxwi", "vpkhriywprepuhrbarye"}
FIELDS = ("id", "topic", "term", "exercise_set_id", "speaking_vi", "speaking_en", "writing_vi", "writing_en")


def request(ref: str, key: str, path: str, *, data: list[dict] | None = None):
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    if data is not None:
        headers.update({"Content-Type": "application/json", "Prefer": "resolution=ignore-duplicates,return=minimal"})
    req = urllib.request.Request(
        f"https://{ref}.supabase.co/rest/v1/{path}",
        data=json.dumps(data, ensure_ascii=False).encode("utf-8") if data is not None else None,
        headers=headers, method="POST" if data is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"Supabase HTTP {error.code}: {error.read().decode('utf-8', 'replace')[:500]}") from None


def all_rows(ref: str, key: str, table: str, columns: str):
    result = []
    for offset in range(0, 50000, 1000):
        query = urllib.parse.urlencode({"select": columns, "limit": 1000, "offset": offset})
        page = request(ref, key, f"{table}?{query}")
        result.extend(page)
        if len(page) < 1000:
            return result
    raise RuntimeError(f"Pagination limit reached: {table}")


def env_value(path: Path, name: str):
    for line in path.read_text(encoding="utf-8-sig").splitlines():
        if line.startswith(name + "="):
            return line.split("=", 1)[1].strip().strip('"')
    return ""


def normalized(term: str):
    return re.sub(r"\s+", " ", term.strip()).casefold()


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zip", type=Path, required=True)
    parser.add_argument("--apply", action="store_true")
    parser.add_argument("--expected-ref", choices=sorted(REFS))
    parser.add_argument("--env-file", type=Path)
    args = parser.parse_args()
    if args.apply and (not args.expected_ref or not args.env_file):
        parser.error("--apply needs --expected-ref and --env-file")
    archive_bytes = args.zip.read_bytes()
    archive_hash = hashlib.sha256(archive_bytes).hexdigest()
    with zipfile.ZipFile(args.zip) as archive:
        name = next(name for name in archive.namelist() if name.endswith("/data/master/ALL_6650_FULL_BILINGUAL.jsonl"))
        source = [json.loads(line) for line in archive.read(name).decode("utf-8-sig").splitlines() if line.strip()]
    if len(source) != 6650 or len({r["id"] for r in source}) != 6650 or len({r["exercise_set_id"] for r in source}) != 6650:
        raise RuntimeError("Master count or IDs differ from 6,650 unique items")
    if len({r["topic"] for r in source}) != 40 or any(not all(str(r.get(k, "")).strip() for k in FIELDS) for r in source):
        raise RuntimeError("Master topics or required fields are incomplete")
    topics = collections.Counter(r["topic"] for r in source)
    print(json.dumps({"archive_sha256": archive_hash, "topics": len(topics), "items": len(source),
                      "exercises": len(source) * 2, "missing_meaning_vi": sum(not r.get("meaning_vi", "").strip() for r in source)}, ensure_ascii=False))
    if not args.apply:
        print(json.dumps({"topic_items": topics}, ensure_ascii=False, sort_keys=True))
        return

    ref = args.expected_ref
    url = env_value(args.env_file, "NEXT_PUBLIC_SUPABASE_URL")
    key = env_value(args.env_file, "SUPABASE_SERVICE_ROLE_KEY")
    if url.rstrip("/") != f"https://{ref}.supabase.co" or not key:
        raise RuntimeError("Env file does not match the explicit target ref or service key is absent")
    canon = all_rows(ref, key, "ielts_vocabulary_entries", "source_key,normalized_term")
    by_term = {r["normalized_term"].casefold(): r["source_key"] for r in canon}
    existing = {r["id"]: r for r in all_rows(ref, key, "vi_en_translation_exercises", "id,source_hash,status")}
    prepared = []
    unmatched = 0
    for item in source:
        canonical = by_term.get(normalized(item["term"]))
        unmatched += canonical is None
        row_hash = hashlib.sha256(json.dumps(item, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()
        for mode in ("speaking", "writing"):
            prepared.append({
                "id": f"{item['exercise_set_id']}:{mode}", "source_item_id": item["id"],
                "exercise_set_id": item["exercise_set_id"], "mode": mode, "topic": item["topic"],
                "term": item["term"], "canonical_source_key": canonical,
                "meaning_vi": item.get("meaning_vi", ""), "pos": item.get("pos", ""),
                "pattern": item.get("pattern", ""), "collocations": item.get("collocations", ""),
                "prompt_vi": item[f"{mode}_vi"], "reference_en": item[f"{mode}_en"],
                "source_ref": item.get("source_ref", ""), "source_hash": row_hash,
                "source_archive_sha256": archive_hash,
                "metadata": {key: item.get(key, "") for key in (
                    "source_group", "cefr", "priority", "content_status", "qa_status", "authoring_round",
                    "context_reuse_tier", "construction_method", "target_term_usage", "editorial_flag", "reused_from_id")},
                "status": "draft",
            })
    new = [row for row in prepared if row["id"] not in existing]
    conflicts = [row["id"] for row in prepared if row["id"] in existing and existing[row["id"]]["source_hash"] != row["source_hash"]]
    print(json.dumps({"canonical_matches": len(source) - unmatched, "unmatched_canonical_items": unmatched,
                      "existing_exercises": len(existing), "to_insert": len(new), "unchanged": len(prepared) - len(new) - len(conflicts),
                      "source_conflicts_preserved": len(conflicts)}, ensure_ascii=False))
    for offset in range(0, len(new), 50):  # 25 source items = 50 exercise variants
        request(ref, key, "vi_en_translation_exercises?on_conflict=id", data=new[offset:offset + 50])
        if (offset // 50 + 1) % 25 == 0:
            print(f"Imported {min(offset + 50, len(new))}/{len(new)} new draft exercises")
    verified = all_rows(ref, key, "vi_en_translation_exercises", "id,source_hash,status")
    imported = {row["id"]: row for row in verified}
    missing = [row["id"] for row in prepared if row["id"] not in imported]
    if missing:
        raise RuntimeError(f"Verification failed: {len(missing)} exercise IDs missing")
    print(json.dumps({"verified_total": len(verified), "archive_exercises_present": len(prepared),
                      "draft": sum(row["status"] == "draft" for row in verified),
                      "published": sum(row["status"] == "published" for row in verified)}, ensure_ascii=False))


if __name__ == "__main__":
    main()
