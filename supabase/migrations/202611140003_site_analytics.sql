-- Site analytics: page views, visits and sign-ins for guests and learners.
-- The browser writes through track_site_event (no Vercel function involved); only admins can read.
-- Privacy: no IP address, no user agent string, no query strings; ids in paths are replaced by :id.

create table public.site_events (
  id bigint generated always as identity primary key,
  at timestamptz not null default now(),
  kind text not null check (kind in ('page_view', 'sign_in')),
  path text not null check (char_length(path) between 1 and 200),
  area text not null check (area in ('public', 'app', 'auth')),
  visitor_id uuid not null,
  session_id uuid not null,
  user_id uuid references auth.users(id) on delete set null,
  device text not null check (device in ('mobile', 'tablet', 'desktop')),
  referrer_host text check (referrer_host is null or char_length(referrer_host) <= 120),
  method text check (method is null or method in ('email', 'google', 'phone', 'unknown'))
);
create index site_events_at_idx on public.site_events (at desc);
create index site_events_session_idx on public.site_events (session_id, at desc);
create index site_events_user_idx on public.site_events (user_id, at desc) where user_id is not null;

alter table public.site_events enable row level security;
revoke all on public.site_events from anon, authenticated;
create policy site_events_admin_read on public.site_events for select to authenticated using (public.is_admin());
grant select on public.site_events to authenticated;

create function public.track_site_event(
  p_kind text, p_path text, p_visitor uuid, p_session uuid, p_device text,
  p_referrer text default null, p_method text default null
) returns void language plpgsql security definer set search_path = '' as $$
declare
  v_path text;
  v_area text;
begin
  if p_kind not in ('page_view', 'sign_in') or p_visitor is null or p_session is null then return; end if;
  v_path := left(split_part(split_part(coalesce(p_path, ''), '?', 1), '#', 1), 200);
  if v_path !~ '^/' or v_path ~ '^/(admin|api|preview-)' then return; end if;
  v_path := regexp_replace(v_path, '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}', ':id', 'gi');
  v_area := case when v_path ~ '^/app(/|$)' then 'app'
                 when v_path ~ '^/(login|register|reset-password|forgot-password|auth)(/|$)' then 'auth'
                 else 'public' end;
  -- A reload or double render within 10 seconds counts once; one session can add at most 500 events.
  if exists (select 1 from public.site_events where session_id = p_session and kind = p_kind and path = v_path and at > now() - interval '10 seconds') then return; end if;
  if (select count(*) from public.site_events where session_id = p_session) >= 500 then return; end if;
  insert into public.site_events (kind, path, area, visitor_id, session_id, user_id, device, referrer_host, method)
  values (
    p_kind, v_path, v_area, p_visitor, p_session, (select auth.uid()),
    case when p_device in ('mobile', 'tablet', 'desktop') then p_device else 'desktop' end,
    nullif(left(lower(regexp_replace(coalesce(p_referrer, ''), '[^a-zA-Z0-9.-]', '', 'g')), 120), ''),
    case when p_kind = 'sign_in' then case when p_method in ('email', 'google', 'phone') then p_method else 'unknown' end end
  );
end;
$$;
revoke all on function public.track_site_event(text, text, uuid, uuid, text, text, text) from public;
grant execute on function public.track_site_event(text, text, uuid, uuid, text, text, text) to anon, authenticated;

-- One call returns everything the admin analytics page draws, in Vietnam local days.
create function public.admin_site_analytics(p_days integer default 30) returns jsonb
language plpgsql stable security definer set search_path = '' as $$
declare
  v_tz constant text := 'Asia/Ho_Chi_Minh';
  v_days integer := least(greatest(coalesce(p_days, 30), 1), 180);
  v_today date := (now() at time zone v_tz)::date;
  v_from date := v_today - (v_days - 1);
  v_prev date := v_from - v_days;
  v_start timestamptz := v_from::timestamp at time zone v_tz;
  v_prev_start timestamptz := v_prev::timestamp at time zone v_tz;
  v_result jsonb;
