# IELTS import verification — 2026-10-27

## Production rollout

Deployed commit `7f38470249636c6039675fa9c8de1be802a3cf34` to [ieltswithharry.vercel.app](https://ieltswithharry.vercel.app). Applied migrations `202610270001` and `202610270002` to the linked Supabase project. The cron job is installed and has recorded successful runs. Both source jobs completed with **696 inserts, 0 updates, 0 skips and 0 failures**; both source cursors were saved.

| Source | Reading | Listening | Writing | Speaking | Imported | Published after review |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
| BandReady | 44 | 43 | 102 | 496 | 685 | 641 (43 Reading, 102 Writing, 496 Speaking) |
| IELTS AI Dataset | 5 | 2 | 4 | 0 | 11 | 10 (5 Reading, 1 Listening, 4 Writing) |
| **Total** | **49** | **45** | **106** | **496** | **696** | **651** |

The initial release contained 11 individually inspected exercises. A subsequent source-specific batch check published 640 more, including 513 additional Reading questions with answer keys, 2,628 Speaking questions, complete Writing prompts, and five synthetic Reading sets with 39–41 questions each. All 651 published current versions have zero validation warnings. Task 1 structured charts, tables, processes, and maps are displayed in the learner UI; 22 General Training letters are correctly labeled. The reviewed AI Listening exercise has four ingested audio parts and 40 questions. Its audio and a reviewed Writing image returned HTTP 200 from Supabase Storage. The remaining 45 imports stay in `needs_review`: 43 BandReady Listening records and one AI Listening record lack audio, and one BandReady Reading record lacks a required diagram. Unauthenticated requests to the learner page redirect to login, and the library API returns 401 without a session. Browser use was disabled in Work settings, so an authenticated click-through on the production site was unavailable.

## Source and local integration checks

Current upstream manifests and licenses were read from GitHub. The live normalization audit (`IELTS_LIVE_AUDIT=1 npx vitest run tests/ielts-live-source.test.ts --reporter verbose --silent=false`) produced:

| Source | Commit | Reading | Listening | Writing | Speaking | Blocking warnings before media ingestion |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| BandReady | `10282cc853a03b6984907fec0affe6cbbd4fe0b0` | 44 | 43 | 102 | 496 | 43 `audio_missing`, 4 diagram-label `media_missing` |
| IELTS AI Dataset | `78f7ebf2b430114998aae6806cb92c1a4a475594` | 5 | 2 | 4 | 0 | 2 `audio_missing` (sync attempts to ingest licensed MP3s), 1 Writing image `media_missing` |

The PGlite integration test applies the migration, imports a sample, repeats it without duplication, creates a reviewed/published version, submits a learner attempt, imports a changed revision, and verifies the published/attempt versions and score remain pinned. Connector tests cover actual source-shaped Reading, BandReady Listening, completion gaps, missing keys and incomplete mock classification.

An additional live-source integration test fetched one warning-free BandReady Reading record at the verified commit and imported it into ephemeral PGlite: **1 Reading inserted, 1 repeat skipped, 1 published, 1 learner attempt persisted, raw score 1/13**. This proves the connector and SQL import path against real source data; it does not represent a persistent Supabase import.

Commands run: `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`, the live source audit above, and `IELTS_LIVE_AUDIT=1 npx vitest run tests/ielts-live-import.test.ts --reporter verbose --silent=false`. The latest full suite passed with **128 tests and 2 skipped** after adding a General Training classification regression check. An authenticated browser E2E against production was unavailable because browser use is disabled in Work settings and no test learner session was provided.
