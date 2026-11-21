-- Reuse successful news translations across readers without exposing cached text
-- through the public API. Only the server's service role can read or write it.
create table public.news_translation_cache (
  cache_key text primary key check (cache_key ~ '^v1:[0-9a-f]{64}$'),
  translation text not null check (length(translation) between 1 and 12000),
  created_at timestamptz not null default now()
);
alter table public.news_translation_cache enable row level security;
revoke all on public.news_translation_cache from public, anon, authenticated;
grant select, insert, update on public.news_translation_cache to service_role;

-- The claim happens before calling a provider. Return it on any failed call so
-- a failed word or paragraph never consumes the learner's daily allowance.
create function public.news_refund_translation_quota(p_user_id uuid, p_characters integer) returns void
language plpgsql security definer set search_path = '' as $$
begin
  if p_characters not between 1 and 5000 then raise exception 'Invalid translation size'; end if;
  update public.news_translation_usage
    set characters = greatest(0, characters - p_characters)
    where user_id = p_user_id and usage_day = current_date;
end;
$$;
revoke all on function public.news_refund_translation_quota(uuid, integer) from public, anon, authenticated;
grant execute on function public.news_refund_translation_quota(uuid, integer) to service_role;
