# Speaking Part 2 private coaching pilot

The existing Speaking mock records Part 1–3 in the browser. Learners may save recordings in the private `speaking-recordings` Supabase bucket. This pilot analyzes **one saved Part 2 recording** per mock session (5–130 seconds), with an explicit button. It does not move audio to Cloudflare R2 or send audio/transcripts to Workers AI.

## Processing

1. Apply `supabase/migrations/202611140001_speaking_coaching_pilot.sql` to the intended Supabase project. The additive table has owner-only read access. Only the server service role can enqueue jobs, and only a service-role worker can claim or finish them. A lease token fences stale worker results; deleting a mock session also deletes its job.
2. On the Oracle host, install Python with `faster-whisper` and `av` (the existing audio worker already uses `faster-whisper`), plus Node dependencies with `npm ci`. Download and pin a `base.en` or `tiny.en` CTranslate2 model directory in advance; the worker requires a local path and will not fetch model weights at runtime. Set `NEXT_PUBLIC_SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY`, `SPEAKING_LOCAL_MODEL_ID`, `SPEAKING_LOCAL_MODEL_REVISION`, `SPEAKING_ASR_MODEL_PATH`, `SPEAKING_ASR_MODEL_ID=base.en`, optionally `SPEAKING_LOCAL_MODEL_URL=http://127.0.0.1:11434`, and `SPEAKING_PYTHON=python3` in the private worker environment. Set `SPEAKING_SHARE_ORACLE_WITH_WRITING=true` only if a local Writing worker runs on the same Oracle host. Ollama must stay on loopback. Run `npx tsx scripts/speaking-coaching-worker.ts --once` to smoke the queue, then supervise the continuous command.
3. Only after the worker succeeds on test recordings, set `SPEAKING_COACHING_ENABLED=true` on the website. The website never runs transcription in a request. It admits up to two analyses per learner and ten globally in a rolling 24-hour window. These application-level quotas are conservative pilot limits; simultaneous submissions can race, so measure actual throughput before expanding access.

When Writing and Speaking share the same Oracle host, set `SPEAKING_SHARE_ORACLE_WITH_WRITING=true` so the worker checks the Writing queue before claiming a Speaking job. It downloads one private audio object, transcribes locally with `faster-whisper` CPU `int8`, derives word rate and pauses from timestamps, then asks a pinned loopback Ollama model for three transcript-grounded coaching cards. The stored result contains no pronunciation rating or overall IELTS band. An in-app notification links to the saved result. Failed jobs retain the original recording and session.

## Measurement and quality gate

- Record 20–30 consented Part 2 samples of varied length and recording quality. Log only job IDs, durations, CPU/RAM, queue delay and errors; do not log audio or transcript text.
- Compare ASR text with learner-corrected transcripts. Check whether pause timestamps reflect the original audio. Reject unusable audio rather than inventing feedback.
- Ask an IELTS teacher to review the coaching cards for unsupported corrections. Pronunciation and a four-criterion band require separate audio-based validation before release.
- Keep the feature flag off if the Oracle worker is unavailable. Existing Speaking mock, recordings and self-review continue to work.
