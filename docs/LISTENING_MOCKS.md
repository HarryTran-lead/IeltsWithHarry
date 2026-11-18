# M49L add-only import: Dictation lessons and Listening mock tests

Package: *English Skill Lab M49L ADD ONLY Final Staging FULL* (8 Nov 2026). It adds new records only; the 300 M16.2 Dictation lessons, their audio and learner progress are unchanged (no ID collides, and the tests check the 300 lessons still have 2,702 turns and 2,776 questions).

## What was added

| Data | Where | Count |
| --- | --- | --- |
| Dictation lessons (schema 1.1, answer keys server-side) | `content/dictation-skill-lab/lessons/` (`FND2-*`, `S1–S4-EXP-*`, `S1–S4-SIM-*`) | 280 (120 Foundation, 80 Section practice, 80 Section simulation) |
| Reusable activities (post-test and skill drills) | `content/dictation-skill-lab/activities/` | 400, stored only, no screen yet |
| Listening mock tests (4 parts × 10 questions, transcripts and keys server-side) | `content/listening-mocks/tests/` | 20 |
| Part covers (WebP) | `public/listening-mocks/covers/mock-NN/part-N.webp` | 80 |
| Mock plans | `public/listening-mocks/maps/` | 8 |
| Dictation plans for Section 2 | `public/dictation-skill-lab/maps/M22_MAP_*.svg`, `M26_MAP_*.svg` | 28 |
| Package QA (report, review queues, flags) | `content/listening-mocks/qa/` | |

## Dictation lessons in Skill Lab

- Stages: `FND2` lessons go by level (L1 → Foundation 1, L2 → Foundation 2, L3 → Foundation 3); `S1–S4-EXP/SIM` go to their Section. The API sends `stage` with every lesson (`stageForLesson()` in `src/lib/dictation-skill-lab/stages.ts`).
- Options given as `{key, text}` are shown as "A · text" and graded back to the stored letter or text. Plans for Section 2 come from the lesson's `map_asset`. A Foundation turn's `target_word` is a focus word.
- As with the M16 lessons, a lesson appears to learners when every turn has audio. 100 Section 2 turns have no Vietnamese translation yet; the translation line is simply left out for them.

## Listening mock tests

- Learner pages: `/app/listening/mock` (list) and `/app/listening/mock/<test_id>` (exam). The production release lock allows these two paths only; the rest of Listening stays locked.
- Exam: reading time before each part (sum of the part's group `pre_read_seconds`, 20–60 s), each turn clip played once in order at 1×, no seeking, answers on screen, one submission. Score = raw correct answers out of 40, never a band.
- `GET /api/listening/mocks`, `GET /api/listening/mocks/[id]` (no transcript, answers or explanations; 409 until all audio exists), `POST /api/listening/mocks/[id]/submit` (server grading; completion answers follow the word limit; choose-two questions score independently). The score is saved as `listening-mock:<test_id>` in `package_practice_results` (counted as Listening).
- Audio: one Gemini TTS clip per turn, stored with the Skill Lab clips as `public/dictation-skill-lab/audio/<part_id>/<turn_id>.mp3` and listed in the same manifest. Tests are voiced in the order of `content/listening-mocks/audio-priority.json`. Mock 06 and Mock 01 were chosen first: the widest IELTS question mix (8 types, map labelling in Part 2) and the longest speech (about 22 minutes). The other 18 tests have no audio and stay closed.
- No spoken cues ("You now have 30 seconds…"): the package has no approved cue text, so reading time is a silent countdown on screen.

## Audio production order

`scripts/dictation-skill-lab-tts.mjs` queues priority mock parts first, then Dictation lessons from L1 to L7 (batches ordered by their most basic turn). The daily task (Windows Task Scheduler, 16:30) voices up to 95 requests with `flash-lite`, splits and checks with Whisper, aligns sentences, publishes to `main`, and removes itself when nothing is left.

## Not done (release blockers in the package)

Teacher review of content, answers, plans and covers; human listening QC of the audio; 100 missing Vietnamese translations; review of 40 near-duplicate lesson pairs; screens for the 400 activities (post-test Dictation must open only after that test is completed).
