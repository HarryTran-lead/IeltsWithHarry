"""Read-only Vocabulary V2 inventory and exact-headword dry-run.

Usage: python scripts/vocabulary-v2-phase1-audit.py --archive PATH --out-dir PATH

The CSV diff contains source terms and database source IDs. Keep its output private.
No database writes are made; Supabase service keys stay in process memory.
"""

from __future__ import annotations

import argparse
import collections
import csv
import hashlib
import io
import json
import os
import re
import subprocess
import sys
import unicodedata
import urllib.error
import urllib.parse
import urllib.request
import zipfile
from datetime import datetime, timezone
from pathlib import Path


PROJECTS = {
    "development": "bhactqaxcvusmpeooxwi",
    "production": "vpkhriywprepuhrbarye",
}
PAGE_SIZE = 1000


def normalized(value: str) -> str:
    return " ".join(unicodedata.normalize("NFKC", value).casefold().split())


def variant_keys(value: str) -> set[str]:
    """Conservative spelling/punctuation leads for review, never auto-merge."""
    term = normalized(value)
    candidates = {term.replace("’", "'"), term.replace("'", "’")}
    if "-" in term:
        candidates.add(term.replace("-", " "))
    if " " in term:
        candidates.add(term.replace(" ", "-"))
    for left, right in (("isation", "ization"), ("ise", "ize"), ("our", "or"), ("re", "er")):
        if left in term:
            candidates.add(term.replace(left, right))
        if right in term:
            candidates.add(term.replace(right, left))
    return {candidate for candidate in candidates if candidate != term}


def sha256_bytes(value: bytes) -> str:
    return hashlib.sha256(value).hexdigest()


def sha256_json(value: object) -> str:
    return sha256_bytes(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8"))


def source_rows(archive: Path) -> tuple[list[dict[str, str]], dict[str, object]]:
    names = subprocess.run(["tar", "-tf", str(archive)], check=True, capture_output=True, text=True).stdout.splitlines()
    files = sorted(name for name in names if name.lower().endswith(".csv"))
    if not files:
        raise ValueError("Archive contains no CSV files")
    rows: list[dict[str, str]] = []
    per_file: dict[str, int] = {}
    topic_counts: collections.Counter[str] = collections.Counter()
    example_counts: collections.Counter[int] = collections.Counter()
    missing: collections.Counter[str] = collections.Counter()
    expected = {"Term", "Definition", "Part of speech", "Pattern", "Examples", "Topic"}
    for filename in files:
        payload = subprocess.run(["tar", "-xOf", str(archive), filename], check=True, capture_output=True).stdout
        reader = csv.DictReader(io.StringIO(payload.decode("utf-8-sig"), newline=""), strict=True)
        if set(reader.fieldnames or []) != expected:
            raise ValueError(f"Unexpected CSV header in {filename}")
        count = 0
        for source_row, row in enumerate(reader, start=1):
            if None in row:
                raise ValueError(f"Unexpected extra columns in {filename}, row {source_row}")
            count += 1
            for field in expected:
                if not row[field] or not row[field].strip():
                    missing[field] += 1
            examples = row["Examples"].split(" | ")
            if any(not value.strip() for value in examples):
                raise ValueError(f"Empty example in {filename}, row {source_row}")
            example_counts[len(examples)] += 1
            topic_counts[row["Topic"]] += 1
            rows.append({**row, "source_file": Path(filename).name, "source_row": str(source_row)})
        per_file[Path(filename).name] = count
    terms = collections.Counter(normalized(row["Term"]) for row in rows)
    if any(not key for key in terms):
        raise ValueError("Empty normalized term")
    report: dict[str, object] = {
        "archive_sha256": sha256_bytes(archive.read_bytes()),
        "csv_files": len(files),
        "source_rows": len(rows),
        "source_topics": len(topic_counts),
        "per_file_rows": per_file,
        "per_topic_rows": dict(sorted(topic_counts.items())),
        "unique_normalized_terms": len(terms),
        "duplicate_normalized_terms": sum(count - 1 for count in terms.values() if count > 1),
        "missing_required_fields": dict(missing),
        "example_count_distribution": dict(sorted(example_counts.items())),
        "total_examples": sum(length * count for length, count in example_counts.items()),
    }
    return rows, report


def service_key(ref: str) -> str:
    cmd = (["cmd.exe", "/c", "npx", "--yes", "supabase"] if os.name == "nt" else ["npx", "--yes", "supabase"])
    cmd += ["projects", "api-keys", "--project-ref", ref, "--output", "json"]
    kwargs: dict[str, object] = {}
    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
    result = subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=60, **kwargs)
    keys = json.loads(result.stdout)
    key = next((row.get("api_key") for row in keys if row.get("id") == "service_role"), None)
    if not key:
        raise RuntimeError(f"No service role key available for {ref}")
    return key


