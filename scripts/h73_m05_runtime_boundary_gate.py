#!/usr/bin/env python3
"""H73/M05 read-only contract checks for known *source* deployment boundaries.

No network, Docker, external credentials, Vercel, Cloudflare, or Supabase calls.
A green result means the documented source boundary has not drifted. It never
attests that any service is deployed, isolated, authorized, or secure at runtime.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import subprocess
import sys
import tomllib

import h72_dependency_audit as h72

# Reviewed repo configurations only. Any new wrangler config requires review.
WORKER_CONFIGS = {
    "services/speaking-cloudflare-worker/wrangler.toml":
        {"name": "ielts-speaking-ai-worker", "main": "src/index.js", "cron": ["*/2 * * * *"]},
    "services/writing-cloudflare-proxy/wrangler.toml":
        {"name": "ielts-writing-ai-proxy", "main": "src/index.js", "cron": []},
}
EXPECTED_RUNTIME_FILES = (
    "services/audio-worker/compose.yaml",
    "services/audio-worker/Dockerfile",
    "services/speaking-cloudflare-worker/src/index.js",
    "services/writing-cloudflare-proxy/src/index.js",
    "scripts/writing-grading-worker.ts",
    "scripts/speaking-coaching-worker.ts",
    "src/app/api/ielts/bank/scheduled/route.ts",
    "src/app/api/news/sync/route.ts",
    "sql/h72_preflight_READ_ONLY.sql",
)
SOURCE_CONTRACTS = {
    "services/speaking-cloudflare-worker/src/index.js": (
        "async scheduled(", "async fetch(", "WORKER_TRIGGER_SECRET",
        "SUPABASE_SERVICE_ROLE_KEY", "SPEAKING_WORKER_ENABLED",
    ),
    "services/writing-cloudflare-proxy/src/index.js": (
        "PROXY_SECRET", "request.headers.get(\"Authorization\")", "env.AI.run(",
    ),
    "scripts/writing-grading-worker.ts": (
        "SUPABASE_SERVICE_ROLE_KEY", 'db.rpc("writing_claim_grading_job"',
        'db.rpc("writing_finish_grading_job"',
    ),
    "scripts/speaking-coaching-worker.ts": (
        "SUPABASE_SERVICE_ROLE_KEY", 'db.rpc("speaking_claim_coaching_job"',
        'db.rpc("speaking_finish_coaching_job"',
    ),
    "src/app/api/ielts/bank/scheduled/route.ts": (
        "IELTS_SYNC_SECRET", 'request.headers.get("authorization")', "bankClient()",
    ),
    "src/app/api/news/sync/route.ts": (
        "NEWS_SYNC_SECRET", 'request.headers.get("authorization")',
        'client.rpc("is_admin")',
    ),
    "sql/h72_preflight_READ_ONLY.sql": (
        "H72_ROLE_ATTRIBUTES", "H72_RPC_OWNERSHIP", "H72_POLICIES",
    ),
}
CONTRACT_FILES = sorted(set(EXPECTED_RUNTIME_FILES) | set(WORKER_CONFIGS) | {"vercel.json"})


def evaluate(root: Path, sha: str) -> dict:
    issues = []
    def load(relative: str) -> str | None:
        path = root / relative
        if not path.is_file() or path.is_symlink():
            issues.append({"path": relative, "code": "MISSING_OR_SYMLINK_SOURCE"})
            return None
        try:
            return path.read_text(encoding="utf-8")
        except (OSError, UnicodeError):
            issues.append({"path": relative, "code": "UNREADABLE_SOURCE"})
            return None

    names = sorted(p.relative_to(root).as_posix()
                   for p in (root / "services").glob("*/wrangler.toml"))
    unexpected = sorted(set(names) - set(WORKER_CONFIGS))
    if unexpected:
        for name in unexpected:
            issues.append({"path": name, "code": "UNREVIEWED_NEW_WRANGLER_CONFIG"})
    for rel in WORKER_CONFIGS:
        raw = load(rel)
        if raw is None:
            continue
        try:
            data = tomllib.loads(raw)
        except ValueError:
            issues.append({"path": rel, "code": "INVALID_WRANGLER_TOML"})
            continue
        expected = WORKER_CONFIGS[rel]
        cron = data.get("triggers", {}).get("crons", [])
        if (data.get("name") != expected["name"] or data.get("main") != expected["main"]
                or cron != expected["cron"] or data.get("workers_dev") is not True
                or data.get("ai", {}).get("binding") != "AI"):
            issues.append({"path": rel, "code": "WORKER_TRIGGER_OR_ENTRYPOINT_DRIFT"})
        code_path = (root / rel).parent / expected["main"]
        if not code_path.is_file() or code_path.is_symlink():
            issues.append({"path": rel, "code": "MISSING_WORKER_ENTRYPOINT"})

    vercel = load("vercel.json")
    if vercel is not None:
        try:
            parsed = json.loads(vercel)
            if parsed.get("crons", []) != []:
                issues.append({"path": "vercel.json", "code": "UNREVIEWED_VERCEL_CRON"})
        except (ValueError, TypeError):
            issues.append({"path": "vercel.json", "code": "INVALID_VERCEL_CONFIG"})

    compose = load("services/audio-worker/compose.yaml")
    if compose is not None:
        # Conservative non-YAML parser: fail when the expected isolation contract
        # disappears; review deployment separately (this is not proof of no ports).
        for phrase in ("read_only: true", "no-new-privileges:true", "env_file: .env"):
            if phrase not in compose:
                issues.append({"path": "services/audio-worker/compose.yaml",
                               "code": "AUDIO_WORKER_ISOLATION_CONTRACT_DRIFT"})
                break
        if any(line.lstrip().startswith(("ports:", "network_mode: host", "privileged: true"))
               for line in compose.splitlines()):
            issues.append({"path": "services/audio-worker/compose.yaml",
                           "code": "AUDIO_WORKER_EXPOSED_OR_PRIVILEGED"})
    for rel, phrases in SOURCE_CONTRACTS.items():
        code = load(rel)
        if code is not None:
            for phrase in phrases:
                if phrase not in code:
                    issues.append({"path": rel, "code": "MISSING_SOURCE_BOUNDARY_MARKER"})
                    break
    # A read-only SQL inventory file is a *template*, not a live DB check.
    return {
        "milestone": "H73/M05",
        "commit_sha": sha,
        "status": "STATIC_BOUNDARY_MATCH" if not issues else "STATIC_BOUNDARY_DRIFT",
        "release_gate": "NO_GO",
        "deployment_verified": False,
        "supabase_staging_verified": False,
        "contract_files": CONTRACT_FILES,
        "known_worker_configs": sorted(WORKER_CONFIGS),
        "observed_worker_config_paths": names,
        "issues": issues,
        "external_checks_pending": [
            "CLOUDFLARE_DEPLOYED_WORKERS_SECRETS_AND_CRON",
            "PRIVATE_ORACLE_WORKERS_PROCESS_ENVIRONMENT_AND_SCHEDULE",
            "VERCEL_ENVIRONMENT_VARS_AND_SCHEDULED_CALLERS",
            "SUPABASE_ACTUAL_RPC_GRANTS_SERVICE_ROLE_AND_RLS",
        ],
        "limitations": [
            "SOURCE_MARKERS_NOT_AUTHORIZATION_PROOF",
            "NO_REAL_NETWORK_OR_DATABASE_CHECK",
            "NO_DEPLOYMENT_STATE_ATTESTATION",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--repo", type=Path, default=Path("."))
    parser.add_argument("--expected-sha", required=True)
    parser.add_argument("--json-out", type=Path, required=True)
    args = parser.parse_args()
    root = args.repo.resolve()
    try:
        sha = h72.head_sha(root)
        if sha != args.expected_sha:
            raise ValueError("expected SHA differs from checked-out HEAD")
        h72.assert_clean_tracked_tree(root)
        result = evaluate(root, sha)
        if h72.head_sha(root) != sha:
            raise ValueError("HEAD changed while evaluating boundaries")
        h72.assert_clean_tracked_tree(root)
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        print("H73/M05 REFUSED: " + str(exc), file=sys.stderr)
        return 2
    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.json_out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({"milestone": "H73/M05", "status": result["status"],
                      "issues": len(result["issues"]), "release_gate": "NO_GO"}))
    return 0 if result["status"] == "STATIC_BOUNDARY_MATCH" else 3


if __name__ == "__main__":
    sys.exit(main())
