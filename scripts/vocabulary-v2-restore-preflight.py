"""Read-only preflight for an explicitly named empty Supabase restore target.

This script refuses the known Development and Production project refs. It does not
restore, reset, clean, or modify a database, and never prints login credentials.
"""

from __future__ import annotations

import argparse
import importlib.util
import json
import os
import re
import subprocess
from pathlib import Path


SOURCE_REFS = {"bhactqaxcvusmpeooxwi", "vpkhriywprepuhrbarye"}


def helper_module():
    path = Path(__file__).with_name("vocabulary-v2-pg-backup.py")
    spec = importlib.util.spec_from_file_location("vocabulary_pg_backup", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Cannot load temporary connection helper")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--target-ref", required=True)
    args = parser.parse_args()
    ref = args.target_ref.strip()
    if ref in SOURCE_REFS or not re.fullmatch(r"[a-z0-9]{20}", ref):
        parser.error("Target ref must be a separate 20-character lowercase Supabase project")
    helper = helper_module()
    cmd = (["cmd.exe", "/c", "npx", "--yes", "supabase"] if os.name == "nt" else ["npx", "--yes", "supabase"])
    project_list = subprocess.run(cmd + ["projects", "list", "--output", "json"],
                                  capture_output=True, text=True, timeout=90, check=True)
    project = next((item for item in json.loads(project_list.stdout) if item.get("ref") == ref), None)
    if project is None:
        parser.error("Target ref is not in accessible Supabase projects")
    if project.get("status") != "ACTIVE_HEALTHY":
        parser.error("Target project is not active and healthy")
    env = os.environ.copy()
    env.update(helper.temporary_connection(ref))
    env["PGSSLMODE"] = "require"
    env["PGOPTIONS"] = "-c default_transaction_read_only=on"
    sql = """
      SET ROLE postgres;
      SELECT json_build_object(
        'server_version', current_setting('server_version'),
        'non_extension_public_tables', (
          SELECT coalesce(json_agg(c.relname ORDER BY c.relname), '[]'::json)
          FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
          WHERE n.nspname = 'public' AND c.relkind IN ('r', 'p')
            AND NOT EXISTS (SELECT 1 FROM pg_depend d WHERE d.objid = c.oid AND d.deptype = 'e')
        ),
        'auth_users', (SELECT count(*) FROM auth.users),
        'storage_objects', (SELECT count(*) FROM storage.objects),
        'installed_extensions', (SELECT coalesce(json_agg(extname ORDER BY extname), '[]'::json) FROM pg_extension)
      );
    """
    result = subprocess.run([helper.binary("psql"), "--no-psqlrc", "--no-align", "--tuples-only", "--set=ON_ERROR_STOP=1", "--command", sql],
                            env=env, capture_output=True, text=True, timeout=90)
    if result.returncode:
        raise RuntimeError("Read-only target preflight failed")
    payload_lines = [line for line in result.stdout.splitlines() if line.startswith("{")]
    if len(payload_lines) != 1:
        raise RuntimeError("Unexpected target preflight output")
    summary = json.loads(payload_lines[0])
    summary.update({"project_ref": ref, "project_name": project.get("name"), "status": project.get("status")})
    summary["empty_for_restore"] = not summary["non_extension_public_tables"] and summary["auth_users"] == 0 and summary["storage_objects"] == 0
    print(json.dumps(summary, ensure_ascii=False))


if __name__ == "__main__":
    main()
