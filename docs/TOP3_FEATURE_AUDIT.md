# Top three feature audit (27 October 2026)

Scope: repository at this commit, inspected before feature changes. The working tree already had unrelated IELTS bank edits and new original-test content; those files are outside this work.

## Architecture and boundaries

Next.js 16 App Router and React 19 route through `src/app/app/[[...slug]]/page.tsx` → `src/features/portal.tsx`; admin routes through `src/app/admin/[[...slug]]/page.tsx` → `src/features/admin/admin-editor.tsx`. Demo data uses browser storage; live data uses Supabase with RLS. `src/features/notebook/notebook-store.tsx` is the shared saved-word store. `src/features/planner/planner-page.tsx` and `src/features/demo/demo-store.tsx` own planner tasks. Existing tests are in `tests/`.

## Speaking

| Capability | Status | Evidence / action |
| --- | --- | --- |
| Parts 1–3, cue cards, topic bank, individual practice | COMPLETE | `src/features/ielts/speaking-kit.ts` parses all parts; `bank-speaking.tsx` presents a studio, cues and question navigation; `src/features/ielts/bank-student.tsx` uses it. |
| Full mock, 60-second prep, 120-second answer | COMPLETE | `src/features/ielts/speaking-mock.tsx` loads all three parts and enforces timers. |
| Microphone, playback, retry, browser STT | PARTIAL | `speaking-kit.ts` records to object URLs and uses SpeechRecognition when supported; `bank-speaking.tsx` plays and retries. Pause and explicit deletion are missing. Recordings disappear on navigation. |
| Session history and progress | PARTIAL | `speaking-mock.tsx` can manually save a text summary to notebook. There is no structured history or persistent recording store. |
| AI criterion feedback | MISSING | `src/lib/ai-factory/text-generation.ts` is an admin content gateway, not a learner speaking assessor. No calibrated scoring provider or verified audio assessment path exists. No scores should be generated. |

## Listening and YouTube

| Capability | Status | Evidence / action |
| --- | --- | --- |
| Existing Listening lessons, audio and comprehension | COMPLETE | `src/features/learning/course-package-practice.tsx` has a listening studio, transcript and exercises; `learning-page.tsx` has a sample listening activity. Keep these flows. |
| YouTube lab, licensed subtitle ingestion, synchronized sentences | MISSING | Study room YouTube streams in `src/features/study-room/` are background broadcasts, not lesson practice. No lesson transcript/rights model or player controls exists. |
| Shadowing, Repeat After Me, video dictation, vocabulary capture | MISSING | Existing package `shadow_phrases` are local lesson text, not YouTube transcript activity. Extend Listening with a separate video lesson surface using shared notebook storage. |
| Admin lesson management | MISSING | `src/features/admin/admin-editor.tsx` has a Listening content editor but no licensed YouTube lesson manager. Extend its Listening section and use its admin role boundary. |

## Vocabulary

| Capability | Status | Evidence / action |
| --- | --- | --- |
| Flashcard front/back, meanings, examples, speech, topic/level filters, practice | COMPLETE | `src/features/vocabulary/vocabulary-hub.tsx` and `vocabulary-study.tsx`. |
| Saved words, deduplication, review history, due/new counts, planner | COMPLETE | Notebook store and `supabase/migrations/202610250009_vocabulary_hub.sql` reject duplicate words; `vocabulary_review_events` records ratings; `vocabulary-hub.tsx` creates due tasks in the existing planner. |
| Again / Hard / Good / Easy and actual FSRS | PARTIAL | `src/lib/news/review.ts` implements arbitrary fixed intervals and only Again/Good/Easy; `user_word_reviews` in `202610240010_news_read_completion.sql` stores interval/repetition but no FSRS card state. Extend these tables additively and migrate review logic. |
| Deck management | PARTIAL | Topic/level collections exist, but no user-managed decks. This is lower priority than correct scheduling and video word capture. |

No duplicate learner vocabulary table, API or page should be added. The current `user_word_reviews` rows must be retained while adding FSRS state. Existing course Listening and Speaking activities remain available.

## Implementation follow-up

The missing workflows were added locally after this audit. See [TOP3_FEATURE_IMPLEMENTATION.md](TOP3_FEATURE_IMPLEMENTATION.md) for the change inventory, migration, attribution, test results and acceptance checklist. This audit records the **pre-change** state so the skip/extend decisions remain reviewable.
