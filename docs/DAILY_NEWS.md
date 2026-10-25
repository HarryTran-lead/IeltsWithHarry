# Daily English News

## Data flows

`/app/news` reads the RLS-protected `news_archive_catalog` view with database pagination. Users can search, filter by category, source, year and on-site readability, sort newest or oldest, save a headline, and open the publisher's original page. The view joins article metadata to a rights-controlled body and a separately reviewed preview image when available. Preview images also appear on the detail and saved-news pages. Imported rows are retained for historical browsing; the RSS feed's own archive depth and how far back it has been ingested determine actual coverage.

For the official NASA news-release and NOAA feeds, the sync also extracts plain text from individually eligible entries into `news_article_bodies`. Separately, approved NASA and NOAA feeds can supply one agency-hosted lead image per item to `news_article_images`, including metadata-only items. NASA and NOAA news images require an explicit agency credit in the feed. NOAA National Ocean Service images use its [published image guidance](https://oceanservice.noaa.gov/about/faq.html): most are public domain unless otherwise credited, and the sync rejects third-party credits. Each stored image keeps its original URL, alt text, credit, and rights basis; the site links to the original article. Other images, embedded media, scripts, and entries bearing third-party copyright markers are excluded. The full-text rights basis cites [NASA's media usage guidelines](https://www.nasa.gov/nasa-brand-center/images-and-media/) or [NOAA's content guidance](https://www.noaa.gov/office-education/outreach-communication/faq). An image never implies that its article text can be republished. Admins can remove a body or preview if its rights status changes.

`/app/news/learn` reads original or specifically licensed material from `news_learning_articles`. Seven original sample passages cover the seven existing stages. Vocabulary lives in `news_vocabulary`, and quiz keys live separately in `news_answer_keys`. `news_submit_quiz` grades in PostgreSQL, saves attempts, awards XP once per article, and completes a linked planner task. `news_mark_read` and `news_finish_read` distinguish opening and finishing a passage. Words saved to the notebook are available in the Vocabulary Lab review deck. No AI service is used.

`/app/news/learn` also offers deterministic personal suggestions. Learners save a level and preferred topics in `user_news_preferences`. The order also considers completed readings, the most recent quiz result, and words saved in the notebook. The complete reading catalog and manual filters remain available.

The Daily News page presents one archive with an explicit on-site reading filter, separate from editor-authored lessons. A learner can mark an eligible full-text article as read once; `user_news_article_reads` stores the completion per account and the History page shows it. The admin dashboard explains that ordinary news arrives through Cron. Editors only need to add content when they want a curated quiz with fixed answer keys or when reviewing a new source's rights.

The full-text reader fills the available workspace and includes a per-article word explorer. Selecting one word looks up its English definition through [Free Dictionary API](https://dictionaryapi.dev/) and requests a Vietnamese machine translation. Once a meaning is available, the word is saved to the learner's notebook with the article path; the learner can edit the meaning. Bilingual mode aligns each English paragraph with Vietnamese. Chrome desktop uses its [built-in Translator API](https://developer.chrome.com/docs/ai/translator-api) on the learner's device. Other browsers use the server route only when `GOOGLE_CLOUD_TRANSLATE_API_KEY` is configured; without it, the reader shows a clear unavailable message and still allows a manual Vietnamese meaning. The fallback uses [Cloud Translation Basic](https://docs.cloud.google.com/translate/docs/reference/rest/v2/translate) and is capped at 30,000 characters per account per day. Configure the API key only on the server, restrict it to the Translation API, and set a project quota before enabling it.

`/admin/news` is available only to an admin account. The admin can configure feed sources, review imported headlines, edit original/licensed readings, author vocabulary and answer-key questions, publish readings, and inspect sync logs. Database constraints require a recorded rights basis before enabling source ingestion and require a word plus a graded question before publishing a reading.

## Providers and rights

- GDELT DOC API: public article-list discovery, English source-language filter, metadata only. This source is paused after repeated production timeouts; its existing rows are retained. The publisher's full article is never fetched.
- NASA News Releases RSS: official feed at `https://www.nasa.gov/news-release/feed/`, initially approved for automatic metadata publication. Text from individually eligible `www.nasa.gov/news-release/` items is shown on site with NASA attribution. A title that matches the sensitive-content filter still enters review.
- NOAA RSS: official feed at `https://www.noaa.gov/rss.xml`, approved for metadata publication. Individually eligible NOAA-authored text from `www.noaa.gov` news pages is shown on site with NOAA attribution. The feed may include third-party material, which the text extractor excludes when detected.
- NASA Technology, Aeronautics and Space Station: [official NASA RSS feeds](https://www.nasa.gov/rss-feeds/) with metadata and original links. NASA News Releases additionally reads numbered historical RSS pages; `archive_next_page` advances two pages per successful scheduled sync. The authenticated admin can seed up to five selected pages per request through `POST /api/news/sync` with `{ "archivePages": [2, 3] }`.
- NOAA National Ocean Service: [official news RSS](https://oceanservice.noaa.gov/rss.html) includes historical entries. Its unusual nested RSS entries are flattened during import. Eligible agency-hosted feed images appear as previews. The [NSF news RSS](https://www.nsf.gov/rss) stores metadata and original links only.
- Additional RSS/Atom: starts disabled and with `MANUAL_PERMISSION_REQUIRED`. The admin must record a reviewed rights basis, select a restrictive policy, and enable it. The server additionally permits only exact hosts in `NEWS_RSS_ALLOWED_HOSTS`. The default list contains NASA hosts. Adding a new publisher requires an explicit environment change and redeploy.
- Original or licensed passages: stored separately with `rights_status` and `rights_basis`. Non-original material requires a source URL. Audio requires a separate rights basis.

The metadata adapter never stores RSS descriptions or arbitrary publisher imagery. Its image adapter stores only approved official-feed image URLs, credits and rights evidence in a separate RLS-protected table. An entry without an eligible image retains its category illustration. NASA and NOAA article-body exceptions store only individually eligible text in the separate rights-controlled table. The provider rejects redirects, IP-address feed hosts, unsupported schemes, large responses, invalid dates, and non-English GDELT items. Requests have a nine-second timeout, bounded retries, and 50-row database batches. URL hashes and a unique database constraint provide idempotency. A failed sync leaves previously imported records intact.

## Production configuration

Vercel server-only environment variables:

```dotenv
SUPABASE_SERVICE_ROLE_KEY=...  # legacy service_role JWT or server-capable secret key
NEWS_SYNC_SECRET=...           # random 32-byte-or-longer secret
NEWS_RSS_ALLOWED_HOSTS=www.nasa.gov,science.nasa.gov,earthobservatory.nasa.gov,www.noaa.gov,oceanservice.noaa.gov,www.nsf.gov
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
