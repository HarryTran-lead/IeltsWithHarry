# H70 — Supabase Least-Privilege Hardening (staging-only)
## Problem fixed in proposed migration
H58 originally grants ALL on private probes and answer tables to \`service_role\`. Because \`service_role\` has BYPASSRLS, enabling FORCE RLS alone is not a control. H70 proposes to replace broad grants with a narrowly privileged **NOLOGIN, NOBYPASSRLS** definer role \`r19_h70_executor\`, explicit RLS policies on the exact tables it uses, and revocation of H58 table grants from \`service_role\`.

The original H68 API required two RPC calls: \`h68_rate_limit_review\` and \`h68_submit_review\`. A client could skip the first. H70 revokes direct access to the old quota RPC and enforces the **10/minute limit inside the atomic submit function itself**, including direct PostgREST RPC calls and repeated idempotency keys. The new Next.js route calls just the transactional submit RPC. The SQL database write switch stays off.

## CI evidence (not production proof)
- Use isolated PostgreSQL 16 with a temporary fixture built from the H69/H58 schema and explicit simulated \`auth.uid\`. This is NOT signed Supabase JWT verification.
- Test service_role direct table access is revoked, authenticated raw reads denied, definer role cannot log in or bypass RLS, three independent teachers can still write, append-only audit holds, 12 concurrent direct RPC calls share one review, quota limits, DB kill switch, and SQL rollback.
- The CI workflow posts the exact patch sources as an artifact. Quality CI runs typecheck, lint, tests and build on exact branch commit.

## Supabase staging — pending approvals
Before applying \`sql/001_h70_least_privilege_staging_review.sql\`, DBA/security must review dependencies on original H58 \`service_role\` grants; function owners and inherited grants; RLS tables and object owners; backup and exact rollback owner/grants; PostgREST exposure; \`authenticated\` EXECUTE grants; and staging project identity. Run in an isolated approved staging database FIRST. **Do not auto-run any migration against user data.** Migration aborts when DB write switch is on.

Stage test of actual Supabase Auth via separate approved identities is NOT_TESTED. The 18 H62/H69 security checks remain NOT_TESTED and must be attested separately. Gold labels by real teachers remain 0. No scoring or learner release.

## Known residual risks
1. A database superuser or another privileged role can still access underlying tables. Revoking direct \`service_role\` grants is scoped to the H58 objects, not universal secrecy.
2. A failed review transaction rolls back its in-transaction quota counter; malformed requests need additional gateway/WAF limits outside PostgreSQL.
3. Rate quota applies across all *successful or returned* calls sharing the minute; rollback failure requests are not counted. 10/min is a development threshold and not a tested production policy.
4. DB-local audit hash chain needs an independent append-only external anchor for strong tamper evidence.
5. A deployment using service_role in another H58 API may break after revocation; must be inventoried and adapted before any staging or production cutover.
6. Role and function migration ownership in Supabase may be restricted; no actual Supabase project has been connected or altered.
7. \`H70_APPROVED_SUPABASE_PROJECT_REF\` must match the exact HTTPS hostname of \`NEXT_PUBLIC_SUPABASE_URL\` and \`H68_DEPLOYMENT_MODE=STAGING\`; API also requires \`H68_REVIEW_WRITES_ENABLED=true\`, SQL gate true, valid session+Origin, and no learner release.
8. RLS policies grant the non-login definer access across H58 rows; procedural authorization inside the SECURITY DEFINER functions must remain independently reviewed.
Release: **STAGING_ONLY / DBA_APPROVAL_REQUIRED / RELEASE_NO_GO**.
