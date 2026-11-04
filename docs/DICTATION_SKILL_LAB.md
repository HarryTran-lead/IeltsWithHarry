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

On the product owner's decision (5 Nov 2026), every lesson whose turns all have audio is open in production to signed-in learners. Lessons still waiting for audio show "Đang tạo audio" and cannot be opened. No lesson has teacher sign-off yet, so the bank carries a draft note and machine-flagged clips have a dashed outline in the player. Guests are asked to sign in. Set `DICTATION_SKILL_LAB_LOCKED=true` in the server environment to close the bank to learners (admins keep access). An IELTS teacher should still read and listen to each lesson (content, answers, audio, accent, names and numbers).

## Audio production (Gemini TTS)

Each turn is its own clip, so a replay covers exactly one turn and timestamps come from real clip lengths. The text sent to Gemini is the transcript, word for word. Accent and pace go only into the speech-style annotation: L1 slow, L2 slightly slow, L3/Foundation calm, Sections at natural exam pace. Each accent has a main female and male voice. Named characters get a voice of matching gender, and no two speakers in a lesson share one.

Tier 1 allows **100 TTS requests per model per day**, so one request per turn would take about 27 days. Instead the pipeline batches turns:

1. `node --env-file=.env.local --experimental-strip-types scripts/dictation-skill-lab-tts.mjs --max-requests 90`
   This groups turns that share a voice and style (about 2,400 characters or 24 turns each) and asks Gemini to read them as separate items with a pause between them. Each raw WAV is saved in `.cache/dictation-skill-lab/batches/` (git-ignored). Models are tried in order: `gemini-3.8-flash-tts`, then `gemini-3.8-flash-lite-tts` when the first hits its daily cap. The script resumes where it stopped.
2. `python scripts/dictation-skill-lab-split.py --verify-existing`
   This transcribes each batch with faster-whisper (`base.en`, word timestamps), aligns the words to the known turn texts, cuts at the quiet point between turns and writes the MP3s and manifest. Each clip gets a word error rate: `pass` ≤ 0.15, `review` ≤ 0.40 (kept, flagged for listening), otherwise rejected. A rejected turn is requested again on the next run; after two rejections it is kept as `review`.
3. Re-run both until no turns are left. `--redo-flagged` re-voices `review` clips, and `--models gemini-3.8-flash-tts` re-voices with the main model only.

### Running it every day automatically

`scripts/dictation-skill-lab-daily.ps1` runs steps 1 and 2 once, with `flash-lite` only so every lesson keeps one model and up to 95 requests. It logs to `.cache/dictation-skill-lab/daily.log`, skips if a previous run is still working, and removes its scheduled task once no turns are left. It is registered in Windows Task Scheduler as **IeltsWithHarry Skill Lab audio**, daily at 15:30 Vietnam time (the quota resets at midnight Pacific, 15:00 in winter). It runs late if the computer was off, and only while the user is signed in. To check or remove it:

```powershell
Get-ScheduledTask -TaskName "IeltsWithHarry Skill Lab audio" | Get-ScheduledTaskInfo
Unregister-ScheduledTask -TaskName "IeltsWithHarry Skill Lab audio" -Confirm:$false
```

The ASR check is an automatic screen. Audio stays `generated_needs_human_QA` until a person listens. Gemini API terms also apply to how this audio is used: check the conditions for learners under 18 before a public release.

## Tests

`npx vitest run tests/dictation-skill-lab.test.ts` checks bank integrity (300/2,702/2,776, evidence IDs, options, word limits), that the public lesson leaks no answers or transcript, map and matching rendering data, the grader cases from the package's `test_suite.py`, the voice plan and the preview flag.
