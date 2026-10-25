-- Limit paid translation fallback per learner and day.
create table public.news_translation_usage (
  user_id uuid not null references auth.users(id) on delete cascade,
  usage_day date not null default current_date,
  characters integer not null default 0 check (characters between 0 and 30000),
  primary key (user_id, usage_day)
);
alter table public.news_translation_usage enable row level security;
revoke all on public.news_translation_usage from anon, authenticated;

create function public.news_claim_translation_quota(p_characters integer) returns boolean
language plpgsql security definer set search_path = '' as $$
declare v_claimed boolean := false;
begin
  if auth.uid() is null or p_characters < 1 or p_characters > 5000 then return false; end if;
  insert into public.news_translation_usage(user_id, usage_day, characters)
  values (auth.uid(), current_date, p_characters)
  on conflict (user_id, usage_day) do update
    set characters = public.news_translation_usage.characters + excluded.characters
    where public.news_translation_usage.characters + excluded.characters <= 30000
  returning true into v_claimed;
  return coalesce(v_claimed, false);
end;
$$;
revoke all on function public.news_claim_translation_quota(integer) from public;
grant execute on function public.news_claim_translation_quota(integer) to authenticated;
