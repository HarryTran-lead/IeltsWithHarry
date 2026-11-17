# M10-L24 — Mastery follow-up & session API security

**Stage:** S6 (Band 6.5), branch `codex/speaking-s6-m10-l14-staging`
**Status:** staging-only code patch and mocked regression tests delivered; no real Supabase staging E2E certified. S6 stays `STAGING_REVIEW_REQUIRED`, S7 remains locked.

## Baseline verified
- M10-L23 commit `38ea8e665`: GitHub Actions Quality passed (typecheck, lint, tests, build, audio-worker).
- Earlier M10-L21 matrix still has **38 NOT_RUN** until evidence is collected in the disposable staging environment.

## Changes shipped at L24
1. `src/lib/speaking-s6/session-errors.ts`: central fail-closed session error handler. Client receives only stable error codes: 401 `AUTHENTICATION_REQUIRED`, 403 `ADMIN_REQUIRED`, 400 `MALFORMED_JSON`, 422 `SCHEMA_INVALID`, or generic 503 `S6_SESSION_UNAVAILABLE` for database/operational failures. Add `Cache-Control: private, no-store`. Do not return raw Supabase messages.
2. `src/app/api/speaking/s6/session/route.ts`:
   - Wrong-mode `followup`/`guidedFeedback` commands are denied **before any private-bank lookup**.
   - A Mastery or Independent session cannot be created with an absent/blank question.
   - An already submitted Mastery attempt returns a follow-up only if that private prompt is a nonblank string; missing content is a 503 error, not a misleading `null`.
   - Guided feedback requires a nonblank model; missing teacher content fails closed.
   - Authentication and operational errors use the new safe error handler, including DELETE.
3. `tests/speaking-s6-api-boundaries.test.ts`: nine additional mocked regression scenarios for request ordering, no answer leakage, blank content, sanitized errors, wrong-mode requests and noncacheable successful follow-ups.

## Security behavior of the session API
| Action | Requirement | Accessible content |
|---|---|---|
| start | authenticated learner, global release and personal S5; or authenticated admin preview | initial question only |
| status | owner + same preview flag + valid revision | initial question and submitted flag, not future follow-up |
| submit | owner + active revision, first write wins; identical repeat is idempotent | `ok`, never band score |
| followup | owner, submitted Mastery attempt, valid follow-up | follow-up text only |
| guidedFeedback | owner, submitted Guided attempt | guided model and teaching explanation |
| delete | original owner | removes owned audio object(s) before deleting attempt record |

## Explicit limitations / blockers
- The current client-side `durationSeconds` and `transcript` are **self-reported**. The server cannot prove a learner actually spoke. An authenticated learner may spoof the submit request to reveal a post-submission follow-up. This is unsuitable for secure high-stakes assessment; the workflow is only self-study and **cannot certify a band score or unlock S7**.
- No genuine staging user sessions, security scans or mobile devices have been exercised during L24. Unit tests use mocked Supabase responses.
- A production deployment or merge to release requires the 38 documented E2E cases to PASS with independent evidence and five human QA sign-offs.
- Audit and harden rate limits, CSRF/origin protections and speech-evidence validation in a later security milestone before considering broader release.
- Never add R11 answer bank secrets, learner audio, JWTs, environment secrets, or private transcripts to GitHub.

## Verification
```bash
npm ci
npm run typecheck
npm run lint
npm test -- tests/speaking-s6-api-boundaries.test.ts
npm run build
```

Use [GitHub Actions on the staging branch](https://github.com/HarryTran-lead/IeltsWithHarry/actions) for commit-specific CI evidence. Unit/CI success does not equal real staging E2E.

## Next: M10-L25
Investigate anti-harvesting, attempt-start abuse, rate limits, origin/CSRF protections, and separate self-study evidence from validated speaking proficiency. Keep rollout gates false.
