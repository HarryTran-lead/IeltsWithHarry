# VOA Learning English — FULL catalog discovery + R2-first Dictation importer

**Purpose:** import as much properly accessible VOA Learning English content as rights and budgets permit into English Skill Lab, with **permanent audio in Cloudflare R2** and text/progress in the existing database.

## Three different kinds of storage

| Layer | Contents | Permanent? |
|---|---|---|
| Local SQLite (`data/voa_ingest.sqlite`) | Crawler checkpoint, staging QA queue, logs | No; worker-only |
| Cloudflare R2 | Verified human-voice VOA MP3s, keyed by SHA256 | **Yes: production audio** |
| Existing Supabase/PostgreSQL | Approved transcript, metadata, segment timestamps, learner scores | **Yes: production app data** |

No TTS substitutions, no direct hotlink of source media for learner playback. The importer respects blocks and robots/access restrictions. Rights are verified per asset; third-party content is excluded. The isolated dev Preview can expose unreviewed official Conversation MP3s for testing when the dev operator explicitly requests it; these are labeled as test lessons and do not carry review flags.

## Setup

```bash
cd tools/voa-import
python -m pip install -r requirements.txt
cp .env.example .env   # configure yourself, NEVER commit real secrets
PYTHONPATH=src python -m pytest -q
```

Export `.env` fields to your shell with a secure method (the scripts do **not** automatically read a `.env` file).

## Stage 1: Discover VOA metadata — does NOT consume R2

```bash
python scripts/voa_ingest.py discover --contact you@example.com --max-items 10000
python scripts/voa_ingest.py parse --contact you@example.com --limit 40
python scripts/voa_ingest.py status
python scripts/voa_ingest.py queue
python scripts/voa_ingest.py export-catalog --output data/export_catalog.jsonl
```

The `discover` and `parse` commands contact the **official VOA site** and should run on a controlled worker/machine, never a frontend request. `export-catalog` is an offline metadata-only export for the dev Admin queue; it does not include unreviewed transcript text. You can add approved official archive URLs to a newline-separated file and run:

```bash
python scripts/voa_ingest.py seed-manifest --file source_urls.txt
```

Official RSS isn't a complete archive; report actual discovered coverage. Site changes may require parser adaptation. Don't automate around 403/429/robots.

## Stage 2: Review and locally stage an eligible recording

```bash
python scripts/voa_ingest.py approve --id 1 --reviewer "Editor" --rights-verified --transcript-verified --notes "VOA-produced audio reviewed against exact transcript, no third-party content"
python scripts/voa_ingest.py download --contact you@example.com --batch-mb 50 --total-mb 150
python scripts/verify_media.py --help
```

The review command should only be used after **real human review**; it is not a permission bypass. The audio file downloads temporarily to `data/media` for verification.

For the isolated learner Preview, use `scripts/dev_preview.py` as documented in `docs/VOA_DICTATION_DEV.md`. Its download and upload commands resume from the local checkpoint, and its export creates estimated segments without claiming review.

To replace those estimated Preview cuts with audio-based sentence boundaries on the isolated development project, install `requirements-alignment.txt`, run `scripts/batch_word_timestamps.py`, then `scripts/align_voa_sentences.py`. Review the reported match rates and rejected sentences before running `scripts/write_aligned_sql.py --output data/import_aligned.sql`. Apply the generated file only with `supabase db query --linked --project-ref bhactqaxcvusmpeooxwi --file data/import_aligned.sql`. The import resets attempts tied to replaced Preview segments; it never sets human review flags. Source audio, model output, and generated SQL stay in the ignored local `data/` directory.

## Stage 3: Upload reviewed MP3 to **Cloudflare R2**

Set the following secrets as environment variables in your secure worker:

```
CLOUDFLARE_ACCOUNT_ID=...
R2_ACCESS_KEY_ID=...
R2_SECRET_ACCESS_KEY=...
R2_BUCKET=english-skill-lab-media
```

Dry-run (checks actual bucket usage):

```bash
python scripts/r2_upload.py --max-r2-mib 8000 --batch-mib 50
```

After reviewing dry-run and provider billing settings:

```bash
python scripts/r2_upload.py --max-r2-mib 8000 --batch-mib 50 --execute
```

Use `--purge-local-on-success` **only** when you want staging MP3s removed after the R2 copy is verified. A 10GB-month free allowance is NOT an enforced account-level budget; excess usage or requests may incur charges.

## Stage 4: Integrate into website

The website integration is in `supabase/migrations/202611010002_voa_dictation.sql`, `src/features/listening/voa-dictation.tsx`, and `src/features/admin/voa-dictation-admin.tsx`. Follow `docs/VOA_DICTATION_DEV.md` at repository root for dev-only import and review. Only hosted-and-approved media become available for students.

## Project status

This folder contains the offline importer. It does not include a pre-downloaded corpus. R2 upload and historic archive completeness require separate verified access and review.