class ReadOnlyProject:
    def __init__(self, ref: str):
        if ref not in PROJECTS.values():
            raise ValueError("Project ref is outside the Vocabulary audit allowlist")
        self.base = f"https://{ref}.supabase.co/rest/v1/"
        self.key = service_key(ref)

    def request(self, table: str, select: str, start: int, end: int, filters: dict[str, str] | None = None) -> tuple[list[dict], str]:
        params = {"select": select, **(filters or {})}
        url = self.base + table + "?" + urllib.parse.urlencode(params)
        request = urllib.request.Request(url, headers={
            "apikey": self.key,
            "Authorization": f"Bearer {self.key}",
            "Prefer": "count=exact",
            "Range": f"{start}-{end}",
            "Accept": "application/json",
        }, method="GET")
        try:
            with urllib.request.urlopen(request, timeout=45) as response:
                return json.load(response), response.headers.get("Content-Range", "")
        except urllib.error.HTTPError as error:
            detail = error.read().decode("utf-8", errors="replace")[:300]
            raise RuntimeError(f"Read failed for {table}: HTTP {error.code}: {detail}") from None

    def rows(self, table: str, select: str, filters: dict[str, str] | None = None) -> list[dict]:
        result: list[dict] = []
        for offset in range(0, 1_000_000, PAGE_SIZE):
            page, _ = self.request(table, select, offset, offset + PAGE_SIZE - 1, filters)
            result.extend(page)
            if len(page) < PAGE_SIZE:
                return result
        raise RuntimeError(f"Pagination limit reached for {table}")

    def count(self, table: str, select: str = "*") -> int:
        _, content_range = self.request(table, select, 0, 0)
        match = re.search(r"/(\d+)$", content_range)
        if not match:
            raise RuntimeError(f"Missing exact count for {table}: {content_range!r}")
        return int(match.group(1))


