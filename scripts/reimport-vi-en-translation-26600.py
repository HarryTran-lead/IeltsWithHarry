"""Validate and stage the 26,600-sentence package for the existing VI→EN bank.

Dry run: python scripts/reimport-vi-en-translation-26600.py --zip ARCHIVE --expected-ref REF
Stage:   add --stage --backup-dir PRIVATE_DIRECTORY (outside the repository).
The SQL release function is invoked separately after staging verification.
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import json
import shutil
import subprocess
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from pathlib import Path


ARCHIVE_HASH = "39236784c010a73629ba466a05af4f366fd5fe96a32f00a73f3abc91ac97f151"
OLD_HASH = "e65755b317a8c3532fbcef82cdfc0df3f985af181b8b028f1c7d8d61ed6bccb6"
SOURCE = "01_MASTER/ALL_145_MILESTONES_26600_REPAIRED.jsonl"
SLOTS = {("speaking", "easy"), ("speaking", "hard"), ("writing", "easy"), ("writing", "hard")}
REFS = {"bhactqaxcvusmpeooxwi", "vpkhriywprepuhrbarye"}
QA_FIELDS = ("review_status", "repair_batch", "repair_reason", "repair_status", "qa_status",
             "needs_editorial_review", "editorial_focus", "authoring_method", "source_file")


def key_for(ref: str) -> str:
    executable = shutil.which("npx.cmd") or shutil.which("npx")
    if not executable:
        raise RuntimeError("npx is unavailable")
    result = subprocess.run([executable, "--yes", "supabase", "projects", "api-keys",
                             f"--remote={ref}", "--reveal", "--output", "json"],
                            capture_output=True, text=True, check=True)
    key = next((item["api_key"] for item in json.loads(result.stdout)
                if item.get("name") == "service_role"), "")
    if not key or key.startswith("["):
        raise RuntimeError("Production service key is unavailable")
    return key


def request(ref: str, key: str, path: str, rows: list[dict] | None = None):
    headers = {"apikey": key, "Authorization": f"Bearer {key}"}
    if rows is not None:
        headers.update({"Content-Type": "application/json", "Prefer": "resolution=merge-duplicates,return=minimal"})
    target = f"https://{ref}.supabase.co/rest/v1/{path}"
    req = urllib.request.Request(target,
        data=json.dumps(rows, ensure_ascii=False, separators=(",", ":")).encode("utf-8") if rows is not None else None,
        headers=headers, method="POST" if rows is not None else "GET")
    try:
        with urllib.request.urlopen(req, timeout=120) as response:
            raw = response.read()
            return json.loads(raw) if raw else None
    except urllib.error.HTTPError as error:
        raise RuntimeError(f"Supabase HTTP {error.code}: {error.read().decode('utf-8', 'replace')[:500]}") from None


def all_rows(ref: str, key: str, table: str, columns: str = "*", order: str = "id") -> list[dict]:
    result: list[dict] = []
    for offset in range(0, 50000, 1000):
        query = urllib.parse.urlencode({"select": columns, "limit": 1000, "offset": offset, "order": order})
        page = request(ref, key, f"{table}?{query}")
        result.extend(page)
        if len(page) < 1000:
            return result
    raise RuntimeError(f"Pagination limit reached for {table}")


def source_rows(archive: Path) -> list[dict]:
    if hashlib.sha256(archive.read_bytes()).hexdigest() != ARCHIVE_HASH:
        raise RuntimeError("ZIP checksum differs from the reviewed package")
    with zipfile.ZipFile(archive) as package, package.open(SOURCE) as stream:
        rows = [json.loads(line) for line in stream]
    if len(rows) != 26600:
        raise RuntimeError("Expected exactly 26,600 source exercises")
    ids = {row["exercise_id"] for row in rows}
    slots: dict[str, set[tuple[str, str]]] = collections.defaultdict(set)
    milestones = set()
    topics = set()
    for row in rows:
        slot = (row["mode"], row["level"])
        if slot not in SLOTS or slot in slots[row["vocab_id"]]:
            raise RuntimeError(f"Invalid or duplicate slot for {row['vocab_id']}")
        if not all(str(row.get(field, "")).strip() for field in
                   ("exercise_id", "vocab_id", "milestone", "topic", "term", "prompt_vi", "answer_en")):
            raise RuntimeError("Source has a missing required field")
        slots[row["vocab_id"]].add(slot)
        milestones.add(row["milestone"])
        topics.add(row["topic"])
    if (len(ids), len(slots), len(milestones), len(topics)) != (26600, 6650, 145, 40):
        raise RuntimeError("Source ID, vocabulary, milestone, or topic coverage differs")
    if set(milestones) != {f"M{i:03}" for i in range(1, 146)} or any(value != SLOTS for value in slots.values()):
        raise RuntimeError("Missing milestone or four-slot vocabulary item")
    return rows


def backup(ref: str, key: str, folder: Path, existing: list[dict]) -> None:
    folder.mkdir(parents=True, exist_ok=True)
    if any(folder.iterdir()):
        raise RuntimeError("Backup directory must be empty before staging")
    tables = {"vi_en_translation_exercises": existing}
    tables["user_vi_en_translation_progress"] = all_rows(ref, key, "user_vi_en_translation_progress", order="exercise_id")
    tables["user_vi_en_translation_attempts"] = all_rows(ref, key, "user_vi_en_translation_attempts")
    manifest = {"target_ref": ref, "source_archive_sha256": ARCHIVE_HASH, "tables": {}}
    for table, rows in tables.items():
        destination = folder / f"{table}.jsonl"
        content = "".join(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n" for row in rows).encode("utf-8")
        destination.write_bytes(content)
        manifest["tables"][table] = {"rows": len(rows), "sha256": hashlib.sha256(content).hexdigest()}
    (folder / "manifest.json").write_text(json.dumps(manifest, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"backup": str(folder), "row_counts": {table: len(rows) for table, rows in tables.items()}}, ensure_ascii=False))


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zip", required=True, type=Path)
    parser.add_argument("--expected-ref", required=True, choices=sorted(REFS))
    parser.add_argument("--stage", action="store_true")
    parser.add_argument("--backup-dir", type=Path)
    args = parser.parse_args()
    if args.stage and not args.backup_dir:
        parser.error("--stage requires --backup-dir")

    source = source_rows(args.zip)
    key = key_for(args.expected_ref)
    existing = all_rows(args.expected_ref, key, "vi_en_translation_exercises")
    old_by_slot = {(row["source_item_id"], row["mode"]): row for row in existing}
    easy = [row for row in source if row["level"] == "easy"]
    if len(existing) != 13300 or len(old_by_slot) != 13300:
        raise RuntimeError("Existing exercise count or source-item mapping changed")
    if any(row["status"] != "published" or row["review_origin"] != "owner_authorized_bulk"
           or row["source_archive_sha256"] != OLD_HASH or row.get("source_exercise_id") is not None
           or not row["canonical_source_key"] or not row["meaning_vi"].strip() for row in existing):
        raise RuntimeError("Existing content is no longer the expected owner-authorized bank")
    for row in easy:
        old = old_by_slot.get((row["vocab_id"], row["mode"]))
        if not old or old["topic"] != row["topic"] or old["term"] != row["term"]:
            raise RuntimeError(f"Source-to-existing mapping differs for {row['vocab_id']}")
    report = {
        "archive_sha256": ARCHIVE_HASH, "existing_published": len(existing),
        "source_exercises": len(source), "source_vocabulary": 6650, "milestones": 145,
        "easy_to_update": len(easy), "hard_to_insert": len(source) - len(easy),
        "easy_sentence_pairs_changed": sum(
            old_by_slot[(row["vocab_id"], row["mode"])]["prompt_vi"] != row["prompt_vi"]
            or old_by_slot[(row["vocab_id"], row["mode"])]["reference_en"] != row["answer_en"]
            for row in easy),
    }
    print(json.dumps(report, ensure_ascii=False))
    if not args.stage:
        return
    backup(args.expected_ref, key, args.backup_dir.resolve(), existing)
    prepared = []
    for row in source:
        raw = json.dumps(row, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        prepared.append({
            "source_exercise_id": row["exercise_id"], "source_archive_sha256": ARCHIVE_HASH,
            "source_item_id": row["vocab_id"], "milestone": row["milestone"],
            "topic": row["topic"], "term": row["term"], "mode": row["mode"],
            "difficulty": row["level"], "prompt_vi": row["prompt_vi"],
            "reference_en": row["answer_en"], "source_hash": hashlib.sha256(raw).hexdigest(),
            "metadata": {name: row.get(name, "") for name in QA_FIELDS},
        })
    for offset in range(0, len(prepared), 200):
        request(args.expected_ref, key, "vi_en_translation_import_rows?on_conflict=source_exercise_id",
                prepared[offset:offset + 200])
        if (offset + 200) % 5000 < 200:
            print(f"Staged {min(offset + 200, len(prepared))}/{len(prepared)}")
    query = urllib.parse.urlencode({"select": "source_exercise_id", "source_archive_sha256": f"eq.{ARCHIVE_HASH}", "limit": 1})
    # PostgREST exact count via a bounded GET; the server returns Content-Range.
    req = urllib.request.Request(f"https://{args.expected_ref}.supabase.co/rest/v1/vi_en_translation_import_rows?{query}",
                                 headers={"apikey": key, "Authorization": f"Bearer {key}", "Prefer": "count=exact"})
    with urllib.request.urlopen(req, timeout=120) as response:
        total = int(response.headers["Content-Range"].split("/")[-1])
    if total != 26600:
        raise RuntimeError(f"Staging count is {total}, expected 26,600")
    print(json.dumps({"staged": total, "archive_sha256": ARCHIVE_HASH}))


if __name__ == "__main__":
    main()
