"""Read-only post-import checks for the two separate vocabulary collections."""

from __future__ import annotations

import argparse
import collections
import importlib.util
import json
import os
import subprocess
import urllib.parse
import urllib.request
from pathlib import Path


PROJECTS = {"development": "bhactqaxcvusmpeooxwi", "production": "vpkhriywprepuhrbarye"}
EXPECTED_BANDS = {"1": 89, "2": 356, "3": 912, "4": 1258, "5": 1084, "6": 736, "7+": 565}
EXPECTED_ARCHIVE = "9add911cefcecf45cc6d1fbe4f947f0f38387ba0f3399ab07d2e55a1df738674"


def local_module(name: str):
    path = Path(__file__).with_name(name)
    spec = importlib.util.spec_from_file_location(name.removesuffix(".py").replace("-", "_"), path)
    if spec is None or spec.loader is None:
        raise RuntimeError(f"Cannot load {name}")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--environment", choices=PROJECTS, required=True)
    args = parser.parse_args()
    ref = PROJECTS[args.environment]
    audit = local_module("vocabulary-v2-phase1-audit.py")
    helper = local_module("vocabulary-v2-pg-backup.py")
    db = audit.ReadOnlyProject(ref)
    rows = db.rows("ielts_vocabulary_entries", "source_key,examples,band_level,band_method,topic,published,source_archive_sha256")
    result = {
        "environment": args.environment,
        "cefr_bank_rows": db.count("vocabulary_bank_entries", "source_id"),
        "legacy_lesson_rows": db.count("vocabulary_entries", "id"),
        "ielts_rows": len(rows),
        "ielts_examples": sum(len(row["examples"]) for row in rows),
        "ielts_topics": len({row["topic"] for row in rows}),
        "suggested_band_counts": dict(sorted(collections.Counter(row["band_level"] for row in rows).items())),
        "all_published": all(row["published"] for row in rows),
        "all_suggested": all(row["band_method"] == "suggested" for row in rows),
        "archive_matches": all(row["source_archive_sha256"] == EXPECTED_ARCHIVE for row in rows),
    }
    anon_key = next((key.get("api_key") for key in json.loads(subprocess.run(
        (["cmd.exe", "/c", "npx", "--yes", "supabase"] if os.name == "nt" else ["npx", "--yes", "supabase"])
        + ["projects", "api-keys", "--project-ref", ref, "--output", "json"],
        capture_output=True, text=True, check=True, timeout=60).stdout)
        if key.get("id") == "anon"), None)
    if not anon_key:
        raise RuntimeError("Anon key unavailable")
    url = f"https://{ref}.supabase.co/rest/v1/ielts_vocabulary_entries?" + urllib.parse.urlencode({"select": "source_key", "limit": "1"})
    request = urllib.request.Request(url, headers={"apikey": anon_key, "Authorization": f"Bearer {anon_key}"})
    with urllib.request.urlopen(request, timeout=30) as response:
        result["anon_visible_rows_in_probe"] = len(json.load(response))
    env = os.environ.copy()
    env.update(helper.temporary_connection(ref))
    env["PGSSLMODE"] = "require"
    env["PGOPTIONS"] = "-c default_transaction_read_only=on"
    sql = "SET ROLE postgres; BEGIN READ ONLY; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '00000000-0000-0000-0000-000000000001'; SELECT count(*) FROM public.ielts_vocabulary_entries; ROLLBACK;"
    probe = subprocess.run([helper.binary("psql"), "--no-psqlrc", "--no-align", "--tuples-only", "--set=ON_ERROR_STOP=1", "--command", sql],
                           env=env, capture_output=True, text=True, timeout=90)
    if probe.returncode:
        raise RuntimeError("Synthetic learner probe failed")
    counts = [line.strip() for line in probe.stdout.splitlines() if line.strip().isdigit()]
    if len(counts) != 1:
        raise RuntimeError("Unexpected synthetic learner probe output")
    result["synthetic_learner_visible_rows"] = int(counts[0])
    expected = {"cefr_bank_rows": 9941, "legacy_lesson_rows": 1237, "ielts_rows": 5000,
                "ielts_examples": 10002, "ielts_topics": 25, "suggested_band_counts": EXPECTED_BANDS,
                "all_published": True, "all_suggested": True, "archive_matches": True,
                "anon_visible_rows_in_probe": 0, "synthetic_learner_visible_rows": 5000}
    result["pass"] = all(result[key] == value for key, value in expected.items())
    print(json.dumps(result, ensure_ascii=False))
    if not result["pass"]:
        raise SystemExit(1)


if __name__ == "__main__":
    main()
