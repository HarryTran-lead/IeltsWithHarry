# Daily English News

## Data flows

`/app/news` reads published metadata from `news_articles` with database pagination. Users can filter, search, save a headline, and open the publisher's original page. `news_articles` does not contain article bodies, images, or audio. GDELT records cite [The GDELT Project](https://www.gdeltproject.org/); underlying publisher pages remain external.

For the official NASA news-release and NOAA feeds, the sync also extracts plain text from individually eligible entries into `news_article_bodies`. The on-site reader shows it with source attribution and a link to the original. The extraction excludes images, embedded media, scripts, and entries bearing third-party copyright markers. The per-article rights basis cites [NASA's media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/) or [NOAA's content guidance](https://www.noaa.gov/office-education/outreach-communication/faq). Other publisher articles remain links unless a rights review supports reuse. Admins can delete a body if its rights status changes.

`/app/news/learn` reads original or specifically licensed material from `news_learning_articles`. Seven original sample passages cover the seven existing stages. Vocabulary lives in `news_vocabulary`, and quiz keys live separately in `news_answer_keys`. `news_submit_quiz` grades in PostgreSQL, saves attempts, awards XP once per article, and completes a linked planner task. `news_mark_read` and `news_finish_read` distinguish opening and finishing a passage. Words saved to the notebook are available in the Vocabulary Lab review deck. No AI service is used.

`/app/news/learn` also offers deterministic personal suggestions. Learners save a level and preferred topics in `user_news_preferences`. The order also considers completed readings, the most recent quiz result, and words saved in the notebook. The complete reading catalog and manual filters remain available.

The Daily News page now separates automatically imported on-site articles from editor-authored lessons. A learner can mark an eligible full-text article as read once; `user_news_article_reads` stores the completion per account and the History page shows it. The admin dashboard explains that ordinary news arrives through Cron. Editors only need to add content when they want a curated quiz with fixed answer keys or when reviewing a new source's rights.

`/admin/news` is available only to an admin account. The admin can configure feed sources, review imported headlines, edit original/licensed readings, author vocabulary and answer-key questions, publish readings, and inspect sync logs. Database constraints require a recorded rights basis before enabling source ingestion and require a word plus a graded question before publishing a reading.

## Providers and rights

- GDELT DOC API: public article-list discovery, English source-language filter, metadata only. Its initial source is enabled but **manual review** is required before a headline appears to learners. The publisher's full article is never fetched.
- NASA News Releases RSS: official feed at `https://www.nasa.gov/news-release/feed/`, initially approved for automatic metadata publication. Text from individually eligible `www.nasa.gov/news-release/` items is shown on site with NASA attribution. A title that matches the sensitive-content filter still enters review.
- NOAA RSS: official feed at `https://www.noaa.gov/rss.xml`, approved for metadata publication. Individually eligible NOAA-authored text from `www.noaa.gov` news pages is shown on site with NOAA attribution. The feed may include third-party material, which the text extractor excludes when detected.
- Additional RSS/Atom: starts disabled and with `MANUAL_PERMISSION_REQUIRED`. The admin must record a reviewed rights basis, select a restrictive policy, and enable it. The server additionally permits only exact hosts in `NEWS_RSS_ALLOWED_HOSTS`. The default list contains NASA hosts. Adding a new publisher requires an explicit environment change and redeploy.
- Original or licensed passages: stored separately with `rights_status` and `rights_basis`. Non-original material requires a source URL. Audio requires a separate rights basis.

The metadata adapter does not store RSS descriptions, publisher photos, or provider imagery. The NASA news-release exception stores only extracted plain text in the separate rights-controlled table. It rejects redirects, IP-address feed hosts, unsupported schemes, large responses, invalid dates, and non-English GDELT items. Requests have a nine-second timeout, bounded retries, and 50-item batches. URL hashes and a unique database constraint provide idempotency. A failed sync leaves previously imported records intact.

## Production configuration

Vercel server-only environment variables:

```dotenv
SUPABASE_SERVICE_ROLE_KEY=...  # legacy service_role JWT or server-capable secret key
NEWS_SYNC_SECRET=...           # random 32-byte-or-longer secret
NEWS_RSS_ALLOWED_HOSTS=www.nasa.gov,science.nasa.gov,earthobservatory.nasa.gov,www.noaa.gov
```

The first two must never use the `NEXT_PUBLIC_` prefix. Production already uses `NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` for RLS-protected browser access.

Before applying `202610240009_news_cron.sql`, create two Supabase Vault secrets:

```sql
select vault.create_secret('https://YOUR_PRODUCTION_DOMAIN/api/news/sync', 'news_sync_url');
select vault.create_secret('SAME_VALUE_AS_NEWS_SYNC_SECRET', 'news_sync_secret');
```

The migration enables `pg_net` and `pg_cron`, then schedules `english-skill-lab-news-30m` at `*/30 * * * *`. Cron calls `POST /api/news/sync` with a bearer token read from Vault. The endpoint also supports a same-origin, authenticated admin's manual sync button. Each source has its own minimum interval of at least 30 minutes. Check `cron.job`, `cron.job_run_details`, `net._http_response`, and `public.news_sync_runs` to verify operation. A successful Cron job means the HTTP request was queued; confirm an HTTP 200 and a source-level success row before saying sync works. Never print Vault's decrypted token in logs.

## Limits

GDELT availability and the publishers' metadata quality are external. Article-list publication times can sometimes be the time GDELT observed an item rather than its original publication time; the UI displays the supplied time without inventing a replacement. RSS dates are read from `pubDate`, `dc:date`, `published`, or `updated`. Source errors are visible in the admin log and the last successful check is shown to learners. A collection older than two hours displays a stale notice.

Source policy and licensed-content evidence must be reviewed by a responsible editor. RSS availability by itself does not grant full-content reuse. No BBC or Guardian feed is enabled. The seven original sample readings are educational examples, not breaking news.
