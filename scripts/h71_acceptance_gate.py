#!/usr/bin/env python3
"""H71 offline evidence integrity check. Does NOT authenticate the claimed verifier or issue GO."""
import argparse, hashlib, json, re, sys
from pathlib import Path

REQUIRED=(
 "STAGE_PROJECT_IDENTITY","HTTPS_ORIGIN","AUTH_GETUSER_TEACHER_A",
 "AUTH_GETUSER_TEACHER_B","AUTH_GETUSER_TEACHER_C",
 "AUTH_OUTSIDER_DENIED","AUTH_OWNER_DENIED","ANON_RPC_DENIED",
 "PRIVATE_H58_TABLE_READ_DENIED","H58_RLS_FORCE_INVENTORY",
 "H61_SERVICE_ROLE_LEAST_PRIVILEGE","H68_DB_KILL_SWITCH_DEFAULT_DENY",
 "H68_STAGING_TEACHER_A_SUBMIT","H68_STAGING_THREE_REVIEWER_ISOLATION",
 "H68_REPLAY_ATOMICITY","H68_AUDIT_ROLLBACK_REAL_STAGING",
 "H68_RATE_LIMIT_MULTI_CONNECTION","HOLDOUT_NO_EXPORT",
)
HASH=re.compile(r'^[0-9a-f]{64}$')
COMMIT=re.compile(r'^(?:[0-9a-f]{40}|[0-9a-f]{64})$')
REF=re.compile(r'^[a-z0-9]{10,32}$')
def inspect(doc,root):
    problems=[]
    checks=doc.get("checks",[])
    project,commit=doc.get("project_ref"),doc.get("commit_sha")
    if not isinstance(project,str) or not REF.fullmatch(project):problems.append("missing_verified_project")
    if not isinstance(commit,str) or not COMMIT.fullmatch(commit):problems.append("invalid_commit")
    if not isinstance(checks,list):checks=[];problems.append("invalid_checks")
    ids=[e.get("id") for e in checks if isinstance(e,dict)]
    if len(checks)!=18 or len(ids)!=len(set(ids)) or set(ids)!=set(REQUIRED):
        problems.append("missing_or_duplicate_checks")
    pass_claims=0
    for e in checks:
        if not isinstance(e,dict) or e.get("id") not in REQUIRED:
            problems.append("unknown_check");continue
        if e.get("status") not in ("NOT_TESTED","PASS","FAIL"):
            problems.append("bad_status");continue
        if e["status"]!="PASS":continue
        pass_claims+=1
        f,sha=e.get("evidence_path"),e.get("evidence_sha256")
        if not isinstance(f,str) or not isinstance(sha,str) or not HASH.fullmatch(sha):
            problems.append("missing_receipt_"+e["id"]);continue
        path=(root/f).resolve()
        try:path.relative_to(root.resolve())
        except ValueError:problems.append("unsafe_path_"+e["id"]);continue
        if not path.is_file() or path.is_symlink():
            problems.append("unreadable_receipt_"+e["id"]);continue
        if hashlib.sha256(path.read_bytes()).hexdigest()!=sha:problems.append("digest_mismatch_"+e["id"])
        if e.get("commit_sha")!=commit or e.get("project_ref")!=project:
            problems.append("context_mismatch_"+e["id"])
        if not isinstance(e.get("independent_verifier"),str) or not e["independent_verifier"].strip():
            problems.append("missing_independent_verifier_"+e["id"])
    verdict=("INVALID_EVIDENCE" if problems else
             "INDEPENDENT_REVIEW_REQUIRED" if pass_claims==len(REQUIRED) else
             "NO_GO_MISSING_STAGING_EVIDENCE")
    return {"milestone":"H71","claimed_live_pass":pass_claims,"required_live":18,
            "issues":problems,"verdict":verdict,"release_gate":"NO_GO",
            "learner_auto_grading":"BLOCKED","teacher_gold":"NOT_VERIFIED",
            "note":"Self-declared evidence must be independently verified; no automatic release GO."}
def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--manifest",required=True,type=Path)
    parser.add_argument("--root",type=Path)
    args=parser.parse_args()
    try:
        data=json.loads(args.manifest.read_text(encoding="utf-8"))
        result=inspect(data,args.root or args.manifest.parent)
    except (OSError,ValueError,TypeError) as e:
        result={"verdict":"INVALID_EVIDENCE","release_gate":"NO_GO","error":str(e)}
    print(json.dumps(result,indent=2))
    return 0 if result.get("verdict")=="INDEPENDENT_REVIEW_REQUIRED" else 2
if __name__=="__main__":sys.exit(main())
