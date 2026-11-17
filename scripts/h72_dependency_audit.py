#!/usr/bin/env python3
"""H72: evidence-first static inventory of application dependencies on private H58 tables.

No network, no secrets, no database writes. Static matches are NOT proof of absent
runtime dependencies, service_role usage, PostgREST exposure or external jobs.
"""
from __future__ import annotations
import argparse
from collections import Counter
import json
from pathlib import Path
import re
import subprocess
import sys

SOURCE_SUFFIXES={".ts",".tsx",".js",".jsx",".mjs",".cjs",".mts",".cts",".py",".sql",".sh",".yml",".yaml",".toml",".json",".prisma"}
DIRECT=re.compile(r"\br19_h58(?:\s*\.\s*[a-z_][a-z_0-9]*)?\b",re.I)
ROLE=re.compile(r"\b(?:SUPABASE_SERVICE_ROLE_KEY|service_role)\b",re.I)
SUBMIT=re.compile(r"\bh68_submit_review\b",re.I)
QUOTA=re.compile(r"\bh68_rate_limit_review\b",re.I)
SCHEMA_CALL=re.compile(r"""\.schema\s*\(\s*["']r19_h58["']\s*\)""",re.I)
ROLE_API=re.compile(r"\b(?:bankClient|createSupabaseClient)\s*\(")
PATTERNS={"DIRECT_H58_REF":DIRECT,"SERVICE_ROLE_REF":ROLE,"SUBMIT_RPC_REF":SUBMIT,
          "DEPRECATED_QUOTA_RPC_REF":QUOTA,"SCHEMA_CALL_H58":SCHEMA_CALL,
          "POSSIBLE_SERVICE_CLIENT":ROLE_API}
MAX_BYTES=1_500_000
MAX_FINDINGS=1000
EXCLUDE_PARTS={".git","node_modules",".next","dist","build","coverage","vendor"}

def classify(path:str)->str:
    if path.startswith(("src/app/","src/lib/","src/pages/","supabase/functions/","services/","workers/","functions/","app/","lib/","api/","pages/")) or path.startswith(("src/middleware.","middleware.")):
        return "APPLICATION_RUNTIME"
    if path.startswith(("supabase/migrations/","supabase/content/")):
        return "DB_MIGRATION_HISTORY"
    if path.startswith(("sql/","scripts/","tests/")):
        return "MILESTONE_OR_OPERATIONAL"
    if path.startswith(".github/workflows/"):
        return "CI_WORKFLOW"
    return "OTHER_SOURCE"

def tracked_files(root:Path)->list[str]:
    run=subprocess.run(["git","-C",str(root),"ls-files","-z","--cached"],
                       capture_output=True,check=True,timeout=60)
    return [p.decode("utf-8","replace") for p in run.stdout.split(b"\0") if p]

def head_sha(root:Path)->str:
    return subprocess.run(["git","-C",str(root),"rev-parse","HEAD"],text=True,
                          capture_output=True,check=True,timeout=15).stdout.strip()

def assert_clean_tracked_tree(root:Path)->None:
    """Reject SHA-bound scans if tracked files differ from checked-out HEAD.

    Untracked generated report artifacts are allowed; tracked edits or staged
    changes are not. This check is a local integrity guard, not staging proof.
    """
    run=subprocess.run(["git","-C",str(root),"status","--porcelain=v1",
                        "--untracked-files=no"],capture_output=True,text=True,
                       check=True,timeout=60)
    if run.stdout.strip():
        raise ValueError("tracked working tree differs from checked-out HEAD")
    # status/diff may intentionally ignore index entries marked assume-unchanged
    # or skip-worktree. Refuse SHA-bound evidence rather than trusting those flags.
    flags=subprocess.run(["git","-C",str(root),"ls-files","-v","-z","--cached"],
                         capture_output=True,check=True,timeout=60)
    for record in flags.stdout.split(b"\0"):
        if not record:
            continue
        if len(record)<3 or record[1:2]!=b" ":
            raise ValueError("unable to verify tracked index flags")
        flag=record[:1]
        if flag==b"S" or flag.islower():
            raise ValueError("tracked index has unverified assume-unchanged or skip-worktree entries")

