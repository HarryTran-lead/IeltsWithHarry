#!/usr/bin/env python3
"""H73: fail closed on changes to the *observed* service-role source surface.

Static tracked-source evidence only. A baseline match is never authorization
for elevated credentials, H58 migration, deployment, or Supabase staging release.
"""
from __future__ import annotations
import argparse
import json
from pathlib import Path
import sys
import subprocess

import h72_dependency_audit as h72

# Reviewed as static *locations* at H72, not approved for production usage.
# Changes to this list require explicit code review. Paths may include test
# fixtures because the H72 classifier treats services/** as runtime.
BASELINE_SERVICE_ROLE_PATHS = frozenset({
    "services/audio-worker/test_worker.py",
    "services/audio-worker/worker.py",
    "services/speaking-cloudflare-worker/src/index.js",
    "services/speaking-cloudflare-worker/src/index.node-check.mjs",
    "src/app/(public)/notebook/share/[token]/page.tsx",
    "src/app/api/grammar/placement/route.ts",
    "src/lib/deployment-environment.ts",
    "src/lib/grammar/placement.ts",
    "src/lib/ielts-bank/server.ts",
    "src/lib/news/sync.ts",
    "src/lib/writing-grading/cloudflare-worker.ts",
})

def evaluate(inventory: dict, baseline: frozenset[str] = BASELINE_SERVICE_ROLE_PATHS) -> dict:
    findings = inventory.get("findings", [])
    observed = sorted({
        item["path"] for item in findings
        if item.get("indicator") == "SERVICE_ROLE_REF"
        and item.get("scope") in ("APPLICATION_RUNTIME", "OTHER_SOURCE")
    })
    current = set(observed)
    new = sorted(current - baseline)
    missing = sorted(baseline - current)
    complete = (inventory.get("static_inventory_status") == "STATIC_INVENTORY_PRODUCED"
                and inventory.get("coverage", {}).get("complete") is True)
    status = "STATIC_BASELINE_MATCH" if complete and not new and not missing else "STATIC_BASELINE_DRIFT"
    return {
        "milestone": "H73",
        "source_commit_sha": inventory.get("commit_sha"),
        "scope": "STATIC_TRACKED_SOURCE_ONLY",
        "status": status,
        "release_gate": "NO_GO",
        "supabase_staging_verified": False,
        "teacher_gold_verified": False,
        "source_coverage_complete": complete,
        "observed_role_paths": observed,
        "baseline_role_paths": sorted(baseline),
        "unreviewed_new_role_paths": new,
        "stale_baseline_paths": missing,
        "limitations": [
            "STATIC_TOKEN_MATCHES_NOT_RUNTIME_REACHABILITY",
            "NO_EXTERNAL_SERVICES_OR_SUPABASE_GRANTS_VERIFIED",
            "BASELINE_PATHS_ARE_NOT_PERMISSION_APPROVAL",
        ],
    }

def main() -> int:
    p = argparse.ArgumentParser()
    p.add_argument("--repo", type=Path, default=Path("."))
    p.add_argument("--expected-sha", required=True)
    p.add_argument("--json-out", type=Path, required=True)
    args = p.parse_args()
    root = args.repo.resolve()
    try:
        sha = h72.head_sha(root)
        if sha != args.expected_sha:
            raise ValueError("expected SHA differs from checked-out HEAD")
        h72.assert_clean_tracked_tree(root)
        inventory = h72.analyze(root, h72.tracked_files(root), sha)
        result = evaluate(inventory)
        if h72.head_sha(root) != sha:
            raise ValueError("HEAD changed during scan")
        h72.assert_clean_tracked_tree(root)
    except (OSError, ValueError, subprocess.SubprocessError) as exc:
        print("H73 REFUSED: " + str(exc), file=sys.stderr)
        return 2
    args.json_out.parent.mkdir(parents=True, exist_ok=True)
    args.json_out.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "commit_sha": sha,
        "status": result["status"],
        "observed": len(result["observed_role_paths"]),
        "new": len(result["unreviewed_new_role_paths"]),
        "stale": len(result["stale_baseline_paths"]),
        "release_gate": "NO_GO",
    }))
    return 0 if result["status"] == "STATIC_BASELINE_MATCH" else 3

if __name__ == "__main__":
    sys.exit(main())
