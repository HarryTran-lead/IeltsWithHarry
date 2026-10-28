# Top three features: implementation and handoff

Released to production on 27 October 2026 through [PR #2](https://github.com/HarryTran-lead/IeltsWithHarry/pull/2). Supabase migrations `202610270011` and `202610270012` were applied to production project `vpkhriywprepuhrbarye` before the merge. Vercel deployment `dpl_F23zNXF6hv2PymnLRbmGNKxKs1Wv` is Ready and aliased to [ieltswithharry.vercel.app](https://ieltswithharry.vercel.app).

## Changed behavior

- **Speaking:** Existing Part 1/2/3, topic bank, cue timers and full mock were kept. `speaking-kit.ts` and `bank-speaking.tsx` now pause/resume recording, stop, replay, retry and explicitly delete takes. Mock sessions automatically save a user-scoped record of prompts, available browser transcript and duration in `speaking_mock_sessions`; demo stores the same metadata locally. The mock screen shows recent sessions, speaking time and a four-criterion self-assessment guide. Learners may explicitly save mock audio after the exam: demo uses device IndexedDB and live accounts use a private Supabase Storage bucket with owner-scoped metadata. Saved takes can be replayed in session history; deleting a session removes its stored audio. Unsaved blobs stay in the current tab. No unofficial band is produced.
- **Listening:** `/app/listening/youtube` adds the official YouTube IFrame player, valid HTTPS URL handling, seek/replay, supported speeds, timestamp-following licensed captions, Shadowing, Repeat After Me, dictation differences, teacher questions and save-to-existing-notebook vocabulary. Video with no lawful caption set can still be viewed; transcript activities stay unavailable. YouTube media and subtitles are never extracted. The existing course Listening player remains unchanged.
- **Admin:** The current Listening admin area (and demo admin) now manages `youtube_listening_lessons`, including title, CEFR, topic, publish state, SRT/VTT validation, synchronization preview, teacher questions and rights source/license. RLS permits writes only for existing admins. Drafts are hidden from learners.
- **Vocabulary:** Existing front/back cards, notebook words, pronunciation, filters, events and planner task flow remain. All saved-word review surfaces now use `ts-fsrs` with Again, Hard, Good and Easy, persisted on the existing `user_word_reviews` row. An atomic database function records state and history together and rejects duplicate/stale submissions. `vocabulary_decks` and `vocabulary_deck_cards` are user-scoped metadata pointing to notebook words; `/app/vocabulary/decks` can create, rename, delete and review decks without copying vocabulary records.

## Files and migration

The additive migrations are `supabase/migrations/202610270011_top3_learning_labs.sql` and `supabase/migrations/202610270012_speaking_recordings.sql`, applied in that order. The first adds FSRS state and request IDs to existing review tables, plus YouTube lesson, speaking-session and deck tables with RLS. The second adds a private, 10 MB per file Speaking bucket and owner-scoped recording metadata with storage policies. Historical saved words, due dates and review events are retained. The first review after migration seeds FSRS from a legacy row's prior interval and repetition count.

Implementation files: `src/lib/news/review.ts`, `src/lib/listening/youtube.ts`, `src/lib/speaking-recordings.ts`, `src/features/listening/youtube-player.tsx`, `src/features/listening/youtube-lab.tsx`, `src/features/listening/youtube-lab.css`, `src/features/admin/youtube-lessons.tsx`, `src/features/vocabulary/vocabulary-decks.tsx`, `src/features/vocabulary/vocabulary-hub.tsx`, `src/features/news/saved-word-review.tsx`, `src/features/ielts/speaking-kit.ts`, `src/features/ielts/bank-speaking.tsx`, `src/features/ielts/speaking-mock.tsx`, `src/features/ielts/ielts-skill-dashboard.tsx`, `src/features/portal.tsx`, `src/features/admin/admin-editor.tsx`, `src/features/admin/demo-admin-editor.tsx`, `package.json` and `package-lock.json`. Tests: `tests/top3-migration.test.ts`, `tests/youtube-listening.test.ts`, `tests/vocabulary.test.ts`, `tests/news.test.ts`.

## Rights and attribution

- [`ts-fsrs` 5.4.2](https://github.com/open-spaced-repetition/ts-fsrs) is MIT licensed. Its scheduling package is the only new dependency.
- The [YouTube IFrame Player API](https://developers.google.com/youtube/iframe_api_reference) embeds videos with native controls and handles playback errors. The app stores no YouTube media and obtains no YouTube captions. Admins must supply and document their own or licensed transcript text before caption activities are published.
- [BandReady](https://github.com/Luxshan2000/ielts-prep) identifies its code as MIT and first-party content as CC0. No BandReady code or content was imported for this change. No code was copied from EchoTalk or english-trainer, and no third-party vocabulary dataset or media was added. Existing data source attributions remain in `docs/VOCABULARY_IMPORT.md` and `docs/AUTO_SKILL_SOURCES.md`.

## Verification

The isolated release branches passed typecheck, full ESLint, production build and the complete suite (**167 passed, 3 skipped**). GitHub Quality passed for the development and production PRs. The migration test verifies that another user cannot read recording metadata or Storage objects and cannot write into someone else's session. Development Supabase received both migrations, then a temporary learner successfully uploaded recording bytes, inserted metadata, downloaded their own file, and was denied anonymous read and cross-user upload; the test account and recording were removed. Its Vercel Preview became Ready. Production migration dry run showed exactly `011` and `012`; both applied, and the subsequent dry run showed no pending migration. A production SQL read-back found the new bucket private and RLS enabled on all five new tables. Production Vercel is Ready; `/` returned HTTP 200 and protected Speaking, Listening, Vocabulary and Admin routes returned the expected login redirect. Earlier demo browser checks confirmed admin and learner page rendering, empty publication validation, invalid YouTube-host rejection, deck empty state, and mobile and desktop layout. Browser microphone permission, IndexedDB replay, a real licensed YouTube lesson, and an authenticated production UI click-through have not been exercised.

## Run locally

Use Node 20.9+ and `npm ci`. In `.env.local`, set `NEXT_PUBLIC_DEMO_MODE=true` for browser-local demo data; then run `npm run dev` and open `/admin` and `/app/listening/youtube`. For a separate live Supabase account, use the existing public Supabase URL/publishable key variables from `.env.example`, set `NEXT_PUBLIC_DEMO_MODE=false`, and apply both additive migrations to an authorized non-production database first. The development and production projects documented in `docs/ENVIRONMENTS.md` already have both migrations. Existing admin membership grants the lesson editor. No new API key is required. The YouTube IFrame API requires network access; browser microphone capture requires a secure origin or localhost and user permission.

## Acceptance checklist

| Area | Status | Notes |
| --- | --- | --- |
| Speaking Parts 1/2/3, topic practice, full mock and cue timing | EXISTING_OK | Existing bank and mock reused. |
| Recording controls, playback, retry, deletion | DONE | Saved mock takes can also be replayed and deleted in history. |
| Session history, learner progress and four-criterion guidance | DONE | Metadata/transcript history, no fabricated score. |
| AI speaking feedback | BLOCKED | Existing AI gateway creates admin content; it has no calibrated learner speaking assessment contract. |
| YouTube playback and failure states | DONE | Official iframe API; requires embeddable video. |
| Caption import, rights, synchronization and admin publish | DONE | No licensed lesson content shipped. |
| Shadowing, Repeat After Me, dictation, questions, video word save | DONE | Available only with admin-supplied lawful captions, except ordinary playback. |
| Saved-word flashcards, filters, progress and planner | EXISTING_OK | Existing modules retained. |
| Four review actions, persistent FSRS, history, deduplication | DONE | Additive migration required in live mode. |
| User deck management | DONE | Deck metadata references notebook words. |
| Persistent private audio playback across sessions | DONE | Explicit save to device IndexedDB in demo or owner-scoped private Storage for live users; browser/live end-to-end check remains. |
| Production rollout | DONE | Migrations applied; Vercel deployment Ready and main alias verified. |
| Authenticated production and media end-to-end checks | PARTIAL | Requires a learner/admin session, microphone permission and a licensed, embeddable video lesson. |
