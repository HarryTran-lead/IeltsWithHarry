# AI Content Factory architecture

The Admin route `/admin/ai-content-factory` uses the existing Admin shell and service-role API (`/api/admin/ai-content-factory`). Only authenticated admins can call it. Students continue to read published `ielts_exams` and pinned `ielts_exam_versions`; their requests never invoke synthesis.

The factory uses `ai_factory_jobs` as a persistent queue. A separate Python process atomically claims a Listening audio job, renders dialogue turns with Kokoro, stores the MP3 in private `ai-factory-drafts` storage, and writes segment timing, technical QA, evidence intervals, and usage records. Admin listens to a ten-minute signed URL and explicitly approves the audio. Approval copies it to `ielts-audio`, creates a new exam revision, and leaves the exam in `needs_review`. Existing bank actions mark it ready and publish it. `reviewExam` requires an approved audio job for factory Listening content.

The original Part 3 pilot is in `src/lib/ai-factory/pilot.ts`. It contains 20 dialogue turns, three fixed voices and ten scored questions. Worker cache keys include the model hash, voice, pace and canonical text. Generated audio is reused across students.

The factory's database migration is `supabase/migrations/202610270010_ai_content_factory.sql`. It adds settings, voice profiles, jobs, segments, QA and usage, with admin-only read policies. Mutations are made by the server's service-role client or by the private worker. No student-facing generation endpoint exists.

Current rollout is limited to a Listening Part 3 pilot. Local Faster Whisper ASR runs before review. Reading, Writing, Speaking AI generators, full mocks, an unattended scheduler, paid providers, student feedback and segment repair are future work; the Admin UI does not claim these are operational. The pilot passed technical, answer and owner audio review before publishing on 2026-10-27.