begin
  if not public.is_admin() then raise exception 'admin only' using errcode = '42501'; end if;

  with ev as (
    select e.*, (e.at at time zone v_tz)::date as day from public.site_events e where e.at >= v_prev_start
  ), cur as (select * from ev where at >= v_start), prev as (select * from ev where at < v_start),
  days as (select generate_series(v_from, v_today, interval '1 day')::date as day),
  learners as (
    select day, count(distinct user_id) as n from public.learner_activity_days
    where day between v_prev and v_today and events > 0 group by day
  ),
  signups as (
    select (created_at at time zone v_tz)::date as day, count(*) as n from public.profiles
    where created_at >= v_prev_start group by 1
  ),
  daily as (
    select d.day,
      count(c.id) filter (where c.kind = 'page_view') as page_views,
      count(distinct c.session_id) filter (where c.kind = 'page_view') as visits,
      count(distinct c.visitor_id) filter (where c.kind = 'page_view' and c.user_id is null) as guests,
      count(distinct c.user_id) filter (where c.kind = 'page_view') as members,
      count(c.id) filter (where c.kind = 'sign_in') as sign_ins
    from days d left join cur c on c.day = d.day group by d.day
  )
  select jsonb_build_object(
    'days', v_days,
    'from', v_from,
    'to', v_today,
    'summary', jsonb_build_object(
      'pageViews', (select count(*) from cur where kind = 'page_view'),
      'visits', (select count(distinct session_id) from cur where kind = 'page_view'),
      'visitors', (select count(distinct visitor_id) from cur where kind = 'page_view'),
      'guestVisitors', (select count(distinct visitor_id) from cur where kind = 'page_view' and user_id is null
        and visitor_id not in (select visitor_id from cur where user_id is not null)),
      'memberVisitors', (select count(distinct user_id) from cur where kind = 'page_view'),
      'signIns', (select count(*) from cur where kind = 'sign_in'),
      'signInUsers', (select count(distinct user_id) from cur where kind = 'sign_in'),
      'signups', (select coalesce(sum(n), 0) from signups where day >= v_from),
      'activeLearners', (select count(distinct user_id) from public.learner_activity_days where day >= v_from and events > 0),
      'learningEvents', (select coalesce(sum(events), 0) from public.learner_activity_days where day >= v_from),
      'onlineNow', (select count(distinct visitor_id) from public.site_events where at > now() - interval '5 minutes'),
      'totalMembers', (select count(*) from public.profiles)
    ),
    'previous', jsonb_build_object(
      'pageViews', (select count(*) from prev where kind = 'page_view'),
      'visits', (select count(distinct session_id) from prev where kind = 'page_view'),
      'visitors', (select count(distinct visitor_id) from prev where kind = 'page_view'),
      'signIns', (select count(*) from prev where kind = 'sign_in'),
      'signups', (select coalesce(sum(n), 0) from signups where day < v_from),
      'activeLearners', (select count(distinct user_id) from public.learner_activity_days where day between v_prev and v_from - 1 and events > 0)
    ),
    'daily', (select coalesce(jsonb_agg(jsonb_build_object(
        'day', d.day, 'pageViews', d.page_views, 'visits', d.visits, 'guests', d.guests, 'members', d.members,
        'signIns', d.sign_ins, 'signups', coalesce(s.n, 0), 'learners', coalesce(l.n, 0)) order by d.day), '[]'::jsonb)
      from daily d left join signups s on s.day = d.day left join learners l on l.day = d.day),
    'topPages', (select coalesce(jsonb_agg(t order by t.views desc), '[]'::jsonb) from (
        select path, area, count(*) as views, count(distinct visitor_id) as visitors,
          count(*) filter (where user_id is null) as guest_views
        from cur where kind = 'page_view' group by path, area order by count(*) desc limit 12) t),
    'areas', (select coalesce(jsonb_object_agg(area, n), '{}'::jsonb) from (
        select area, count(*) as n from cur where kind = 'page_view' group by area) a),
    'devices', (select coalesce(jsonb_object_agg(device, n), '{}'::jsonb) from (
        select device, count(distinct visitor_id) as n from cur where kind = 'page_view' group by device) dv),
    'signInMethods', (select coalesce(jsonb_object_agg(method, n), '{}'::jsonb) from (
        select method, count(*) as n from cur where kind = 'sign_in' group by method) m),
    'referrers', (select coalesce(jsonb_agg(r order by r.visits desc), '[]'::jsonb) from (
        select referrer_host as host, count(distinct session_id) as visits
        from cur where referrer_host is not null group by referrer_host order by 2 desc limit 8) r),
    'hours', (select jsonb_agg(coalesce(h.n, 0) order by g.hour) from generate_series(0, 23) as g(hour)
        left join (select extract(hour from at at time zone v_tz)::integer as hour, count(*) as n
          from cur where kind = 'page_view' group by 1) h on h.hour = g.hour),
    'recentSignIns', (select coalesce(jsonb_agg(x order by x.at desc), '[]'::jsonb) from (
        select c.at, c.method, c.device, c.user_id, p.display_name
        from cur c left join public.profiles p on p.id = c.user_id
        where c.kind = 'sign_in' order by c.at desc limit 15) x),
    'topMembers', (select coalesce(jsonb_agg(x order by x.page_views desc), '[]'::jsonb) from (
        select c.user_id, p.display_name, count(*) as page_views, count(distinct c.session_id) as visits, max(c.at) as last_seen
        from cur c left join public.profiles p on p.id = c.user_id
        where c.kind = 'page_view' and c.user_id is not null group by c.user_id, p.display_name
        order by count(*) desc limit 10) x)
  ) into v_result;
  return v_result;
end;
$$;
revoke all on function public.admin_site_analytics(integer) from public;
grant execute on function public.admin_site_analytics(integer) to authenticated;

-- Keep about 13 months of raw events.
create function public.purge_site_events() returns void language sql security definer set search_path = '' as $$
  delete from public.site_events where at < now() - interval '400 days';
$$;
revoke all on function public.purge_site_events() from public;

do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    perform cron.schedule('iwh-purge-site-events', '17 3 * * *', 'select public.purge_site_events()');
  end if;
end;
$$;
