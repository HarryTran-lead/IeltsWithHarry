# IELTS Writing Task 2 — S02.2 code-only adapter (DRAFT)

Repository **public**: HarryTran-lead/IeltsWithHarry, PR #204. This feature PR contains ONLY source code and synthetic test fixtures. Never commit or attach raw R01–R16 datasets, 831 server_only records, 7 locked assessments, backups, SQL credentials or run evidence containing private answer content.

## Code-only import adapter

- `scripts/task2-s022/import-adapter.mjs`: validates namespace, 82 JSON source hashes, 1,975 row hashes, counts, keys, visibility and strict RLS status. All records are immutable and collisions reject.
- `scripts/task2-s022/import-cli.mjs`: **OFFLINE/LOCAL_DRY_RUN by default**, requires an absolute `--bundle` path outside the Git checkout, using `realpath` checks; never bundles or logs payloads in local mode.
- `scripts/task2-s022/import-adapter.node.mjs`: synthetic, non-sensitive 29-case Node tests; run without private datasets and no credentials.

The externally held audited source bundle has counts: 1,140 learner-guided, 831 server-only, 3 shared and 1 internal docs = 1,975. Expected bundle SHA-256 fingerprint:
`d1b31e208201039eabe7afb530f6c8b2878ce0d914257379a02a7aca0848f35f`.

## Commands

Safe offline dry-run on a PRIVATE checkout machine with the audited package unpacked outside public repo:

```bash
node scripts/task2-s022/import-cli.mjs --bundle /private/audited-task2-bundle
node --test scripts/task2-s022/import-adapter.node.mjs
```

Later **only after S03 staging migration/RLS verification** and approved backup on **non-production project**, an administrator may separately run `--check-staging` then `--apply-staging` with the explicit `--confirm IMPORT_TASK2_REWRITE_V2_TO_STAGING`, verified distinct project refs and secure service-role environment variables. `--apply-staging` also requires `--backup-ref staging-backup-...` and private `--evidence /outside/public/repo/...`. Never run these commands in CI or on production.

The SQL candidate remains **outside the repo**. Stage migration and RLS tests are not included in this PR. The remote importer expects three candidate RPCs:
`task2_rewrite_v2_security_status`, `task2_rewrite_v2_preflight`, `task2_rewrite_v2_import_batch`. They do **not yet exist on staging**. The selected service-role key bypasses RLS by design; access control must be demonstrated using real anon and learner sessions in S03.

## Acceptance

- New Task2 code-only workflow PASS for the **exact final PR head SHA**
- Existing `quality.yml` npm ci/typecheck/lint/Vitest/build PASS for that SHA
- Security scan confirms public GitHub contains no proprietary task2 private dataset
- PR stays DRAFT, no production merge/deploy

This meets **S02 code integration** only; `staging_import: NOT_RUN`, `postgres_rls_live: NOT_RUN`, `production: HOLD`.
