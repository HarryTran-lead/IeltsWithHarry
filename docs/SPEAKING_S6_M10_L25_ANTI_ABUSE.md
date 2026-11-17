# M10-L25 — Speaking S6 anti-harvesting, request-origin and atomic start quota

**Scope:** staging branch only. No production migration, no release gate changes, no S7 unlock.
**Status:** code and regression coverage added; **38 real Supabase E2E cases remain NOT_RUN** unless separate signed evidence proves otherwise.

## 1. Threat model
The current S6 API returns private Independent / Mastery question prompts only after authenticated `start`. Before L25, a logged-in user could repeatedly create sessions to enumerate unseen prompts. Counting attempts in application memory is unsafe in serverless deployments; counting only existing attempts can be bypassed by DELETE. Cookie-authenticated mutation routes also require same-origin CSRF defenses.

## 2. Database migration (apply only on isolated disposable staging)
`supabase/migrations/202611170006_speaking_s6_attempt_limits_l25.sql`
- Depends on migrations `202611170003` (L14), `202611170004` (L15), and `202611170005` (L17).
- New private quota table `speaking_s6_start_quotas` with RLS enabled; no anon/authenticated privileges or exposed policies.
- One row per `(user_id, preview)`, automatically removed when the auth user is deleted.
- New **service-role-only** `speaking_s6_start_attempt_l25` RPC uses INSERT/ON CONFLICT + SELECT FOR UPDATE and inserts the attempt **inside the same transaction**. Concurrent starts for a user serialize across Node instances.
- Check lesson/revision/status; for normal learner traffic also recheck all five global QA gates AND signed, current S5 prerequisite in SQL.
- No unsafe fallback INSERT: if migration is missing, start fails with 503.
- Preview quotas are separate, but admin preview is still restricted by `viewer(true)` at the Next.js API layer.

| Rule | Learner | Admin-only preview |
|---|---:|---:|
| Max starts per UTC fixed hour | 8 | 36 |
| Max starts per UTC fixed day | 30 | 180 |
| Max incomplete started attempts in last 60 minutes | 3 | 3 |
| Reopen the same activity | 10-minute cooldown | 10-minute cooldown |
| Exceeded quota | 429 | 429 |

Start counters **survive attempt deletion**. Fixed windows allow some boundary bursts; daily quota, per-activity cooldown and active limits reduce that risk. This is NOT a substitute for upstream IP/WAF abuse controls, account-verification policy or real spoken-audio assessment.

## 3. Cookie-origin and body checks
`src/lib/speaking-s6/mutation-guard.ts` is used by:
- `POST /api/speaking/s6/session` and `DELETE /api/speaking/s6/session`
- `POST /api/speaking/s6/progress`
- `POST /api/admin/speaking-s6/import`

Guard rules:
1. POST must be `Content-Type: application/json` (optional charset accepted); form/multipart/text requests return HTTP 415.
2. Reject cross-site or same-site-but-cross-origin Fetch Metadata requests (HTTP 403).
3. Require exact `Origin` matching the request origin, or browser-attested `Sec-Fetch-Site: same-origin` when `Origin` is absent. Reject opaque Origin, mismatched host, credentials/path injected into Origin, and missing provenance.
4. All guard denials use `Cache-Control: private, no-store` and happen **before authentication, SQL or Storage**.
5. Server-to-server clients must use the explicit origin-compatible trusted workflow; unauthenticated remote calls are not supported.

Request URL origin is taken from the Next.js Request object; any unusual proxy/host forwarding topology must be tested on a real Vercel staging deployment. Do not weaken these checks to satisfy a mismatched reverse-proxy without a trusted-origin design review.

## 4. API and UX behavior
- `start`: validate user/revision/private prompt, then call the atomic DB RPC; only on success return `{attemptId,mode,question,audioStorageConsent}`.
- Recognized `S6_START_RATE_LIMIT`, `S6_START_COOLDOWN` and `S6_START_ACTIVE_LIMIT` return HTTP 429 with Retry-After. Other database errors return generic 503 without leaking SQL messages.
- No route treats a submitted transcript, client-reported duration or marked progress as verified speech proficiency.
- Vietnamese learner-facing error messages describe quota/cooldown and reloading the page if origin is invalid.

## 5. Automated tests
- `src/lib/speaking-s6/mutation-guard.test.ts`: nine origin/content-type tests.
- `tests/speaking-s6-l25-csrf-routes.test.ts`: four tests verifying guards execute before auth/SQL on session, progress, admin import and DELETE.
- `tests/speaking-s6-api-boundaries.test.ts`: six L25 mocked API regression cases for quota RPC, rate errors and missing migration, in addition to earlier Mastery/Guided tests.
- `tests/speaking-s6-postgres-rls.test.ts`: applies L14-L17 plus L25 to disposable PGlite, checks same-activity cooldown, active limit, hour quota and quota persistence after attempt deletion.

### Check in CI
```bash
npm ci
npm run typecheck
npm run lint
npm test -- tests/speaking-s6-api-boundaries.test.ts tests/speaking-s6-postgres-rls.test.ts tests/speaking-s6-l25-csrf-routes.test.ts src/lib/speaking-s6/mutation-guard.test.ts
npm run build
```
PGlite is not Supabase staging. These tests must not be counted as any of the 38 real E2E PASS claims.

## 6. Real staging acceptance before release
Apply L25 only to a **new disposable project** after validating earlier migrations. Verify with admin, learner A and learner B that:
- eligible user may start at the permitted pace; cross-account attempt IDs remain 404;
- quota persists when an attempt is deleted and concurrent starts cannot bypass it;
- browser same-origin actions work on actual staging; cross-origin JSON, HTML form and CSRF-style DELETE fail;
- stale/missing migration rejects new starts rather than bypassing quota;
- every global release gate remains false outside the isolated test window;
- no private Mastery bank content is exposed before valid stage access, and follow-ups remain owner-bound;
- all seeded user/audio/attempt data are removed after tests.

**Residual risks:** user may rotate accounts or call submit using self-reported text/time without genuine audio, fixed-window bursts exist, no distributed IP/WAF rate limit in this milestone, and initial-question secrecy is not equivalent to secure exam administration. S6 remains self-study only; S7 remains locked.

## 7. Follow-up milestone
**M10-L26 — Authenticated staging execution, quota concurrency proof and anti-harvesting audit**. Do not claim release readiness without signed E2E evidence and separate teacher/audio/privacy/import approvals.
