# Kokoro deployment

Use a persistent CPU or GPU host with Docker, outbound access to Supabase and enough storage for the model plus cached WAVs. Do not run the model in Vercel. The worker publishes no ports.

1. Apply `supabase/migrations/202610270010_ai_content_factory.sql` to the target project and inspect the new tables, policies, RPC and storage bucket.
2. Set `NEXT_PUBLIC_SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` on the Next server. Copy `services/audio-worker/.env.example` to `services/audio-worker/.env` on the worker host and fill the same project URL plus its service-role key. Keep the file outside Git and restrict file access. The key must never reach client code.
3. In `services/audio-worker`, run `docker compose build` then `docker compose up -d`. The first inference downloads the verified Kokoro 1.0 weights. Mount the cache volume persistently.
4. In Admin, create one pilot. Watch worker logs and the queue until `awaiting_review`. Listen to the complete draft, verify all answers, then approve the audio. In the IELTS bank, inspect the revised exam, mark ready and publish. Complete a student attempt and confirm scoring and saved progress in staging.

Production pilot status on 2026-10-27: migration `202610270010` is applied, the Next deployment is live, and the pilot exam `5359bea5-c7ab-4efc-b4cd-acf3d5339cdf` is published with approved job `cdfd458a-5aed-4761-9232-6e2ead909a91`. The owner approved the exact production MP3 in chat after listening; `scripts/publish-ai-factory-pilot.mjs` recorded that approval without impersonating an Admin account. A temporary student passed the complete production API flow and was deleted. The Windows worker was run for this job and stopped afterward. Continuous queue processing still requires a persistent worker host with secrets configured; do not enable unattended generation until that host exists.

If Docker is unavailable, use Python 3.11 or 3.12, install `requirements.txt`, `python -m spacy download en_core_web_sm`, and `espeak-ng`, set `SUPABASE_URL`, `SUPABASE_SERVICE_ROLE_KEY` and `AUDIO_CACHE_DIR`, then run `python worker.py`. Kokoro's package declares Python `<3.14`; Python 3.14 is not supported for this worker.

Rollback: stop the worker; disable production scheduling; cancel queued jobs; archive any published factory exam through the bank; retain versioned attempts. Do not drop factory tables or remove storage objects until their references and audit records have been exported. Revert the web deployment separately. Never delete learner attempts during rollback.