def analyze(root:Path,paths:list[str],sha:str)->dict:
    if not re.fullmatch(r"[a-f0-9]{40}",sha):
        raise ValueError("Commit must be a full Git SHA")
    findings=[]; skipped=[]; inspected=0; line_count=0; scan_errors=[]
    for rel in sorted(set(paths)):
        path=Path(rel)
        if path.is_absolute() or ".." in path.parts or set(path.parts)&EXCLUDE_PARTS:
            skipped.append({"path":rel,"reason":"UNSAFE_OR_EXCLUDED"});continue
        if path.suffix.lower() not in SOURCE_SUFFIXES:
            continue
        if not (rel.startswith(("src/","supabase/","services/","workers/","functions/","app/","lib/","api/","pages/","scripts/","sql/","tests/",".github/")) or rel.startswith("middleware.")):
            continue
        target=root/path
        if target.is_symlink() or not target.is_file():
            skipped.append({"path":rel,"reason":"SYMLINK_OR_MISSING"});continue
        try:
            if target.stat().st_size>MAX_BYTES:
                skipped.append({"path":rel,"reason":"LARGE_SOURCE_FILE"});continue
            data=target.read_text(encoding="utf-8")
        except (OSError,UnicodeError):
            skipped.append({"path":rel,"reason":"UNREADABLE_SOURCE"});continue
        inspected+=1
        scope=classify(rel)
        for number,line in enumerate(data.splitlines(),1):
            line_count+=1
            for kind,pattern in PATTERNS.items():
                if not pattern.search(line):continue
                if len(findings)>=MAX_FINDINGS:
                    scan_errors.append("FINDINGS_TRUNCATED")
                    break
                findings.append({"path":rel,"line":number,"indicator":kind,"scope":scope,
                                 "classification":"NEEDS_RUNTIME_CONFIRMATION" if scope=="APPLICATION_RUNTIME" else "REVIEW_CONTEXT"})
            if scan_errors:break
        if scan_errors:break
    # No eligible source files is not evidence that there are no dependencies.
    # It may indicate the wrong checkout, empty repo or unsupported layout.
    if inspected==0:
        scan_errors.append("NO_ELIGIBLE_SOURCE_FILES")
    count=Counter(f["indicator"] for f in findings)
    application_refs=sorted({f["path"] for f in findings
                             if f["scope"]=="APPLICATION_RUNTIME" and
                             f["indicator"] in ("DIRECT_H58_REF","SCHEMA_CALL_H58")})
    role_files=sorted({f["path"] for f in findings
                       if f["scope"]=="APPLICATION_RUNTIME" and
                       f["indicator"] in ("SERVICE_ROLE_REF","POSSIBLE_SERVICE_CLIENT")})
    has_bad_inputs=bool(scan_errors) or any(x["reason"] in
             ("UNREADABLE_SOURCE","SYMLINK_OR_MISSING","UNSAFE_OR_EXCLUDED") for x in skipped)
    has_large_inputs=any(x["reason"]=="LARGE_SOURCE_FILE" for x in skipped)
    outcome=("INVENTORY_INCOMPLETE" if has_bad_inputs else
             "PARTIAL_STATIC_INVENTORY" if has_large_inputs else "STATIC_INVENTORY_PRODUCED")
    return {
        "milestone":"H72","commit_sha":sha,"source":"TRACKED_REPOSITORY_FILES",
        "static_inventory_status":outcome,"release_gate":"NO_GO",
        "h58_cutover_approved":False,"live_supabase_checks_pass":0,
        "live_supabase_checks_required":18,
        "limitations":["STATIC_MATCHES_ONLY","DYNAMIC_SQL_AND_DEPLOYED_SERVICES_NOT_PROVEN",
            "EXTERNAL_EDGE_FUNCTIONS_CRON_AND_SECRETS_NOT_INSPECTED",
            "ROLE_REFERENCES_DO_NOT_PROVE_H58_ACCESS","DBA_REVIEW_REQUIRED"],
        "coverage":{"tracked_candidates":len(paths),"inspected_files":inspected,
                    "complete":outcome=="STATIC_INVENTORY_PRODUCED",
                    "scanned_lines":line_count,"skipped":skipped,"errors":scan_errors,
                    "findings_truncated":bool(scan_errors)},
        "counts_by_indicator":dict(sorted(count.items())),
        "application_direct_h58_reference_paths":application_refs,
        "application_service_role_or_client_paths":role_files,
        "findings":findings,
    }

