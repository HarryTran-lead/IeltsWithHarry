# Token and request budget

Normal V2 invocation has a hard ceiling of **two attempted Gemini requests per article invocation**: one generation, one independent blind QA. The wrapper increments the budget before starting each network call. It uses one configured model and has no 503 retry, quota fallback, repair call or top-up. On HTTP 429 it classifies RPM/TPM/RPD from the provider message when possible, retains `retry-after`, and returns `PENDING_QUOTA`; on other provider failures `PENDING_PROVIDER`. A structurally failed generation uses one request and no QA call.

Default model: `gemini-3.5-flash-lite`; override with `NEWS_QUESTION_FACTORY_V2_MODEL` only after independently confirming its Free Tier availability. Requests require `AI_FACTORY_FREE_TIER_ONLY=true`, `AI_FACTORY_FREE_TIER_CONFIRMED=true` and `AI_FACTORY_GEMINI_API_KEY`. No actual provider calls were made for this handoff.

Token reporting reads Gemini `usageMetadata.promptTokenCount`, `candidatesTokenCount`, `totalTokenCount` for each response. When the provider omits fields, audit values are null; no estimated usage is labelled as measured. Mock integration evidence: generation 100 prompt + 50 candidate = 150 total; QA 200 + 100 = 300 total; two requests. These are artificial test values, **not** a production token benchmark.

Generation allows up to 16,000 output tokens and QA up to 6,000. The actual prompt and output cost depends on article length, selected types and model; it cannot be estimated credibly from the offline fixture alone. Admin preview is a manually triggered invocation and can repeat per article; the automatic scheduler uses the DB retry hold. A globally durable per-fingerprint budget ledger would require a schema change and is outside the no-migration limit.
