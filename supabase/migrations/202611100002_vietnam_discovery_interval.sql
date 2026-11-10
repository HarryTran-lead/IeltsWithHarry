-- The fact-discovery worker has 20-minute slots, while the original 60-minute
-- source interval left two of every three slots without eligible feeds.
-- Thirty minutes is the minimum permitted by news_sources and yields two
-- bounded research attempts per hour without repeatedly fetching every feed.
update public.news_sources
set min_interval_minutes = 30
where provider = 'ai_rewrite'
  and auto_publish = false
  and policy_status = 'METADATA_ONLY'
  and feed_url in (
    'https://e.vnexpress.net/rss/news.rss',
    'https://e.vnexpress.net/rss/life.rss',
    'https://e.vnexpress.net/rss/business.rss',
    'https://news.tuoitre.vn/rss',
    'https://mst.gov.vn/rss/tin-tuc-su-kien.rss',
    'https://baochinhphu.vn/giao-duc.rss',
    'https://baochinhphu.vn/y-te.rss',
    'https://baochinhphu.vn/kinh-te.rss',
    'https://baochinhphu.vn/van-hoa.rss',
    'https://baochinhphu.vn/du-lich.rss'
  );
