# Temporary Cloudflare inference path

This path is for a limited evaluation while Oracle A1 capacity is unavailable. It sends a learner's essay to Cloudflare Workers AI **only after the learner clicks “Gửi bài để chấm”**. The Writing submission itself stays in Supabase. The result is labeled an estimated practice band, never an official IELTS score.

Cloudflare Workers AI Free currently includes 10,000 Neurons per day. The selected `@cf/meta/llama-3.3-70b-instruct-fp8-fast` model supports JSON mode and is listed as zero data retention. The budget is shared by all Workers AI uses on the account; reaching it causes inference requests to fail. Confirm the account is on Workers Free before rollout to avoid paid overage. Sources: <https://developers.cloudflare.com/workers-ai/platform/pricing/>, <https://developers.cloudflare.com/workers-ai/features/json-mode/>, <https://developers.cloudflare.com/workers-ai/models/llama-3.3-70b-instruct-fp8-fast/>.

If Cloudflare returns 429, the job stops with a truthful quota message and retry is held until the next 00:00 UTC reset (07:00 Vietnam time). No fallback score is generated.

## Runtime

Vercel processes a queued job in a Next.js `after()` callback after the authenticated request returns. A tiny Cloudflare Worker uses an AI binding and a shared secret, so no expiring Wrangler OAuth token or broad Cloudflare API token is stored on Vercel. The Worker has no essay logging and accepts only a bounded JSON request. Its source is `services/writing-cloudflare-proxy/`. A grading request has a 60-second Vercel duration, 45-second Cloudflare timeout, and 75-second queue lease. A status poll can restart a queued job after a transient failure. The proxy secret and Supabase service role key remain server-side. The essay is not sent from the browser.

## Deployment gates

1. Back up and apply `202611100004_writing_grading_foundation.sql`, then `202611100005_writing_hosted_model_registry.sql` to development. Run authenticated Task 1/2 queue, RLS and retry checks before repeating against production. Do not reset either database.
2. Set `CLOUDFLARE_ACCOUNT_ID`, `WRITING_CLOUDFLARE_PROXY_URL`, `WRITING_CLOUDFLARE_PROXY_SECRET`, `WRITING_GRADING_PROVIDER=cloudflare`, `WRITING_CLOUDFLARE_MODEL_REVISION`, and a distinct `WRITING_GRADING_PIPELINE_VERSION` as server-only Vercel variables. The same proxy secret is bound to the Cloudflare Worker. Keep `WRITING_AUTOGRADING_ENABLED=false` until deployment tests pass.
3. Run `npx tsx scripts/smoke-writing-cloudflare.ts` with the proxy URL and secret. This sends only a synthetic essay and verifies transport, JSON shape, and exact evidence offsets. It does not prove grading accuracy.
4. A Cloudflare-hosted model does not expose an immutable weights checksum. The hosted registry migration records `provider='cloudflare'` and `provider_model_ref` instead of pretending to possess an artifact SHA-256. `pilot` explicitly records that independent teacher evaluation and rights review are pending. The UI labels scores as unvalidated practice estimates. Task 1 additionally requires verified chart facts tied to the exam version.
5. Enable a small cohort with `WRITING_GRADING_ALLOW_PILOT=true` only after live synthetic and authenticated queue tests, quota measurements, and human review. On failure, turn off `WRITING_AUTOGRADING_ENABLED`; saved essays and past results remain intact.

Current state: the fixed model and deployed Worker proxy passed a synthetic Task 2 transport/contract smoke on 2026-11-11. A development Supabase queue smoke also created a synthetic account and submitted attempt, completed a four-criterion result, and removed all synthetic rows. Estimated bands have not been checked against teacher-scored essays.