def project_inventory(name: str, ref: str) -> tuple[dict[str, object], dict[str, list[dict]]]:
    db = ReadOnlyProject(ref)
    bank = db.rows("vocabulary_bank_entries", "source_id,headword,topics,published,student_visible,cefr,study_lane,source_name")
    lessons = db.rows("vocabulary_entries", "id,word,lesson_id")
    word_rows = db.rows("notebook_entries", "id,user_id,title,created_at", {"kind": "eq.word"})
    reviews = db.rows("user_word_reviews", "user_id,notebook_entry_id,due_at,interval_days,repetitions,last_reviewed_at,fsrs_state")
    bank_topics = sorted({topic for row in bank for topic in (row.get("topics") or [])})
    progress_tables = {
        "notebook_entries_all": ("notebook_entries", "id"),
        "notebook_words": ("notebook_entries", "id"),
        "user_word_reviews": ("user_word_reviews", "notebook_entry_id"),
        "vocabulary_review_events": ("vocabulary_review_events", "id"),
        "vocabulary_practice_attempts": ("vocabulary_practice_attempts", "id"),
        "vocabulary_decks": ("vocabulary_decks", "id"),
        "vocabulary_deck_cards": ("vocabulary_deck_cards", "notebook_entry_id"),
    }
    counts = {label: db.count(table, select) for label, (table, select) in progress_tables.items() if label != "notebook_words"}
    counts["notebook_words"] = len(word_rows)
    counts["vocabulary_bank_entries"] = len(bank)
    counts["vocabulary_entries"] = len(lessons)
    inventory: dict[str, object] = {
        "environment": name,
        "project_ref": ref,
        "counts": counts,
        "bank_published": sum(bool(row["published"]) for row in bank),
        "bank_student_visible": sum(bool(row["student_visible"]) for row in bank),
        "bank_unique_normalized_headwords": len({normalized(row["headword"]) for row in bank}),
        "bank_source_names": dict(sorted(collections.Counter(row["source_name"] for row in bank).items())),
        "bank_topic_labels": bank_topics,
        "bank_content_fingerprint_sha256": sha256_json(sorted(bank, key=lambda row: row["source_id"])),
        "lesson_content_fingerprint_sha256": sha256_json(sorted(lessons, key=lambda row: row["id"])),
        "notebook_word_identity_fingerprint_sha256": sha256_json(sorted((row["id"], row["user_id"], normalized(row["title"])) for row in word_rows)),
        "word_review_fingerprint_sha256": sha256_json(sorted(reviews, key=lambda row: (row["user_id"], row["notebook_entry_id"]))),
    }
    return inventory, {"bank": bank, "lessons": lessons}


