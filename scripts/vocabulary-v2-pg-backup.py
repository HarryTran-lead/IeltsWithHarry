"""Create a private read-only PostgreSQL dump using a Supabase CLI temporary login.

Usage: python scripts/vocabulary-v2-pg-backup.py --environment development --out-dir PATH

Requires Supabase CLI login and a local PostgreSQL pg_dump/pg_restore installation.
This script never prints or stores temporary database credentials.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import os
import re
import shutil
import subprocess
import sys
from pathlib import Path


PROJECTS = {
    "development": "bhactqaxcvusmpeooxwi",
    "production": "vpkhriywprepuhrbarye",
}


def binary(name: str) -> str:
    found = shutil.which(name)
    if found:
        return found
    candidate = Path(r"C:\Program Files\PostgreSQL\18\bin") / (name + ".exe")
    if candidate.is_file():
        return str(candidate)
    raise RuntimeError(f"{name} is not installed")


def temporary_connection(ref: str) -> dict[str, str]:
    cmd = (["cmd.exe", "/c", "npx", "--yes", "supabase"] if os.name == "nt" else ["npx", "--yes", "supabase"])
    cmd += ["db", "dump", "--project-ref", ref, "--dry-run"]
    kwargs: dict[str, object] = {}
    if os.name == "nt":
        kwargs["creationflags"] = subprocess.CREATE_NO_WINDOW
    result = subprocess.run(cmd, check=True, capture_output=True, text=True, timeout=90, **kwargs)
    values: dict[str, str] = {}
    for line in result.stdout.splitlines():
        match = re.match(r"^(?:export )?(PGHOST|PGPORT|PGUSER|PGPASSWORD|PGDATABASE)=(\".*\")$", line.strip())
        if match:
            values[match.group(1)] = json.loads(match.group(2))
    if set(values) != {"PGHOST", "PGPORT", "PGUSER", "PGPASSWORD", "PGDATABASE"}:
        raise RuntimeError("Supabase CLI did not provide complete temporary connection variables")
    if not values["PGHOST"].endswith(".supabase.com") or not values["PGPORT"].isdigit() or not values["PGPASSWORD"]:
        raise RuntimeError("Unexpected Supabase connection metadata")
    return values


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--environment", choices=PROJECTS, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    args = parser.parse_args()
    repository = Path(__file__).resolve().parent.parent
    if args.out_dir.resolve().is_relative_to(repository):
        parser.error("Backup output must be outside the repository")
    args.out_dir.mkdir(parents=True, exist_ok=True)
    destination = args.out_dir / f"{args.environment}-postgres-full.dump"
    if destination.exists():
        parser.error(f"Backup already exists: {destination}; move it privately before rerunning")
    pg_dump = binary("pg_dump")
    pg_restore = binary("pg_restore")
    env = os.environ.copy()
    env.update(temporary_connection(PROJECTS[args.environment]))
    env["PGSSLMODE"] = "require"
    try:
        dump = subprocess.run([pg_dump, "--format=custom", "--role=postgres", "--file", str(destination)],
                              env=env, capture_output=True, text=True, timeout=900)
        if dump.returncode:
            message = dump.stderr.lower()
            reason = next((label for label, words in (
                ("authentication", ("password authentication", "authentication failed")),
                ("network", ("could not connect", "connection refused", "could not translate")),
                ("permission", ("permission denied", "must be owner", "insufficient privilege")),
                ("server_version", ("server version", "version mismatch")),
                ("ssl", ("certificate", "ssl")),
                ("unsupported_option", ("unrecognized option", "unknown option")),
            ) if any(word in message for word in words)), "other")
            raise RuntimeError(f"pg_dump failed (exit {dump.returncode}, class {reason}); no backup retained")
        listing = subprocess.run([pg_restore, "--list", str(destination)],
                                 capture_output=True, text=True, timeout=90)
        if listing.returncode:
            raise RuntimeError("pg_restore could not read the backup archive")
        items = sum(1 for line in listing.stdout.splitlines() if re.match(r"^\d+;", line))
        with destination.open("rb") as backup_file:
            digest = hashlib.file_digest(backup_file, "sha256").hexdigest()
        print(json.dumps({"environment": args.environment, "project_ref": PROJECTS[args.environment],
                          "backup_file": str(destination), "bytes": destination.stat().st_size,
                          "sha256": digest, "pg_restore_toc_items": items, "validation": "archive_list_pass"}))
    except Exception:
        destination.unlink(missing_ok=True)
        raise


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"PostgreSQL backup failed: {error}", file=sys.stderr)
        raise SystemExit(1) from None
