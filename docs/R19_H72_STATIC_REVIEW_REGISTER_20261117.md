# H72 — Static scan review register (commit-bound, NOT staging verification)

**Read only · manual triage · release NO_GO**

## Evidence / provenance
- Repository: HarryTran-lead/IeltsWithHarry
- Source SHA: `2ec71c47bcc55ea95009122b4a71605c708b101f`
- GitHub Actions: https://github.com/HarryTran-lead/IeltsWithHarry/actions/runs/44080195182
- Inventory artifact: `h72-dependency-report-and-source` (artifact ID `14326906498`; seven-day retention)
- Recorded outcome: `STATIC_INVENTORY_PRODUCED` with 27/27 unit tests passing in H72 specialized workflow
- Scanner read **2,137** eligible source files and **1,052,356** lines; `package-lock.json` excluded with documented reason
- `application_direct_h58_reference_paths`: **0**. This only means no *direct static* reference found in paths classified as application runtime; it is not evidence that deployed services cannot access H58.
- `application_service_role_or_client_paths`: **32** candidate paths below. A possible client indicator is not proof of elevated permissions or access to H58.
- `unclassified_source_reference_paths`: **0**. Dynamic references and off-repository services remain unverified.
- Supabase staging **0/18 NOT_TESTED**, DBA/security sign-off missing. `NO_GO` remains mandatory.

## Triage instructions
For each path, the reviewer must record (a) deployed surface and environment, (b) whether it actually constructs/uses a privileged client, (c) whether it accesses H58 directly, via RPC, generated SQL, or through a dependent service, (d) least-privilege/grant implications, (e) evidence ID + SHA + project identity, and (f) independent reviewer. **Do not add secrets, JWTs, code snippets, or personal data to this register.** Treat cloud workers, cron, Edge Functions and other integrations that are not in the repository as separate unknowns.

## Paths requiring manual confirmation

### Worker/service paths (4)
- [ ] `services/audio-worker/test_worker.py` — deployment/H58 access **NOT_VERIFIED**
- [ ] `services/audio-worker/worker.py` — deployment/H58 access **NOT_VERIFIED**
- [ ] `services/speaking-cloudflare-worker/src/index.js` — deployment/H58 access **NOT_VERIFIED**
- [ ] `services/speaking-cloudflare-worker/src/index.node-check.mjs` — deployment/H58 access **NOT_VERIFIED**

### Public share routes (2)
- [ ] `src/app/(public)/notebook/share/[token]/page.tsx` — deployment/H58 access **NOT_VERIFIED**
- [ ] `src/app/(public)/reading/share/[token]/page.tsx` — deployment/H58 access **NOT_VERIFIED**

### Admin API routes (3)
- [ ] `src/app/api/admin/ai-content-factory/route.ts` — deployment/H58 access **NOT_VERIFIED**
- [ ] `src/app/api/admin/users/route.ts` — deployment/H58 access **NOT_VERIFIED**
- [ ] `src/app/api/admin/vocabulary-phase5/route.ts` — deployment/H58 access **NOT_VERIFIED**

### IELTS bank API routes (13)
- [ ] `src/app/api/ielts/bank/admin/route.ts` — deployment/H58 access **NOT_VERIFIED**
- [ ] `src/app/api/ielts/bank/attempt/route.ts` — deployment/H58 access **NOT_VERIFIED**
- [ ] `src/app/api/ielts/bank/catalog/route.ts` — deployment/H58 access **NOT_VERIFIED**
- [ ] `src/app/api/ielts/bank/library/route.ts` — deployment/H58 access **NOT_VERIFIED**
- [ ] `src/app/api/ielts/bank/review-highlights/route.ts` — deployment/H58 access **NOT_VERIFIED**
- [ ] `src/app/api/ielts/bank/scheduled/route.ts` — deployment/H58 access **NOT_VERIFIED**
- [ ] `src/app/api/ielts/bank/share/route.ts` — deployment/H58 access **NOT_VERIFIED**
- [ ] `src/app/api/ielts/bank/speaking-coaching/route.ts` — deployment/H58 access **NOT_VERIFIED**
- [ ] `src/app/api/ielts/bank/writing-feedback/route.ts` — deployment/H58 access **NOT_VERIFIED**
- [ ] `src/app/api/ielts/bank/writing-grading/route.ts` — deployment/H58 access **NOT_VERIFIED**
- [ ] `src/app/api/ielts/bank/writing-insights/route.ts` — deployment/H58 access **NOT_VERIFIED**
- [ ] `src/app/api/ielts/bank/writing-review/route.ts` — deployment/H58 access **NOT_VERIFIED**
- [ ] `src/app/api/ielts/bank/writing-source-facts/route.ts` — deployment/H58 access **NOT_VERIFIED**

### Other API routes (4)
- [ ] `src/app/api/grammar/placement/route.ts` — deployment/H58 access **NOT_VERIFIED**
- [ ] `src/app/api/progress/insights/route.ts` — deployment/H58 access **NOT_VERIFIED**
- [ ] `src/app/api/progress/route.ts` — deployment/H58 access **NOT_VERIFIED**
- [ ] `src/app/api/streak-leaderboard/route.ts` — deployment/H58 access **NOT_VERIFIED**

### Libraries/deployment (6)
- [ ] `src/lib/deployment-environment.ts` — deployment/H58 access **NOT_VERIFIED**
- [ ] `src/lib/grammar/placement.ts` — deployment/H58 access **NOT_VERIFIED**
- [ ] `src/lib/ielts-bank/server.ts` — deployment/H58 access **NOT_VERIFIED**
- [ ] `src/lib/news/sync.ts` — deployment/H58 access **NOT_VERIFIED**
- [ ] `src/lib/writing-grading/cloudflare-worker.ts` — deployment/H58 access **NOT_VERIFIED**
- [ ] `src/lib/writing-grading/server.ts` — deployment/H58 access **NOT_VERIFIED**

## Remaining release blockers
- Independent DBA verifies actual Supabase staging project identity, schema privileges, `service_role` grants and dependent RPC execution; no live changes without approval.
- Independent security reviewer inspects real JWT/RLS and denied-access cases, using isolated staging test accounts.
- Collect 18/18 required, hash-bound staging artifacts and independent sign-offs; a synthetic CI report is not sufficient.
- Continue to keep H67–H72 draft/unmerged, teacher gold unverified and learner auto-grading blocked.

> This document is an immutable **triage snapshot of the source SHA above**. Future commits require a fresh scan; do not reuse these counts as attestations for another deployed SHA.
