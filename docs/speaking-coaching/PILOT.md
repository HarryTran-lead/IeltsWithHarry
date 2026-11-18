# Speaking Part 2 coaching pilot

The Speaking mock records Part 1–3 in the browser. A learner can save a Part 2 recording in the private Supabase `speaking-recordings` bucket and explicitly request analysis. Only that recording is processed. The result is practice feedback from an automatically recognized transcript, not a pronunciation assessment or IELTS band.

## Production path: Cloudflare free plan

1. Apply `202611140001_speaking_coaching_pilot.sql` and `202611140002_speaking_cloudflare_duration.sql` to the production Supabase project.
2. Deploy `services/speaking-cloudflare-worker` with Wrangler. Set Worker secrets `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `WORKER_TRIGGER_SECRET`, and `SPEAKING_WORKER_ENABLED=true`. No key may be added to `wrangler.toml` or a browser bundle. The Worker has a two-minute Cron Trigger and a secret-protected `POST /run` endpoint for manual operation.
3. Test one synthetic recording through the real queue. Verify that the Worker claims the job with a lease, downloads the private audio from Supabase, runs Cloudflare Whisper and Llama, stores transcript-grounded feedback, and creates an in-app notification. The Worker logs IDs and error codes only.
4. Set `SPEAKING_COACHING_ENABLED=true` in the production website environment and redeploy. The website admits at most two analyses per learner and ten globally per rolling 24 hours. The Cloudflare Workers AI free allocation is **shared with Writing**. If its daily allocation is depleted, the job remains queued until the next UTC day. Admission limits are pilot safeguards, not a guaranteed daily capacity.

The Worker processes one job at a time. It validates the private storage path and size (10 MiB), uses word timestamps for speaking rate and pauses, rejects short or invalid transcripts, and requires every coaching evidence quote to be an exact part of the transcript. A stale worker cannot overwrite another attempt because results use the job lease token. Permanent failures and completed analyses create in-app notifications. The original audio remains in Supabase Storage.

## Quality limits and review

- ASR can mistranscribe accented or noisy speech. Learners should compare the transcript with their recording. Word timing is approximate; pauses and speed are practice observations.
- Feedback covers organization visible in the text, vocabulary, and grammar. Cloudflare does not provide an independently validated pronunciation score or examiner-equivalent band here.
- Review 20–30 consented recordings with transcript correction and IELTS-teacher review before increasing access. Track queue delay, errors, and Workers AI usage without logging private audio or transcripts.
- The prior Oracle offline worker remains in `scripts/speaking-coaching-worker.ts` as an optional future path. It is not active in this deployment because Oracle Batam has no Always Free A1 host capacity.
