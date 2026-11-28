# Task 2 S02.1 — public repository integration boundary

Repository: HarryTran-lead/IeltsWithHarry (public).
Scope: feature branch / draft PR only. No production migration, deployment or learner release.

## Critical correction to S02
Do NOT run S02's apply_feature_patch.py --install and commit the resulting
tools/task2-rewrite-stage-v1 directory. It includes server_only answers,
R16 locked assessments and private JSONL files and would publish them.

This branch intentionally commits ONLY:
- Admin-authenticated, read-only HOLD endpoint.
- Code-only safety preflight that rejects tracked Task 2 private data.
- GitHub Actions safety workflow.

The audited 1,975-record package is held outside Git. It must be imported
into a separately verified Supabase staging project by an authorized operator.
Service-role keys, private feed contents and final locked prompts must never
be committed, put in public PR artifacts, or exposed via static routes.

## Evidence
The existing Quality workflow runs npm ci, typecheck, lint, Vitest and build.
S02.1 security preflight cannot validate PostgreSQL RLS, import or E2E.
All of those are NOT_RUN; production remains HOLD.

## Progress gate
S02 remains NOT_ACCEPTED until the exact head commit has passing full Quality
jobs and reviewer has confirmed safe feature integration. Draft PR must not merge.