def private_logical_snapshot(name: str, ref: str, output: Path) -> dict[str, object]:
    """Export Vocabulary-related rows privately; this is not a full PostgreSQL dump."""
    db = ReadOnlyProject(ref)
    tables = [
        "vocabulary_bank_entries", "vocabulary_entries", "notebook_entries",
        "user_word_reviews", "vocabulary_review_events", "vocabulary_practice_attempts",
        "vocabulary_decks", "vocabulary_deck_cards",
    ]
    manifest: dict[str, object] = {
        "environment": name,
        "project_ref": ref,
        "snapshot_kind": "PRIVATE_LOGICAL_VOCABULARY_ROWS_NOT_FULL_DATABASE_BACKUP",
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "tables": {},
    }
    path = output / f"{name}-vocabulary-logical-snapshot.zip"
    with zipfile.ZipFile(path, "w", compression=zipfile.ZIP_DEFLATED, compresslevel=6) as archive:
        for table in tables:
            records = db.rows(table, "*")
            payload = json.dumps(records, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
            archive.writestr(f"{table}.json", payload)
            manifest["tables"][table] = {"rows": len(records), "sha256": sha256_bytes(payload)}
        tasks = db.rows("study_tasks", "*", {"skill": "in.(Vocabulary,Review)"})
        payload = json.dumps(tasks, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")
        archive.writestr("study_tasks_vocabulary_review.json", payload)
        manifest["tables"]["study_tasks_vocabulary_review"] = {"rows": len(tasks), "sha256": sha256_bytes(payload)}
        archive.writestr("manifest.json", json.dumps(manifest, ensure_ascii=False, indent=2).encode("utf-8"))
    manifest["archive_sha256"] = sha256_bytes(path.read_bytes())
    manifest["archive_file"] = path.name
    return manifest


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    parser.add_argument("--private-backup", action="store_true", help="Save full Vocabulary row snapshots in the private output directory")
    args = parser.parse_args()
    if not args.archive.is_file():
        parser.error("Archive path does not exist")
    repository = Path(__file__).resolve().parent.parent
    if args.out_dir.resolve().is_relative_to(repository):
        parser.error("Output directory must be outside the repository; reports and snapshots are private")
    args.out_dir.mkdir(parents=True, exist_ok=True)
    rows, source = source_rows(args.archive)
    inventories: dict[str, dict[str, object]] = {}
    indexes: dict[str, dict[str, dict[str, list[dict]]]] = {}
    for name, ref in PROJECTS.items():
        inventory, content = project_inventory(name, ref)
        inventories[name] = inventory
        indexes[name] = {
            "bank": collections.defaultdict(list),
            "lessons": collections.defaultdict(list),
        }
        for record in content["bank"]:
            indexes[name]["bank"][normalized(record["headword"])].append(record)
        for record in content["lessons"]:
            indexes[name]["lessons"][normalized(record["word"])].append(record)
    diff_path = args.out_dir / "import_diff_exact_candidates.csv"
    summary: dict[str, collections.Counter[str]] = {name: collections.Counter() for name in PROJECTS}
    variant_summary: dict[str, int] = {name: 0 for name in PROJECTS}
    with diff_path.open("w", encoding="utf-8-sig", newline="") as stream:
        writer = csv.writer(stream)
        writer.writerow(["source_file", "source_row", "term", "source_topic", "source_record_sha256", "example_count",
                         "development_candidate", "development_bank_source_ids", "development_lesson_ids", "development_variant_headwords",
                         "production_candidate", "production_bank_source_ids", "production_lesson_ids", "production_variant_headwords"])
        for row in rows:
            key = normalized(row["Term"])
            source_hash = sha256_json({field: row[field] for field in ("Term", "Definition", "Part of speech", "Pattern", "Examples", "Topic")})
            values: list[str] = []
            for name in PROJECTS:
                bank_matches = indexes[name]["bank"].get(key, [])
                lesson_matches = indexes[name]["lessons"].get(key, [])
                if len(bank_matches) > 1:
                    candidate = "MULTIPLE_BANK_RECORDS_REVIEW"
                elif bank_matches and lesson_matches:
                    candidate = "BANK_AND_LESSON_EXACT_REVIEW"
                elif bank_matches:
                    candidate = "BANK_EXACT_REVIEW"
                elif lesson_matches:
                    candidate = "LESSON_EXACT_REVIEW"
                else:
                    candidate = "NO_EXACT_MATCH_REVIEW"
                variants = sorted({
                    record["headword"] for variant in variant_keys(row["Term"])
                    for record in indexes[name]["bank"].get(variant, [])
                } | {
                    record["word"] for variant in variant_keys(row["Term"])
                    for record in indexes[name]["lessons"].get(variant, [])
                }) if candidate == "NO_EXACT_MATCH_REVIEW" else []
                if variants:
                    variant_summary[name] += 1
                summary[name][candidate] += 1
                values.extend([candidate, ";".join(item["source_id"] for item in bank_matches),
                               ";".join(item["id"] for item in lesson_matches), ";".join(variants)])
            writer.writerow([row["source_file"], row["source_row"], row["Term"], row["Topic"], source_hash,
                             len(row["Examples"].split(" | ")), *values])
    report = {
        "generated_at_utc": datetime.now(timezone.utc).isoformat(),
        "mode": "READ_ONLY_EXACT_HEADWORD_CANDIDATES_NOT_IMPORT_DECISIONS",
        "source": source,
        "projects": inventories,
        "exact_candidate_counts": {name: dict(sorted(counts.items())) for name, counts in summary.items()},
        "variant_candidate_rows_among_no_exact": variant_summary,
        "diff_file": diff_path.name,
        "limitations": ["Headword matching does not establish sense equivalence", "No database backup or restore is performed by this script"],
    }
    if args.private_backup:
        report["private_snapshots"] = {
            name: private_logical_snapshot(name, ref, args.out_dir)
            for name, ref in PROJECTS.items()
        }
    report_path = args.out_dir / "phase1-read-only-report.json"
    report_path.write_text(json.dumps(report, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"report": str(report_path), "diff": str(diff_path), "summary": report["exact_candidate_counts"],
                      "project_counts": {name: value["counts"] for name, value in inventories.items()}}, ensure_ascii=False))


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"Vocabulary audit failed: {error}", file=sys.stderr)
        raise SystemExit(1) from None
