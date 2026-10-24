-- Original sample content. Idempotent for a fresh or repeated seed run.
insert into public.learning_stages(id, title, band_label, sort_order, description) values
('foundation','Foundation','1.0–2.0',1,'Everyday words and simple sentences'),
('elementary','Elementary','2.0–3.0',2,'Familiar topics and short answers'),
('pre-ielts','Pre-IELTS','3.0–4.0',3,'Core language skills'),
('ielts-starter','IELTS Starter','4.0–5.0',4,'Task formats and clear answers'),
('ielts-builder','IELTS Builder','5.0–6.0',5,'Accuracy and fluency'),
('ielts-advanced','IELTS Advanced','6.0–7.0',6,'Complex academic content'),
('mastery','Mastery','7.0+',7,'Expression and exam strategy')
on conflict (id) do update set title=excluded.title, band_label=excluded.band_label, description=excluded.description;

do $$
declare
  v_course uuid;
  v_unit uuid;
  v_lesson uuid;
  v_question uuid;
begin
  insert into public.courses(stage_id,slug,title,description,published)
  values ('foundation','everyday-english','Everyday English','Original short activities across six skills.',true)
  on conflict (slug) do update set title=excluded.title, description=excluded.description, published=true
  returning id into v_course;
  insert into public.units(course_id,slug,title,published)
  values (v_course,'technology-digital-life','Technology & Digital Life',true)
  on conflict (course_id,slug) do update set title=excluded.title, published=true
  returning id into v_unit;

  insert into public.lessons(unit_id,slug,title,skill,summary,published)
  values (v_unit,'grammar-present-simple','Present Simple','Grammar','Habits and facts with third-person singular.',true)
  on conflict (slug) do update set title=excluded.title, summary=excluded.summary, published=true
  returning id into v_lesson;
  insert into public.exercise_questions(lesson_id,slug,prompt,options)
  values (v_lesson,'q1','Choose the correct sentence','["She study English every day.","She studies English every day.","She studying English every day."]')
  on conflict (lesson_id,slug) do update set prompt=excluded.prompt, options=excluded.options
  returning id into v_question;
  insert into public.exercise_answer_keys(question_id,correct_index,explanation)
  values(v_question,1,'She is third-person singular, so study becomes studies.')
  on conflict(question_id) do update set correct_index=excluded.correct_index, explanation=excluded.explanation;

  insert into public.lessons(unit_id,slug,title,skill,summary,published)
  values (v_unit,'reading-city-gardens','City Gardens','Reading','Read an original passage about a community garden.',true)
  on conflict (slug) do update set title=excluded.title, summary=excluded.summary, published=true
  returning id into v_lesson;
  insert into public.lesson_blocks(lesson_id,sort_order,kind,body)
  values(v_lesson,0,'paragraph','In a busy city, even a small garden can make a difference. Maya and her neighbours turned an empty space beside their apartment building into a community garden. They planted tomatoes, herbs and flowers. Every Saturday morning, families water the plants together. The garden gives people fresh food, but it also helps neighbours get to know each other. Maya says the best part is seeing children learn where vegetables come from.')
  on conflict(lesson_id,sort_order) do update set body=excluded.body;
  insert into public.exercise_questions(lesson_id,slug,prompt,options,sort_order)
  values(v_lesson,'q1','What did Maya and her neighbours create?','["A new apartment","A community garden","A shopping area"]',0)
  on conflict(lesson_id,slug) do update set prompt=excluded.prompt, options=excluded.options
  returning id into v_question;
  insert into public.exercise_answer_keys values(v_question,1,'They turned an empty space into a community garden.')
  on conflict(question_id) do update set correct_index=excluded.correct_index, explanation=excluded.explanation;
  insert into public.exercise_questions(lesson_id,slug,prompt,options,sort_order)
  values(v_lesson,'q2','When do families water the plants?','["Every Saturday morning","Every evening","Once a month"]',1)
  on conflict(lesson_id,slug) do update set prompt=excluded.prompt, options=excluded.options
  returning id into v_question;
  insert into public.exercise_answer_keys values(v_question,0,'Families water the plants every Saturday morning.')
  on conflict(question_id) do update set correct_index=excluded.correct_index, explanation=excluded.explanation;
  insert into public.exercise_questions(lesson_id,slug,prompt,options,sort_order)
  values(v_lesson,'q3','What does Maya like best?','["Selling tomatoes","Meeting visitors","Children learning about vegetables"]',2)
  on conflict(lesson_id,slug) do update set prompt=excluded.prompt, options=excluded.options
  returning id into v_question;
  insert into public.exercise_answer_keys values(v_question,2,'Maya likes seeing children learn where vegetables come from.')
  on conflict(question_id) do update set correct_index=excluded.correct_index, explanation=excluded.explanation;

  insert into public.lessons(unit_id,slug,title,skill,summary,published)
  values(v_unit,'listening-daily-life','A weekly study routine','Listening','Listen for key details in Lily’s routine.',true)
  on conflict(slug) do update set title=excluded.title, summary=excluded.summary, published=true
  returning id into v_lesson;
  insert into public.exercise_questions(lesson_id,slug,prompt,options)
  values(v_lesson,'q1','When does Lily practice speaking?','["On Mondays","On Wednesdays","Every evening"]')
  on conflict(lesson_id,slug) do update set prompt=excluded.prompt, options=excluded.options
  returning id into v_question;
  insert into public.exercise_answer_keys values(v_question,1,'Lily practices speaking with her friend on Wednesdays.')
  on conflict(question_id) do update set correct_index=excluded.correct_index, explanation=excluded.explanation;

  insert into public.lessons(unit_id,slug,title,skill,summary,published)
  values(v_unit,'writing-technology','Technology in daily life','Writing','Write a short opinion paragraph.',true)
  on conflict(slug) do update set title=excluded.title, summary=excluded.summary, published=true;

  insert into public.lessons(unit_id,slug,title,skill,summary,published)
  values(v_unit,'technology-digital-life','Technology vocabulary','Vocabulary','Useful words for everyday digital life.',true)
  on conflict(slug) do update set title=excluded.title, summary=excluded.summary, published=true
  returning id into v_lesson;
  insert into public.vocabulary_entries(lesson_id,word,phonetic,meaning_vi,definition,example,sort_order) values
  (v_lesson,'device','/dɪˈvaɪs/','thiết bị','A piece of equipment made for a purpose.','My phone is a useful device for studying.',0),
  (v_lesson,'connect','/kəˈnekt/','kết nối','To join things or people together.','The internet helps us connect with friends.',1),
  (v_lesson,'convenient','/kənˈviːniənt/','thuận tiện','Easy and suitable for a situation.','Online lessons are convenient for busy students.',2),
  (v_lesson,'screen time','/skriːn taɪm/','thời gian dùng màn hình','Time spent using digital screens.','I limit my screen time at night.',3),
  (v_lesson,'improve','/ɪmˈpruːv/','cải thiện','To become better or make something better.','Daily practice can improve your English.',4)
  on conflict(lesson_id,word) do update set phonetic=excluded.phonetic, meaning_vi=excluded.meaning_vi, definition=excluded.definition, example=excluded.example;

  insert into public.lessons(unit_id,slug,title,skill,summary,published)
  values(v_unit,'speaking-technology','Talk about technology','Speaking','Record and review a short spoken response.',true)
  on conflict(slug) do update set title=excluded.title, summary=excluded.summary, published=true;
end $$;
