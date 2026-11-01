# VOA Dictation development rollout

The ZIP supplied with this task contains an offline importer and an implementation brief, not an audio catalog. Its `CODEX_MASTER_PROMPT.md` is a reference document; this app uses the actual Supabase schema and routes in this repository. Only a human reviewed VOA recording with matching transcript and timed segments can be published.

## Environments and credentials

- Migrations: `supabase/migrations/202611010002_voa_dictation.sql` and `202611010003_voa_published_lock.sql` on **development** project `bhactqaxcvusmpeooxwi`. Do not apply them to production as part of this rollout.
- Set `R2_MEDIA_BASE_URL` on the `develop` Vercel Preview to the HTTPS, read-only R2 custom domain. No R2 write key belongs in Vercel or any `NEXT_PUBLIC_` variable.
- Give the offline worker `CLOUDFLARE_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET` in its own environment. `tools/voa-import/.env.example` lists them. Keep its SQLite and `data/media` outside Git.
- Configure the R2 custom domain for `GET`/`HEAD`, `Range`/`206 Partial Content`, `Content-Type: audio/mpeg`, and CORS for the dev Preview origin. Confirm these using the actual deployed domain and an uploaded sample MP3 before publishing.

## Import sequence

From `tools/voa-import`, install `requirements.txt` then run the bounded `discover`, `parse`, `queue`, `approve`, `download`, and `verify_media.py` commands in its README. `approve` represents real rights and transcript review. The worker stops on access blocks and limits download and upload batches. Discovery does not make content visible to learners.

Run `scripts/r2_upload.py` without `--execute` for an R2 usage dry run, then use `--execute` only after confirming bucket and budget. It uploads hash keyed MP3s with SHA256 metadata and checks the object size and metadata after upload. Export only uploaded rows with `python scripts/voa_ingest.py export --output data/export_verified.jsonl`.

At repository root, import those records as unpublished development drafts:

```bash
node --env-file=.env.development.local scripts/import-voa-staging.mjs tools/voa-import/data/export_verified.jsonl
```

This script requires the development Supabase URL and a server-only service role key in the operator environment. It refuses the production project, skips existing source URLs, and never publishes. Review each draft at `/admin/listening/voa`: compare the original article and MP3, edit the transcript, enter checked sentence boundaries in milliseconds, confirm rights, audio, transcript and CEFR, save, then publish. The database rejects incomplete publication. Learners use `/app/listening/voa`, with audio redirected to R2 and attempts saved per account.

## Reporting and release gate

Report actual worker `status` counts, dev table counts, R2 bucket bytes from the uploader, and CDN range/CORS results. Empty counts are expected before credentials and human review. Production remains behind its existing Listening release lock; do not enable it until real media, migration, cross-device playback, source rights and admin/learner permission checks have passed.
