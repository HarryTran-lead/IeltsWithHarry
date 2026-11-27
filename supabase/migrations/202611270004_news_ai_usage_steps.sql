-- Gemini calls per Free Tier key, pipeline step and outcome, per Pacific day, to see which step of the
-- news pipeline spends a key's daily quota. The step is the opening words of the app's own system
-- instruction (never article text, keys or responses).
create table public.news_ai_usage_steps_daily (
  day date not null,
  key_name text not null check (key_name in ('quiz', 'article', 'shared', 'custom')),
  step text not null check (char_length(step) between 1 and 48),
  outcome text not null check (outcome in ('ok', 'unavailable', 'quota', 'error')),
  requests integer not null default 0 check (requests >= 0),
  updated_at timestamptz not null default now(),
  primary key (day, key_name, step, outcome)
);
alter table public.news_ai_usage_steps_daily enable row level security;
revoke all on public.news_ai_usage_steps_daily from public, anon, authenticated;

create function public.news_record_ai_step(p_key text, p_step text, p_outcome text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.news_ai_usage_steps_daily (day, key_name, step, outcome, requests)
  values ((now() at time zone 'America/Los_Angeles')::date, p_key, left(p_step, 48), p_outcome, 1)
  on conflict (day, key_name, step, outcome)
  do update set requests = public.news_ai_usage_steps_daily.requests + 1, updated_at = now();
$$;
revoke all on function public.news_record_ai_step(text, text, text) from public, anon, authenticated;
grant execute on function public.news_record_ai_step(text, text, text) to service_role;