def markdown(data:dict)->str:
    rows=[
        "# H72 — Repository Service Role / H58 Dependency Inventory",
        "",
        "**STATIC ONLY / NOT CLEARED FOR CUTOVER / RELEASE_NO_GO**",
        "",
        "- Git commit: "+data["commit_sha"],
        "- Inspected source files: "+str(data["coverage"]["inspected_files"]),
        "- Source lines scanned: "+str(data["coverage"]["scanned_lines"]),
        "- Direct H58 application files: "+str(len(data["application_direct_h58_reference_paths"])),
        "- Service-role-related application files: "+str(len(data["application_service_role_or_client_paths"])),
        "- Skipped/unknown file coverage entries: "+str(len(data["coverage"]["skipped"])),
        "",
        "## Application paths requiring manual confirmation",
    ]
    paths=sorted(set(data["application_direct_h58_reference_paths"]+
                     data["application_service_role_or_client_paths"]))
    rows.extend("- "+p for p in paths[:80])
    if len(paths)>80:rows.append("- Additional paths retained in JSON (not truncated silently)")
    if not paths:rows.append("No static application match found; NOT proof of absence.")
    rows.extend(["","## Required manual cross-checks",
       "1. Inventory external jobs, Supabase Edge Functions, deploy logs, secrets, service accounts and scheduled workflows.",
       "2. DBA review exact \`service_role\` privileges, bypass RLS, postgrest function grants and function ownership on the actual staging project.",
       "3. Require independent staging acceptance evidence for all 18 security checks; this inventory is NOT an attestation.",
       "4. Do not execute H70 migration, change credentials, merge drafts, or enable teacher writes based on this report.",
       ""])
    return "\n".join(rows)

def main()->int:
    p=argparse.ArgumentParser()
    p.add_argument("--repo",type=Path,default=Path("."))
    p.add_argument("--json-out",type=Path,required=True)
    p.add_argument("--md-out",type=Path,required=True)
    p.add_argument("--expected-sha",required=True)
    args=p.parse_args()
    root=args.repo.resolve()
    try:
        sha=head_sha(root)
        if sha!=args.expected_sha:
            print("H72 REFUSED: expected commit does not match checkout",file=sys.stderr);return 2
        assert_clean_tracked_tree(root)
        result=analyze(root,tracked_files(root),sha)
        # Guard the gap between initial checkout validation and scan completion.
        # A concurrent edit or a branch move invalidates this SHA-bound receipt.
        if head_sha(root)!=sha:
            raise ValueError("checked-out HEAD changed during scan")
        assert_clean_tracked_tree(root)
    except (OSError,ValueError,subprocess.SubprocessError) as e:
        print("H72 NOT_TESTED: unable to attest checked-out repository: "+str(e),file=sys.stderr);return 2
    args.json_out.parent.mkdir(parents=True,exist_ok=True)
    args.md_out.parent.mkdir(parents=True,exist_ok=True)
    args.json_out.write_text(json.dumps(result,indent=2,ensure_ascii=False)+"\n",encoding="utf-8")
    args.md_out.write_text(markdown(result),encoding="utf-8")
    print(json.dumps({"commit_sha":sha,"scope":"STATIC_ONLY",
        "status":result["static_inventory_status"],
        "application_direct_h58_reference_paths":result["application_direct_h58_reference_paths"],
        "application_service_role_or_client_paths":result["application_service_role_or_client_paths"],
        "source_files":result["coverage"]["inspected_files"],
        "skipped_count":len(result["coverage"]["skipped"]),
        "release_gate":"NO_GO"}))
    return 0 if result["static_inventory_status"]=="STATIC_INVENTORY_PRODUCED" else 3

if __name__=="__main__":sys.exit(main())
