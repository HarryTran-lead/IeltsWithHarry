-- More daily, topic-diverse sources whose licences allow full text on site:
-- GOV.UK (Open Government Licence v3.0), Global Voices (CC BY 3.0) and NASA's all-news feed.
-- Reviewed 2026-10-25. The Conversation (CC BY-ND) is not added: its guidelines forbid
-- systematic republishing. UN News is not added: its terms allow personal, non-commercial use only.

-- CC BY requires the author's name at the top of the republished article.
alter table public.news_article_bodies add column byline text check (byline is null or length(trim(byline)) between 2 and 150);

insert into public.news_sources(name, provider, feed_url, category, policy_status, reviewed_basis, attribution_text, enabled, auto_publish, min_interval_minutes)
values
  ('Global Voices', 'rss', 'https://globalvoices.org/feed/', 'Culture', 'FULL_REUSE_ALLOWED',
   'Global Voices Republishing Guidelines (https://globalvoices.org/about/global-voices-attribution-policy/): Global Voices content is CC BY 3.0; show the author and a link to the original at the top; partner and third-party material excluded. Reviewed 2026-10-25.',
   'Source: Global Voices, licensed under CC BY 3.0.', true, true, 60),
  ('NASA News', 'rss', 'https://www.nasa.gov/feed/', 'Science', 'METADATA_ONLY',
   'Official NASA RSS listing: https://www.nasa.gov/rss-feeds/ . NASA-authored article text under NASA media guidelines; third-party material excluded. Reviewed 2026-10-25.',
   'Source: NASA.', true, true, 60),
  ('GOV.UK Health', 'rss', 'https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=department-of-health-and-social-care&organisations%5B%5D=uk-health-security-agency&organisations%5B%5D=medicines-and-healthcare-products-regulatory-agency&content_store_document_type%5B%5D=news_story&content_store_document_type%5B%5D=press_release',
   'Health', 'FULL_REUSE_ALLOWED',
   'GOV.UK content is under the Open Government Licence v3.0 (https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/): copy and adapt with attribution; logos, personal data and third-party material excluded. Reviewed 2026-10-25.',
   'Source: GOV.UK. Contains public sector information licensed under the Open Government Licence v3.0.', true, true, 120),
  ('GOV.UK Environment', 'rss', 'https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=department-for-environment-food-rural-affairs&organisations%5B%5D=environment-agency&organisations%5B%5D=natural-england&organisations%5B%5D=department-for-energy-security-and-net-zero&content_store_document_type%5B%5D=news_story&content_store_document_type%5B%5D=press_release',
   'Environment', 'FULL_REUSE_ALLOWED',
   'GOV.UK content is under the Open Government Licence v3.0 (https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/): copy and adapt with attribution; logos, personal data and third-party material excluded. Reviewed 2026-10-25.',
   'Source: GOV.UK. Contains public sector information licensed under the Open Government Licence v3.0.', true, true, 120),
  ('GOV.UK Education', 'rss', 'https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=department-for-education&organisations%5B%5D=ofsted&organisations%5B%5D=ofqual&content_store_document_type%5B%5D=news_story&content_store_document_type%5B%5D=press_release',
   'Education', 'FULL_REUSE_ALLOWED',
   'GOV.UK content is under the Open Government Licence v3.0 (https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/): copy and adapt with attribution; logos, personal data and third-party material excluded. Reviewed 2026-10-25.',
   'Source: GOV.UK. Contains public sector information licensed under the Open Government Licence v3.0.', true, true, 120),
  ('GOV.UK Science and Technology', 'rss', 'https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=department-for-science-innovation-and-technology&organisations%5B%5D=uk-space-agency&organisations%5B%5D=intellectual-property-office&content_store_document_type%5B%5D=news_story&content_store_document_type%5B%5D=press_release',
   'Technology', 'FULL_REUSE_ALLOWED',
   'GOV.UK content is under the Open Government Licence v3.0 (https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/): copy and adapt with attribution; logos, personal data and third-party material excluded. Reviewed 2026-10-25.',
   'Source: GOV.UK. Contains public sector information licensed under the Open Government Licence v3.0.', true, true, 120),
  ('GOV.UK Business', 'rss', 'https://www.gov.uk/search/news-and-communications.atom?organisations%5B%5D=department-for-business-and-trade&organisations%5B%5D=competition-and-markets-authority&organisations%5B%5D=office-for-national-statistics&content_store_document_type%5B%5D=news_story&content_store_document_type%5B%5D=press_release',
   'Business', 'FULL_REUSE_ALLOWED',
   'GOV.UK content is under the Open Government Licence v3.0 (https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/): copy and adapt with attribution; logos, personal data and third-party material excluded. Reviewed 2026-10-25.',
   'Source: GOV.UK. Contains public sector information licensed under the Open Government Licence v3.0.', true, true, 120)
on conflict (feed_url) where feed_url is not null do nothing;
