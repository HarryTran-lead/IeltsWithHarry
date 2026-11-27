# R19 H67 — Read-only staging integration (draft)

This branch adds a deliberately limited integration to the actual IeltsWithHarry Next.js repository. It does **not** import/enable H64 teacher-review writes or perform any database migration.

- GET /api/admin/r19/h67: absent by default (404). Requires explicit `H67_ADMIN_PREFLIGHT_ENABLED=true` and the existing verified `viewer(true)` admin authorization. Returns only non-sensitive status `NO_GO`.
- POST/PUT/PATCH/DELETE: always 405; no payloads, answer keys, gold labels, or holdout data returned.
- No change to public learner routes, mastery or grading.
- Existing Quality GitHub Actions runs on push and PR. Typecheck, lint, tests and Next.js build must be verified on the **new commit SHA**, not inferred from earlier unrelated successful runs.
- H65 real PostgreSQL-16 concurrency tests and 18 Supabase staging security checks remain `NOT_TESTED`. These must be run and attested on a future separately reviewed staging PR.
- No production deploy, no database migration, no model inference, no teacher-gold collection performed.

## Next integration gate

The H65/H64 write workflow must be reworked and reviewed for exact role grants, transactional idempotency+audit, database RLS, immutable evidence and secret management. Do not merge any write route or claim `GO` until it passes on isolated CI database and actual staging evidence.
