# IELTS data import guide

## Setup

1. Configure a live Supabase project with `NEXT_PUBLIC_DEMO_MODE=false`, `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY`, and server-only `SUPABASE_SERVICE_ROLE_KEY`.
2. Apply `supabase/migrations/202610270001_ielts_question_bank.sql` after the existing migrations, then `202610270002_ielts_sync_cron.sql` to schedule the worker. By default, the worker reuses the existing Daily News Vault URL/secret and `NEWS_SYNC_SECRET` environment variable. Dedicated `ielts_sync_url`, `ielts_sync_secret`, and `IELTS_SYNC_SECRET` may be configured later; set all three together to override the shared worker credential.
3. Grant an account admin rights using the existing `admin_users` process. Open `/admin/ielts-bank`.
4. Click **Xem trước** for a dry-run (no exam writes), then **Sync now**. The browser continues in 20-row batches while open. The cron worker resumes unfinished jobs every five minutes. Each source defaults to a 24-hour refresh; the `sync_hours` column can be changed by an admin.

The initial BandReady feed currently has 685 normalized items, so the first import takes many batches. If a request fails, press **Sync now** again; it resumes its running job. Failed records are logged in `ielts_import_items`; a partial job does not advance the successful source cursor. A later run retries the source idempotently. Cancellation is recorded in `ielts_import_jobs`.

## Manual JSON

The admin page accepts a normalized JSON file up to 1.5 MB, displays it for editing, and requires a reuse/publication rights checkbox. The API logs that confirmation. Example:

```json
{
  "externalId": "my-reading-001",
  "skill": "Reading",
  "title": "My licensed reading exercise",
  "format": "Academic",
  "mode": "practice",
  "durationMinutes": 20,
  "sourceUrl": "https://example.org/original",
  "license": "CC-BY-4.0",
  "licenseUrl": "https://creativecommons.org/licenses/by/4.0/",
  "attribution": "Original author",
  "content": {
    "prompt": "",
    "sections": [{
      "id": "passage-1", "title": "A passage", "passage": "Licensed passage text.",
      "transcript": "", "questions": [{
        "id": "q1", "number": 1, "type": "short-answer",
        "prompt": "Question?", "instructions": "One word",
        "options": [], "answers": ["answer"], "explanation": ""
      }]
    }]
  }
}
```

Missing answers remain warnings and cannot be published. The uploader is intentionally restricted to normalized JSON; arbitrary document extraction has not been implemented.

## Scheduling and API

The scheduler makes `POST /api/ielts/bank/scheduled` with a bearer token from `IELTS_SYNC_SECRET` or the existing `NEWS_SYNC_SECRET`. It only syncs approved/enabled sources that are due or have a running job. The route must be reachable from Supabase `pg_net`. The worker does not clone a repository; it fetches a licensed commit's manifest and selected files. No source credentials are sent to the browser.

To test a local manual sync, run the app with a dedicated development Supabase project, sign in as admin and use `/admin/ielts-bank`. For a local scheduled-call test, POST the same bearer token to `http://localhost:3000/api/ielts/bank/scheduled`. A live database is required; this checkout has no configured development Supabase project. The optional `IELTS_LIVE_AUDIT=1 npx vitest run tests/ielts-live-import.test.ts` exercise imports one real source record into ephemeral PGlite without touching production.
