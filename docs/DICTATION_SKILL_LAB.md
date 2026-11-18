# IELTS Skill Lab dictation bank (M16.2)

The **IELTS Skill Lab** bank in Dictation (`/app/dictation/banks/skill-lab`) holds the 300 lessons from the *English Skill Lab Dictation M16.2 Repair Package*. They run from Foundation drills (F1 sounds, F2 sentences/numbers/times, F3 short conversations) to IELTS Listening Sections 1–4. The package's lesson IDs, 2,702 turns and 2,776 question IDs are unchanged.

## What is where

| Path | Contents |
| --- | --- |
| `content/dictation-skill-lab/lessons/*.json` | The 300 staged lessons, schema 1.1, copied unchanged from `01_LESSONS_PATCHED_DRAFT`. They include answer keys, so they are **not** under `public/`. |
| `content/dictation-skill-lab/audio-manifest.json` | One entry per voiced turn: MP3 path, real duration, voice, accent, model, text hash, Whisper WER check. |
| `content/dictation-skill-lab/lesson_v1_1.schema.json`, `QA_REPORT_M16_2.md`, `summary.json` | Package schema and QA notes. |
| `public/dictation-skill-lab/audio/<lesson>/<turn>.mp3` | One 48 kbps mono clip per turn. |
| `public/dictation-skill-lab/maps/*.svg` | The 18 plans used by the 36 Map labelling questions. |
| `src/lib/dictation-skill-lab/` | Server loader and sanitiser (`lessons.ts`), grader (`grade.ts`), access rule (`access.ts`, `preview.ts`), TTS voice plan (`tts-plan.ts`). |
| `src/app/api/dictation/skill-lab/` | `GET /` catalog, `GET /[id]` lesson for the player, `POST /[id]/grade`. |
| `src/features/listening/skill-lab-dictation.tsx` | Catalog and lesson player. |

## Learner behaviour

- **Practice:** replay any single turn, slow it down, check a question at once. Practice aliases (for example a number written in words) are accepted.
- **Làm bài một lần (IELTS mode):** the recording plays once, straight through. Nothing is revealed until the whole lesson is submitted. Answers must match `correct_answers` and the completion word limit (hyphenated words count once, one number allowed, a UK postcode counts as a number).
- The player receives prompts, options, map image and audio URLs only. Transcript, answers and explanations come back from the grading endpoint for the questions that were graded; the full transcript, translation and word list come only with a whole-lesson submission.
- Answers in progress are kept in the browser (`localStorage`). Scores go to the existing `package_practice_results` table as `skill-lab:<lesson_id>`, which RLS already limits to the owner, so no migration is needed. Scores are practice feedback and are never shown as an IELTS band.

## Release

On the product owner's decision (5 Nov 2026), every lesson whose turns all have audio is open in production to signed-in learners. Lessons still waiting for audio show "Đang tạo audio" and cannot be opened. Guests are asked to sign in. Set `DICTATION_SKILL_LAB_LOCKED=true` in the server environment to close the bank to learners (admins keep access). An IELTS teacher should still read and listen to each lesson (content, answers, audio, accent, names and numbers).

## Learning modes and progress (November 2026 update)

- **Nghe & chép:** every transcript sentence is a separate audio segment, in every Foundation and Section stage. Enter checks the typed sentence; if it is still wrong, the next Enter reveals one more reference word and replays that sentence. The learner must type the complete sentence correctly; the next Enter advances, focuses the input, and plays the next sentence. Ctrl + Enter replays the current sentence.
- `POST /api/dictation/skill-lab/[id]/dictation` checks one sentence. It returns that sentence's transcript and feedback only; the player reveals the reference progressively. Results use versioned keys per sentence (`skill-lab-turn:v2:<lesson>/<turn>`) and lesson (`skill-lab-dictation:v2:<lesson>`) in `package_practice_results`, so older partial passes do not count as correct under the new rule.
- **Luyện tập** and **Làm bài một lần** contain only the IELTS-style questions, numbered in listening order. Dictation sentences are no longer repeated there.
- **Luyện nhanh** (`/app/dictation/practice`): ten random transcript sentences for one skill (`skills.ts`: numbers, spelling, dates, sounds, places, everyday, academic). The practice runner also reveals one word per Enter until the whole sentence is typed correctly. `GET /api/dictation/skill-lab/practice` returns counts, or a set with audio and sentence timings only.
- **Sổ câu sai** (`/app/dictation/review`): sentences whose latest attempt did not pass in Skill Lab, VOA and Quick (Quick uses its 80% line because its transcript stays on the server until an attempt). Passing a sentence removes it.
- **Dashboard / Progress:** Skill Lab results count as Listening; VOA and Quick attempts count once per day per bank.
- **Planner:** "Đặt lịch hôm nay" on the Dictation page adds "Dictation 15 phút", which links back to Dictation.
- **Streak:** `supabase/migrations/202611060001_dictation_streak_activity.sql` adds activity triggers to the VOA, Quick and practice-result tables. It is **not applied yet**; apply it with the usual migration workflow. Until then, saving a word to the notebook and completing the Planner task already count toward the streak.
- **Shortcuts:** Ctrl + Enter replays the sentence in every bank (a lone Ctrl no longer plays audio, so copy and paste are safe). On phones the bottom bar hides while typing and the notebook bubble hides during practice.

## Path, checks and lesson steps (wave 3)

