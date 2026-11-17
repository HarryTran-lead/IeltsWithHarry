# H68 — Transactional teacher review (draft / staging only)

Both the API flag and the private SQL table r19_h68.release_controls (default review_writes_enabled=false) must be enabled on approved staging. Neither enables learner grading.

This is **a code-review patch**, not an authorized database deployment or learner scoring release.

- Requires H58 schema (r19_h58) and three independent real teachers, reviewed rights/provenance, and separate security sign-off.
- API route: POST /api/admin/r19/h68/review, disabled by default (H68_REVIEW_WRITES_ENABLED must literally be true). Requests must have exact HTTPS Origin equal to H68_ALLOWED_ORIGIN and a fresh 16–128 character idempotency key.
- Supabase Auth getUser() verifies session; the PostgreSQL RPC separately derives auth.uid(), checks TEACHER and assignment against H58, validates source fingerprint and anchored quote, then writes H58 review, H58 audit, H68 idempotency and chain head **in one transaction**. Review submissions are append-only in H58.
- Separate authenticated RPC atomically reserves a per-teacher rate quota (10/min). A failure in quota RPC blocks the main write. This is separate from the review transaction by design and does not promise atomic coupling to a review.
- No learner scores, answer keys, gold export, holdout endpoint, or changes to mastery.
- CI workflow spins up PostgreSQL 16 in a **fresh isolated test database**; it runs 8 test groups, including 12 independent concurrent PostgreSQL sessions, duplicate-key checks, audit rollback injection, and private-table permission denial.
- Run normal repository Quality workflow for npm ci, TypeScript, lint, unit tests and next build on exact H68 commit SHA.
- Migration is **not applied by CI**. DBA must review sql/001_h68_review_staging_create_only.sql and existing H58 grants, function ownership, schema exposure and SECURITY DEFINER behavior before execution on isolated staging. Supabase JWT/RLS tests and 18 H62 security checks still NOT_TESTED.
- Do not merge, enable H68, connect to prod, or run staging migration until a separate approval.
- Residual risk: private H58 tables granted to the original service_role require H61 least-privilege cutover; not remediated by this migration. Audit hash chain is DB-local; it is not an external tamper-proof audit anchor.
