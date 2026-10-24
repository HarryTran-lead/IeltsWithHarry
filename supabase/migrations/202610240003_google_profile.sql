-- Google identities commonly provide full_name/name rather than display_name.
create or replace function public.create_profile() returns trigger language plpgsql security definer
set search_path = '' as $$
begin
  insert into public.profiles(id, display_name)
  values (
    new.id,
    coalesce(
      nullif(left(new.raw_user_meta_data ->> 'display_name', 80), ''),
      nullif(left(new.raw_user_meta_data ->> 'full_name', 80), ''),
      nullif(left(new.raw_user_meta_data ->> 'name', 80), ''),
      'Learner'
    )
  );
  return new;
end;
$$;
