# IELTS import verification — 2026-10-27

Local environment: no dedicated development Supabase project or Supabase CLI. Production credentials are present locally, but this feature has not been deployed or imported into production. Database migrations were executed against PGlite with a Supabase auth/storage stub. **Records written to a live Supabase project: 0. Live import job successes/failures: 0/0.**

Current upstream manifests and licenses were read from GitHub. The live normalization audit (`IELTS_LIVE_AUDIT=1 npx vitest run tests/ielts-live-source.test.ts --reporter verbose --silent=false`) produced:

| Source | Commit | Reading | Listening | Writing | Speaking | Blocking warnings before media ingestion |
| --- | --- | ---: | ---: | ---: | ---: | --- |
| BandReady | `10282cc853a03b6984907fec0affe6cbbd4fe0b0` | 44 | 43 | 102 | 496 | 43 `audio_missing`, 4 diagram-label `media_missing` |
| IELTS AI Dataset | `78f7ebf2b430114998aae6806cb92c1a4a475594` | 5 | 2 | 4 | 0 | 2 `audio_missing` (sync attempts to ingest licensed MP3s), 1 Writing image `media_missing` |

The PGlite integration test applies the migration, imports a sample, repeats it without duplication, creates a reviewed/published version, submits a learner attempt, imports a changed revision, and verifies the published/attempt versions and score remain pinned. Connector tests cover actual source-shaped Reading, BandReady Listening, completion gaps, missing keys and incomplete mock classification.

An additional live-source integration test fetched one warning-free BandReady Reading record at the verified commit and imported it into ephemeral PGlite: **1 Reading inserted, 1 repeat skipped, 1 published, 1 learner attempt persisted, raw score 1/13**. This proves the connector and SQL import path against real source data; it does not represent a persistent Supabase import.

Commands run: `npm run typecheck`, `npm run lint`, `npm run build`, `npm test`, the live source audit above, and `IELTS_LIVE_AUDIT=1 npx vitest run tests/ielts-live-import.test.ts --reporter verbose --silent=false`. The final full suite passed with **127 tests and 2 skipped**. During concurrent work in the shared checkout, an intermediate full run could not find an unrelated Daily News migration that was being added; the subsequent full run passed after that file appeared. A browser E2E against live Supabase could not run without an attached development project and admin/student accounts.
