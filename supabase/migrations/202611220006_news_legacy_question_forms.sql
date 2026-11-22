-- Relabel legacy text-only diagrams and independent choice questions honestly.
-- Keep question IDs, answer keys and every learner attempt intact; save originals privately.
create table public.news_question_form_repairs (
  question_id uuid primary key,
  article_id uuid not null,
  original_question jsonb not null,
  reason text not null,
  repaired_at timestamptz not null default now()
);
alter table public.news_question_form_repairs enable row level security;
revoke all on public.news_question_form_repairs from public,anon,authenticated;
grant select on public.news_question_form_repairs to service_role;

insert into public.news_question_form_repairs(question_id,article_id,original_question,reason)
select id,article_id,to_jsonb(q),'Text-only question has no diagram; retain it as sentence completion'
from public.news_auto_questions q where question_type='diagram_label_completion' and prompt not like '[DIAGRAM:%';
update public.news_auto_questions q set question_type='sentence_completion'
where exists(select 1 from public.news_question_form_repairs r where r.question_id=q.id);

insert into public.news_question_form_repairs(question_id,article_id,original_question,reason)
select q.id,q.article_id,to_jsonb(q),'Independent option pools are multiple-choice questions, not a shared matching group'
from public.news_auto_questions q
join (select article_id,question_type from public.news_auto_questions
  where question_type in ('matching_headings','matching_information','matching_features','matching_sentence_endings')
  group by article_id,question_type having count(*)>1 and count(distinct options::text)>1) invalid
  on invalid.article_id=q.article_id and invalid.question_type=q.question_type;
update public.news_auto_questions q set question_type='mcq'
where exists(select 1 from public.news_question_form_repairs r where r.question_id=q.id and r.reason like 'Independent option%');