- **Path map** (`/app/dictation/banks/skill-lab`): the seven stages F1 → S4 with lessons done, the next lesson, and an end-of-stage check. A stage is suggested once 70% of the previous stage's lessons are done (every sentence passed) or its check is passed; later stages are never hard-locked, only labelled "Nên học sau".
- **Placement** (`/skill-lab/placement`): about 10 short sentences from F1 upward, each heard once, answers shown at the end. `recommendStage()` in `path.ts` suggests the first stage with under half the sentences passed or under 80% word accuracy; if every tested stage went well, the stage after the highest one tested (Section 4 sentences are too long for a placement). Saved as `skill-lab-placement:<stage>`.
- **End-of-stage check** (`/skill-lab/stage/<id>/test`): ten sentences of that stage, heard once; 80% passes. Best result saved as `skill-lab-stagetest:<stage>`.
- `GET /api/dictation/skill-lab/check?kind=placement|stage&stage=S1` returns the sentences (audio only); each answer is checked through `/[id]/dictation`, and misses go to Sổ câu sai.
- **Lesson steps**: 1 Nghe & chép → 2 Câu hỏi → 3 Làm bài một lần (optional) → Tổng kết. The summary shows sentences passed, questions right, words met (with "Lưu vào Sổ tay"), sentences to redo, and the next unfinished lesson of the stage (or the stage check when none is left). Finishing every sentence plays a small celebration.
- **Weekly goal** (3/5/7/10 lessons, default 5; saved as `skill-lab-goal:weekly`): counts lessons whose every sentence passed since Monday. Shown on the path page and as "Dictation tuần này" on the Dashboard.

## Interface (wave 4)

- **Shared playback** (`dictation-playback.tsx`): one speed list (0.5–1.5×), auto-replay 0–5 times with a 0.5–3 s pause, remembered in this browser and shared by Skill Lab, Luyện nhanh, Sổ câu sai, VOA and Quick. A thin bar shows the time of the sentence that is playing. One-pass mode and placement/stage checks always play at 1×, once.
- **Lesson cards** have the topic illustration (`topicIllustration`), a progress ring for sentences passed, and Vietnamese labels (Cấp 1, Luyện âm, Luyện câu, Hội thoại ngắn, Làm quen Section, Luyện Section). Lesson IDs are no longer shown to learners.
- **Dictation page** stage cards show lessons done per stage and highlight the stage suggested by the placement.
- **Làm bài một lần**: 30 seconds to read the questions (with "Nghe ngay"), then a running clock. On wide screens the map sits beside the questions and stays in view.
- **Quick Dictation** is presented as advanced practice (audiobook sentences in older English) and grouped into sets of 20, shortest first, each with its own progress; previous/next stay inside the set.

## Audio production (Gemini TTS)

Each source turn is its own MP3. `dictation-sentence-timings.py` aligns the sentences inside it and records playback boundaries in the audio manifest, so the learner hears only one transcript sentence at a time. The text sent to Gemini is the transcript, word for word. Accent and pace go only into the speech-style annotation: L1 slow, L2 slightly slow, L3/Foundation calm, Sections at natural exam pace. Each accent has a main female and male voice. Named characters get a voice of matching gender, and no two speakers in a lesson share one.

Tier 1 allows **100 TTS requests per model per day**, so one request per turn would take about 27 days. Instead the pipeline batches turns:

1. `node --env-file=.env.local --experimental-strip-types scripts/dictation-skill-lab-tts.mjs --max-requests 90`
   This groups turns that share a voice and style (about 2,400 characters or 24 turns each) and asks Gemini to read them as separate items with a pause between them. Each raw WAV is saved in `.cache/dictation-skill-lab/batches/` (git-ignored). Models are tried in order: `gemini-3.8-flash-tts`, then `gemini-3.8-flash-lite-tts` when the first hits its daily cap. The script resumes where it stopped.
2. `python scripts/dictation-skill-lab-split.py --verify-existing`
   This transcribes each batch with faster-whisper (`base.en`, word timestamps), aligns the words to the known turn texts, cuts at the quiet point between turns and writes the MP3s and manifest. Each clip gets a word error rate: `pass` ≤ 0.15, `review` ≤ 0.40 (kept, flagged for listening), otherwise rejected. A rejected turn is requested again on the next run; after two rejections it is kept as `review`.
3. `python scripts/dictation-sentence-timings.py --fast` creates sentence boundaries at pauses, then `python scripts/dictation-sentence-timings.py --refine-fast` aligns them to ASR word timestamps. These commands only process new or estimated boundaries.
4. Re-run the pipeline until no turns are left. `--redo-flagged` re-voices `review` clips, and `--models gemini-3.8-flash-tts` re-voices with the main model only.

### Running it every day automatically

`scripts/dictation-skill-lab-daily.ps1` runs the audio and sentence-alignment steps once, with `flash-lite` only so every lesson keeps one model and up to 95 requests. It logs to `.cache/dictation-skill-lab/daily.log`, skips if a previous run is still working, and removes its scheduled task once no turns are left. It is registered in Windows Task Scheduler as **IeltsWithHarry Skill Lab audio**, daily at 15:30 Vietnam time (the quota resets at midnight Pacific, 15:00 in winter). It runs late if the computer was off, and only while the user is signed in. To check or remove it:

```powershell
Get-ScheduledTask -TaskName "IeltsWithHarry Skill Lab audio" | Get-ScheduledTaskInfo
Unregister-ScheduledTask -TaskName "IeltsWithHarry Skill Lab audio" -Confirm:$false
```

The ASR check is an automatic screen. Audio stays `generated_needs_human_QA` until a person listens. Gemini API terms also apply to how this audio is used: check the conditions for learners under 18 before a public release.

## Tests

`npx vitest run tests/dictation-skill-lab.test.ts` checks bank integrity (300/2,702/2,776, evidence IDs, options, word limits), that the public lesson leaks no answers or transcript, map and matching rendering data, the grader cases from the package's `test_suite.py`, the voice plan and the preview flag.
