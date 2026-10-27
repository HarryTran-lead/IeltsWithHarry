# Content Factory test report

Production pilot status as of 2026-10-27: the database migration, web route, Kokoro audio, reviewed exam and student practice flow are live. Continuous background queue processing is not yet hosted.

- TypeScript typecheck: passed in the workspace after concurrent course-book edits were completed.
- Full Vitest suite in the shared workspace: 268 passed, 4 skipped (54 files). The isolated release checkout based on the current Git main passed 136, with 3 skipped (28 files).
- Pilot schema/scoring test: 1 passed.
- Targeted ESLint on changed TypeScript and JavaScript files: passed. Repository-wide lint scans unrelated `.claude/worktrees` build output and reports generated-code errors.
- Python audio QA unit tests: 4 passed with Python 3.11, Kokoro 0.9.4 and Torch 2.6.0 installed.
- Real Kokoro local pilot: generated `services/audio-worker/output/pilot-part3.mp3` (1,211,732 bytes, SHA-256 `E11A47B33DFAA02B1C62DEFA4659953A48F131A6560648DCD652C58D2DDE3DE6`). FFmpeg independently decoded the MP3: 2:53.45, 24 kHz mono.
- Technical QA: passed; 20/20 segments, 0 clipped samples, longest silence 1.428 s, ten answer evidence intervals present. Report: `services/audio-worker/output/ai_factory_qa.json`.
- Local Faster Whisper `base.en` ASR: completed separately against the generated MP3; normalized word error rate 0, no listed answer phrase missing. ASR report was merged into the local QA JSON. It is not a naturalness assessment.
- Database migration: parsed and exercised in isolated PGlite. Migration `202610270010` was then applied to production. Read-back verified safe defaults, four voices and a private draft bucket. A subsequent linked CLI dry run reported no pending migrations.
- Docker build: unavailable on this Windows host (Docker is not installed).
- Next production build: passed in both the workspace and an isolated deployment checkout. The isolated deployment was promoted to `https://ieltswithharry.vercel.app` (Vercel deployment `dpl_3RS3ccHCaYbfjrBGgnxA7yHqLxR7`).
- Production Kokoro worker: ran one queued job and uploaded a private MP3. QA passed with 20/20 turns, three speakers, 0 clipped samples, 1.434 s longest silence, ten evidence intervals, normalized ASR WER 0 and no missing answer phrases. The exact approved MP3 has SHA-256 `7e9faa90dccb67e753298fc276d0712e084d081f1291a328181835f55468d2eb` and is publicly reusable after approval.
- Production student flow: a temporary student account saw the pilot in the Listening catalog, loaded ten questions with hidden answer keys, streamed the audio (HTTP 206), started/saved/submitted an attempt, received 10/10, and had the saved result and pinned version verified in Supabase. The temporary account was deleted afterward.
- Guest security check: the Admin Factory API returned HTTP 401; anonymous access to the private draft object was denied.
- Visual Admin QA: the guest browser was redirected to `/login`; an authenticated visual pass of the Admin screen has not been completed.

The owner listened to and explicitly approved the exact production audio in this chat. Ten answer keys were checked against the script and production ASR. A service-role deployment script recorded the approval and publication with a review note; no Admin account was impersonated. The pilot is a standalone Listening Part 3 practice, not a full mock. No paid TTS API was used; host, Vercel, storage and network charges were not measured. The Windows worker was stopped after this one job, so future queued jobs require a persistent worker host.
