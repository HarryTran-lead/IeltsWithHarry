"""Read-only Vocabulary bank query plans and synthetic learner RLS probe.

Uses a temporary Supabase CLI database login. No user account or PII is queried.
The synthetic role probe does not replace a real authenticated-session test.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import subprocess
from pathlib import Path


QUERIES = {
    "first_page": "SELECT source_id, headword FROM public.vocabulary_bank_entries WHERE student_visible ORDER BY headword, source_id LIMIT 20",
    "level_page": "SELECT source_id, headword FROM public.vocabulary_bank_entries WHERE student_visible AND study_lane = 'B1' ORDER BY headword, source_id LIMIT 20",
    "topic_page": "SELECT source_id, headword FROM public.vocabulary_bank_entries WHERE student_visible AND 'Environment & Climate' = ANY(topics) ORDER BY headword, source_id LIMIT 20",
    "search_page": "SELECT source_id, headword FROM public.vocabulary_bank_entries WHERE student_visible AND headword ILIKE '%climate%' ORDER BY headword, source_id LIMIT 20",
    "count_window": "SELECT source_id, headword, count(*) OVER() AS total_count FROM public.vocabulary_bank_entries WHERE student_visible ORDER BY headword, source_id LIMIT 20",
}


def backup_module():
    path = Path(__file__).with_name("vocabulary-v2-pg-backup.py")
    spec = importlib.util.spec_from_file_location("vocabulary_pg_backup", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Cannot load temporary connection helper")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--environment", choices=("development", "production"), required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parent.parent
    destination_dir = args.out_dir.resolve()
    if destination_dir.is_relative_to(repo):
        parser.error("Baseline output must be outside the repository")
    destination_dir.mkdir(parents=True, exist_ok=True)
    helper = backup_module()
    env = os.environ.copy()
    env.update(helper.temporary_connection(helper.PROJECTS[args.environment]))
    env["PGSSLMODE"] = "require"
    env["PGOPTIONS"] = "-c default_transaction_read_only=on"
    psql = helper.binary("psql")

    def query(sql: str) -> str:
        result = subprocess.run([psql, "--no-psqlrc", "--no-align", "--tuples-only", "--set=ON_ERROR_STOP=1", "--command", "SET ROLE postgres; " + sql],
                                env=env, capture_output=True, text=True, timeout=90)
        if result.returncode:
            detail = result.stderr.lower()
            reason = "permission" if "permission denied" in detail else "role" if "role" in detail else "connection" if "connection" in detail else "sql"
            raise RuntimeError(f"Read-only psql query failed (exit {result.returncode}, class {reason})")
        return "\n".join(line for line in result.stdout.splitlines() if line not in ("SET", "BEGIN", "ROLLBACK")).strip()

    plans = {}
    for name, sql in QUERIES.items():
        plan = json.loads(query("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + sql))[0]
        plans[name] = {
            "execution_ms": plan["Execution Time"],
            "planning_ms": plan["Planning Time"],
            "plan": plan["Plan"],
        }
    repeat = json.loads(query("EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) " + QUERIES["first_page"]))[0]
    plans["first_page_repeat"] = {
        "execution_ms": repeat["Execution Time"],
        "planning_ms": repeat["Planning Time"],
        "plan": repeat["Plan"],
    }
    policies = json.loads(query("SELECT coalesce(json_agg(json_build_object('name', policyname, 'roles', roles, 'cmd', cmd, 'using', qual, 'check', with_check)), '[]'::json) FROM pg_policies WHERE schemaname = 'public' AND tablename IN ('vocabulary_bank_entries', 'vocabulary_entries')"))
    indexes = json.loads(query("SELECT coalesce(json_agg(json_build_object('table', tablename, 'index', indexname, 'definition', indexdef)), '[]'::json) FROM pg_indexes WHERE schemaname = 'public' AND tablename IN ('vocabulary_bank_entries', 'vocabulary_entries')"))
    synthetic_uid = "00000000-0000-0000-0000-000000000001"
    learner_probe = query("BEGIN READ ONLY; SET LOCAL ROLE authenticated; SET LOCAL request.jwt.claim.sub = '" + synthetic_uid + "'; SELECT json_build_object('uid_present', auth.uid() IS NOT NULL, 'direct_bank_visible', (SELECT count(*) FROM public.vocabulary_bank_entries), 'rpc_visible', (SELECT count(*) FROM public.list_vocabulary_reference_by_level('', '', '', 0))); ROLLBACK;")
    learner_rows = [line for line in learner_probe.splitlines() if line.startswith("{")]
    if len(learner_rows) != 1:
        raise RuntimeError("Unexpected synthetic learner probe output")
    result = {
        "environment": args.environment,
        "project_ref": helper.PROJECTS[args.environment],
        "role_note": "Query plans run as temporary postgres role. Synthetic learner RLS probe uses a fake UID and authenticated role; it is not a real login test.",
        "plans": plans,
        "policies": policies,
        "indexes": indexes,
        "synthetic_learner": json.loads(learner_rows[0]),
    }
    destination = destination_dir / f"{args.environment}-query-baseline.json"
    destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"environment": args.environment,
                      "execution_ms": {name: round(value["execution_ms"], 3) for name, value in plans.items()},
                      "policy_count": len(policies), "index_count": len(indexes),
                      "synthetic_learner": result["synthetic_learner"]}))


if __name__ == "__main__":
    main()
