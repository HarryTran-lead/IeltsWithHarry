-- Give the six original published lessons usable, editable examples.
insert into public.lesson_materials(lesson_id,content)
select id, jsonb_build_object('skill','Grammar','rule','Use the Present Simple for habits and facts. With he, she or it, add -s or -es to most verbs.','example','She studies English every day.','figure',jsonb_build_object('url','https://english-skill-lab-ruby.vercel.app/illustrations/study-desk.svg','alt','English study desk'))
from public.lessons where slug = 'grammar-present-simple' on conflict (lesson_id) do nothing;

insert into public.lesson_materials(lesson_id,content)
select id, jsonb_build_object('skill','Reading','passage','In a busy city, even a small garden can make a difference. Maya and her neighbours turned an empty space beside their apartment building into a community garden. They planted tomatoes, herbs and flowers. Every Saturday morning, families water the plants together. The garden gives people fresh food, but it also helps neighbours get to know each other. Maya says the best part is seeing children learn where vegetables come from.','figure',jsonb_build_object('url','https://english-skill-lab-ruby.vercel.app/illustrations/city-garden.svg','alt','A community garden between apartment buildings'))
from public.lessons where slug = 'reading-city-gardens' on conflict (lesson_id) do nothing;

insert into public.lesson_materials(lesson_id,content)
select id, jsonb_build_object('skill','Listening','transcript','Hi, I am Lily. I read English stories on Mondays. On Wednesdays, I practise speaking with my friend. At the weekend, I listen to a short podcast and write down three new words.','audioUrl','','figure',jsonb_build_object('url','https://english-skill-lab-ruby.vercel.app/illustrations/study-desk.svg','alt','Headphones and a study desk'))
from public.lessons where slug = 'listening-daily-life' on conflict (lesson_id) do nothing;

insert into public.lesson_materials(lesson_id,content)
select id, jsonb_build_object('skill','Writing','prompt','Write at least 40 words about how a device helps you learn English. Explain what it is, how you use it and why it helps.','minWords',40,'modelAnswer','My phone helps me learn English every day. I use it to read short stories and listen to simple podcasts. When I see a new word, I save it in a note and review it later. This device is useful because I can study anywhere, even on the bus.','checklist',jsonb_build_array('Name the device','Explain how you use it','Give a reason or example','Check punctuation and verb tense'),'figure',jsonb_build_object('url','https://english-skill-lab-ruby.vercel.app/illustrations/study-desk.svg','alt','Laptop and notebook on a study desk'))
from public.lessons where slug = 'writing-technology' on conflict (lesson_id) do nothing;

insert into public.lesson_materials(lesson_id,content)
select id, jsonb_build_object('skill','Speaking','prompt','Describe a device you use for learning. What is it, how often do you use it, and why do you like it?','preparationSeconds',15,'modelAnswer','I often use my phone to learn English. I listen to short podcasts on the bus and look up new words. I like it because it is easy to carry and lets me practise for a few minutes every day.','checklist',jsonb_build_array('Answer all parts of the question','Give one specific example','Listen again and notice pauses'),'figure',jsonb_build_object('url','https://english-skill-lab-ruby.vercel.app/illustrations/study-desk.svg','alt','Laptop and headphones for speaking practice'))
from public.lessons where slug = 'speaking-technology' on conflict (lesson_id) do nothing;

insert into public.lesson_materials(lesson_id,content)
select id, jsonb_build_object('skill','Vocabulary','introduction','Useful words for everyday digital life. Learn the meaning, save the word and try your own sentence.','figure',jsonb_build_object('url','https://english-skill-lab-ruby.vercel.app/illustrations/study-desk.svg','alt','Digital devices for studying English'))
from public.lessons where slug = 'technology-digital-life' on conflict (lesson_id) do nothing;

update public.vocabulary_entries set sentence_prompt_vi = 'Viết bằng tiếng Anh: Điện thoại của tôi là một thiết bị hữu ích để học tiếng Anh.',
  accepted_sentences = '["My phone is a useful device for studying English.","My phone is a useful device to study English."]'::jsonb
where word = 'device' and sentence_prompt_vi = '' and lesson_id in (select id from public.lessons where slug = 'technology-digital-life');
