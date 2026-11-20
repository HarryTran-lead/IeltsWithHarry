# Speaking Lab data

Speaking Lab (`/app/self-study/speaking`) is built from the M10-L80 curriculum handoff
(`IELTS_Speaking_M10_L80_Final_Curriculum_Import_Handoff_Pack.zip`). That pack is nested deep inside
`IELTS_Speaking_M11_R05_Evidence_Atomic_Repair_Codex_FULL.zip`. The outer M11 layers are staging and RLS tooling,
not lessons.

## What phase 1 uses

| Source | Used for |
| --- | --- |
| L48 `skill_taxonomy.json` | The 16 skills: 4 criteria × 4 skills |
| L67 `route_catalog.json`, `skill_guides_NEW_L67.json`, `onboarding.json` | One route and one guide per skill, plus the level labels |
| L65 `skill_consolidation_catalog.json`, `two_stage_questions_SERVER_ONLY.json`, `skill_guides_AFTER_ATTEMPT.json` | Each skill's 2 questions (first try and a later transfer) and the weak/better coaching |
| L41 `repair_catalog.json` | Repair card for each route: goal, useful language, self-check |
| L79 `lesson_catalog_METADATA_ONLY.json`, `questions_SERVER_ONLY.json`, `guidance_AFTER_CURRENT_ATTEMPT.json`, `models_AFTER_LESSON_COMPLETION.json` | 24 Part 1/2 topic lessons, each with 6 tasks, per-task tips, a teaching card and a model |

Phase 2 adds:

| Source | Used for |
| --- | --- |
| L57 lessons, moves, questions, coaching, models | 16 Part 3 argumentation lessons (6 turns) |
| L58 lessons, moves, questions, coaching, models, fallacy labs | 16 critical-thinking lessons (7 turns) |
| L59 lessons, phase guide, questions, hints, models | 16 precision lessons (6 turns) |
| L60 lessons, phase guide, 8 repair strategies, questions, guidance, models | 32 repair lessons (5 turns; 8 Part 1, 8 Part 2, 16 Part 3) |
| L39 modules, lessons, listening items, answer key, 24 WAV previews; L40 transfers | 24 pronunciation lessons: listening check (vowel, consonant and final-sound modules), drill, transfer answer |

Notes on phase 2:
- L58–L60 have no Vietnamese titles. They take L57's title through their source links, tagged (A)/(B) for L57's two variants. L60's Part 1/2 titles are translated in the script.
- The L39 audio is synthetic and unverified. It is used only to check listening, never as a pronunciation model.
- Part 2 cue cards can be sent to the existing coaching queue. This reuses the practice room's `PracticeCoaching`. It runs only in live mode while coaching is enabled, and only when the learner chooses to upload.

Phase 3 adds 8 full mock tests in the **Thi thử** tab:
- L61 M01–M04 and L63 M01–M04, 16 questions each, in Part 1 → Part 2 → Part 3 order.
- One question opens at a time. There are no tips during the test.
- After the last question the server releases:
  - the debrief per part;
  - for L61, sample excerpts.
- The Part 2 take can go to the coaching queue from the review list.
- The existing mock room (`/app/speaking/mock`) is unchanged. It loads whole exams from the question bank, which would expose questions the handoff keeps one-at-a-time.

Teacher review: the script `teacher_qa.py` (kept outside the repo) writes `L79_teacher_review_36.csv` next to the private file. It covers the 36 sampled L79 prompts with their tip and lesson model, plus OK/Sửa columns for the six review categories.

Still for later:
- L56: adaptive discussion paths.
- L61's 32 repair-transfer drills.
- L62's retention review paths.

Not lessons, so not imported:
- L66, L69–L78: staging matrices, synthetic histories, sync contracts.

## Release rule

The handoff's rule, implemented in `releaseFor` (`src/lib/speaking-lab/types.ts`):
- A task's question opens once every earlier task is done.
- A task's tip opens after the learner has spoken it.
- The coaching card opens after the first task.
- The model opens after the last task.

Progress is stored as one `writing_drafts` row per unit (`spk-lab:<unitId>`). The release route reads that row,
so a learner cannot ask for content they have not reached. Recordings stay in the browser (IndexedDB) and are
never uploaded.

## Rebuilding

Run with `python -I`, because the source is untrusted data:

```
python -I scripts/import-speaking-lab.py <L80 folder> <private folder outside the repo>
```

- `<L80 folder>` contains `manifest/` and `milestones/`.
- Every source file is checked against the SHA-256 in `manifest/import_routing_DRY_RUN_ONLY.csv`.
- The script writes:
  - `content/speaking-lab/catalog.json`, which is committed. It holds titles and task shapes only.
  - `<private folder>/speaking-lab-private.json`, which is never committed.

## Where the private file lives

- **Local and Preview:** `SPEAKING_LAB_DIR=<folder containing speaking-lab-private.json>`.
- **Production:**
  1. Create a **private** Supabase Storage bucket.
  2. Upload `speaking-lab-private.json` to its root, and the 24 files in `audio/` to an `audio/` folder.
  3. The server reads the bucket `speaking-lab` with `SUPABASE_SERVICE_ROLE_KEY`; set `SPEAKING_LAB_BUCKET` only to use another name. Done for prod and dev on 2026-11-20 (25 files).
- **Neither set:** the map still loads, and lessons say the content is being updated.

## Opening the lab

The lab is open everywhere; `NEXT_PUBLIC_DISABLE_SPEAKING_LAB=true` locks it again. Until the private bucket is set, the map loads but every lesson says its content is being updated. Still pending after release:
- teachers review the L79 samples (36 pending in the handoff);
- a live account is tested end to end.
