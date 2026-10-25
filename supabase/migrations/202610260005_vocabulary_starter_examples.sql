-- Four manually reviewed examples from the existing authored starter catalog.
-- They demonstrate the learner library before a large ZIP is imported.
insert into public.vocabulary_bank_entries
  (source_id, headword, pos, cefr, study_lane, topics, reviewed_topic,
   definition_en, example_en, meaning_vi, source_name, source_url, published)
values
  ('app-curated-curriculum', 'curriculum', 'noun', 'B2', '6-6.5 Independent',
   array['Education & Language'], 'Education & Language',
   'The subjects and content taught in a school or course.',
   'The school updated its curriculum to include digital literacy.',
   'chương trình học', 'IeltsWithHarry authored starter set',
   'https://ieltswithharry.vercel.app/app/vocabulary', true),
  ('app-curated-drought', 'drought', 'noun', 'B2', '6-6.5 Independent',
   array['Environment & Climate'], 'Environment & Climate',
   'A long period with unusually little rainfall.',
   'A long drought affected farmers in the region.',
   'hạn hán', 'IeltsWithHarry authored starter set',
   'https://ieltswithharry.vercel.app/app/vocabulary', true),
  ('app-curated-deadline', 'deadline', 'noun', 'B1', '5-5.5 Developing',
   array['Work & Careers'], 'Work & Careers',
   'The latest time by which a task must be completed.',
   'Our team must meet the project deadline.',
   'hạn chót', 'IeltsWithHarry authored starter set',
   'https://ieltswithharry.vercel.app/app/vocabulary', true),
  ('app-curated-reliable', 'reliable', 'adjective', 'B1', '5-5.5 Developing',
   array['Media & Communication'], 'Media & Communication',
   'Able to be trusted or depended on.',
   'It is important to use reliable online sources.',
   'đáng tin cậy', 'IeltsWithHarry authored starter set',
   'https://ieltswithharry.vercel.app/app/vocabulary', true)
on conflict (source_id) do nothing;
