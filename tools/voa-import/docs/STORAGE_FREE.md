# 500 MB plan: storage budget and fail-closed controls

- It matters what the 500MB refers to. If Supabase Free, it usually refers to database size; Supabase Storage quota is separate. Confirm dashboard, do not assume.
- Store **text, URLs, progress** in PostgreSQL; audio goes into R2 Standard (or other licensed object storage), never PostgreSQL BLOB or base64.
- Cloudflare R2 Standard has a 10 GB-month monthly free allowance as of 2026-11, with operations counted separately. This is not a hard account limit; overages can incur charges and an R2 subscription/billing setup may be required. Confirm live pricing.
- The preset is conservative: maximum initial audio 150 MiB, 50 MiB per batch, 15 MiB per file, 50 MiB minimum local disk free plus upcoming file size. These are **configurable software limits**, not provider-enforced cost ceilings.
- For R2 uploader: it checks actual object sizes in the **configured bucket** automatically. Use `--max-r2-mib 8000 --batch-mib 50` as software stop limits; inspect all R2 buckets and account-level billing/operations too, since a single-bucket check is NOT a full account usage check. Review provider billing before execution.
- Estimate 64 kbps (8,000 bytes/sec) -> 1 hour ~28.8 MB, 100h ~2.88GB. These are approximate.
- Do not automatically fetch/keep full original corpus; first index ALL eligible metadata into staging, then choose reviewed clips within budget.
- Download only 64 kbps MP3 where accessible; prefer one original audio per lesson and sentence start/end timestamps; never clone MP3 once per sentence.
- Prevent duplicates via canonical source URL + SHA256. Purge temporary files on error; only reviewed files go to published R2 prefix.
- Record daily storage read/write operation use; hard limit ingestion via monthly counters and alerts, not just object size.
- Make explicit in UI: '98 discovered, 60 with audio, 31 pending QA, 25 verified, 10 uploaded'. Full catalog != all media locally mirrored.
- Prefer metadata-only discovery of all VOA articles to preserve unlimited discovery without consuming media storage. However large transcript storage can ALSO fill DB; only store full text for selected/approved lesson, and cap text length.
