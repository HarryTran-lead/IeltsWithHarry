-- Gemini calls per Free Tier key, model and outcome, counted per Pacific day because
-- Google's daily (RPD) quotas reset at midnight Pacific time. Holds counts only:
-- no prompts, article text, keys or responses.
create table public.news_ai_usage_daily (
  day date not null,
  key_name text not null check (key_name in ('quiz', 'article', 'shared', 'custom')),
  model text not null check (char_length(model) between 1 and 80),
  outcome text not null check (outcome in ('ok', 'unavailable', 'quota', 'error')),
  requests integer not null default 0 check (requests >= 0),
  updated_at timestamptz not null default now(),
  primary key (day, key_name, model, outcome)
);
alter table public.news_ai_usage_daily enable row level security;
revoke all on public.news_ai_usage_daily from public, anon, authenticated;

create function public.news_record_ai_usage(p_key text, p_model text, p_outcome text)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.news_ai_usage_daily (day, key_name, model, outcome, requests)
  values ((now() at time zone 'America/Los_Angeles')::date, p_key, left(p_model, 80), p_outcome, 1)
  on conflict (day, key_name, model, outcome)
  do update set requests = public.news_ai_usage_daily.requests + 1, updated_at = now();
$$;
revoke all on function public.news_record_ai_usage(text, text, text) from public, anon, authenticated;
grant execute on function public.news_record_ai_usage(text, text, text) to service_role;
