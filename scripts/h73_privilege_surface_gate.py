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
    "scripts/writing-grading-worker.ts",
    "scripts/speaking-coaching-worker.ts",
    "services/audio-worker/test_worker.py",
    "services/audio-worker/worker.py",
    "services/speaking-cloudflare-worker/src/index.js",
    "services/speaking-cloudflare-worker/src/index.node-check.mjs",
    "src/app/(public)/notebook/share/[token]/page.tsx",
    "src/app/api/grammar/placement/route.ts",
    "src/lib/deployment-environment.ts",
    "src/lib/ielts-bank/server.ts",
    "src/lib/news/sync.ts",
    "src/lib/writing-grading/cloudflare-worker.ts",
})

# H72 scanner's POSSIBLE_SERVICE_CLIENT indicator currently covers
# bankClient(...) and createSupabaseClient(...). These are reviewed *locations*,
# not proof that each request enforces authorization.
BASELINE_INDIRECT_BANK_CLIENT_PATHS = frozenset({
    "src/app/(public)/reading/share/[token]/page.tsx",
    "src/app/api/admin/ai-content-factory/route.ts",
    "src/app/api/admin/users/route.ts",
    "src/app/api/admin/vocabulary-phase5/route.ts",
    "src/app/api/ielts/bank/admin/route.ts",
    "src/app/api/ielts/bank/attempt/route.ts",
    "src/app/api/ielts/bank/catalog/route.ts",
    "src/app/api/ielts/bank/library/route.ts",
    "src/app/api/ielts/bank/review-highlights/route.ts",
    "src/app/api/ielts/bank/scheduled/route.ts",
    "src/app/api/ielts/bank/share/route.ts",
    "src/app/api/ielts/bank/speaking-coaching/route.ts",
    "src/app/api/ielts/bank/writing-feedback/route.ts",
    "src/app/api/ielts/bank/writing-grading/route.ts",
    "src/app/api/ielts/bank/writing-insights/route.ts",
    "src/app/api/ielts/bank/writing-review/route.ts",
    "src/app/api/ielts/bank/writing-source-facts/route.ts",
    "src/app/api/progress/insights/route.ts",
    "src/app/api/progress/route.ts",
    "src/app/api/streak-leaderboard/route.ts",
    "src/lib/writing-grading/server.ts",
})
BASELINE_POSSIBLE_CLIENT_PATHS = BASELINE_INDIRECT_BANK_CLIENT_PATHS | frozenset({
    "src/lib/ielts-bank/server.ts",
})

def evaluate(inventory: dict, baseline: frozenset[str] = BASELINE_SERVICE_ROLE_PATHS,
             client_baseline: frozenset[str] = BASELINE_POSSIBLE_CLIENT_PATHS) -> dict:
    findings = inventory.get("findings", [])
    observed = sorted({
        item["path"] for item in findings
        if item.get("indicator") == "SERVICE_ROLE_REF"
        and item.get("scope") in ("APPLICATION_RUNTIME", "OTHER_SOURCE")
    })
    clients = sorted({
        item["path"] for item in findings
        if item.get("indicator") == "POSSIBLE_SERVICE_CLIENT"
        and item.get("scope") in ("APPLICATION_RUNTIME", "OTHER_SOURCE")
    })
    current = set(observed)
    new = sorted(current - baseline)
    missing = sorted(baseline - current)
    client_new = sorted(set(clients) - client_baseline)
    client_missing = sorted(client_baseline - set(clients))
    indirect_new = sorted(set(clients) - set(observed) - client_baseline)
    complete = (inventory.get("static_inventory_status") == "STATIC_INVENTORY_PRODUCED"
                and inventory.get("coverage", {}).get("complete") is True)
    status = ("STATIC_BASELINE_MATCH" if complete and not new and not missing
              and not client_new and not client_missing else "STATIC_BASELINE_DRIFT")
    return {
        "milestone": "H73",
        "source_commit_sha": inventory.get("commit_sha"),
        "scope": "STATIC_TRACKED_SOURCE_ONLY",
        "status": status,
        "release_gate": "NO_GO",
        "supabase_staging_verified": False,
        "source_coverage_complete": complete,
        "observed_role_paths": observed,
        "baseline_role_paths": sorted(baseline),
        "unreviewed_new_role_paths": new,
        "stale_baseline_paths": missing,
        "observed_possible_client_paths": clients,
        "baseline_possible_client_paths": sorted(client_baseline),
        "observed_indirect_bank_client_paths": sorted(set(clients) - set(observed)),
        "unreviewed_new_client_paths": client_new,
        "unreviewed_new_indirect_client_paths": indirect_new,
        "stale_client_baseline_paths": client_missing,
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
        "possible_clients": len(result["observed_possible_client_paths"]),
        "new_clients": len(result["unreviewed_new_client_paths"]),
        "stale_clients": len(result["stale_client_baseline_paths"]),
        "release_gate": "NO_GO",
    }))
    return 0 if result["status"] == "STATIC_BASELINE_MATCH" else 3

if __name__ == "__main__":
    sys.exit(main())
