# Cost control

Kokoro uses local compute and has no per-request TTS API charge. Hosting, electricity, storage and transfer may still cost money. `ai_factory_usage` records characters, audio duration and API cost separately. The dashboard reports only recorded API spend and does not estimate host cost as zero.

Paid provider fallback is disabled in the database and cannot be enabled from the current Admin UI. The manual pilot creation endpoint enforces the daily job limit, initially two. The queue claim function enforces a concurrency limit, initially one. Scheduled generation is not active; the `generation_enabled` setting is a future control and does not launch jobs by itself. Do not interpret it as an operational scheduler.

The app's student AI allocation is not changed. Before adding a paid text or TTS provider, implement real provider usage accounting and hard daily/monthly application-side limits, then review the provider's separate billing controls. A zero API estimate is valid only for the Kokoro request, not for hosting.
