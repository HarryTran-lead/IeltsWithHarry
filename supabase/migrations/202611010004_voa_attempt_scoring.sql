-- Score verbatim dictation on the database, using token edit distance.
alter table public.voa_dictation_attempts
  add column mode text not null default 'type' check (mode in ('type','gap')),
  add column accuracy numeric(5,2) not null default 0 check (accuracy between 0 and 100);

create function public.voa_dictation_accuracy(p_reference text, p_answer text) returns numeric
language plpgsql immutable set search_path = public, pg_temp as $$
declare
  expected text[];
  actual text[];
  n integer;
  m integer;
  matrix integer[][];
  i integer;
  j integer;
  cost integer;
begin
  expected := regexp_split_to_array(trim(regexp_replace(lower(replace(replace(p_reference, '’', ''), chr(39), '')), '[^[:alnum:] ]+', ' ', 'g')), '[[:space:]]+');
  actual := regexp_split_to_array(trim(regexp_replace(lower(replace(replace(p_answer, '’', ''), chr(39), '')), '[^[:alnum:] ]+', ' ', 'g')), '[[:space:]]+');
  n := coalesce(array_length(expected, 1), 0);
  m := coalesce(array_length(actual, 1), 0);
  if n = 0 then return 0; end if;
  matrix := array_fill(0, array[n + 1, m + 1]);
  for i in 0..n loop matrix[i + 1][1] := i; end loop;
  for j in 0..m loop matrix[1][j + 1] := j; end loop;
  for i in 1..n loop
    for j in 1..m loop
      cost := case when expected[i] = actual[j] then 0 else 1 end;
      matrix[i + 1][j + 1] := least(
        matrix[i][j + 1] + 1,
        matrix[i + 1][j] + 1,
        matrix[i][j] + cost
      );
    end loop;
  end loop;
  return greatest(0, round(100.0 * (n - matrix[n + 1][m + 1]) / n, 2));
end $$;
revoke all on function public.voa_dictation_accuracy(text,text) from public;
grant execute on function public.voa_dictation_accuracy(text,text) to authenticated;

drop function public.submit_voa_dictation(uuid,text);
create function public.submit_voa_dictation(p_segment_id uuid, p_answer text, p_mode text default 'type') returns uuid
language plpgsql security definer set search_path = public, pg_temp as $$
declare
  v_id uuid;
  v_reference text;
begin
  if auth.uid() is null or length(trim(coalesce(p_answer, ''))) not between 1 and 2000
    or p_mode not in ('type','gap') then
    raise exception 'Sign in and enter a valid dictation answer';
  end if;
  select s.reference_text into v_reference
    from public.voa_dictation_segments s join public.voa_dictation_lessons l on l.id = s.lesson_id
    where s.id = p_segment_id and l.status = 'published';
  if v_reference is null then raise exception 'Lesson unavailable'; end if;
  insert into public.voa_dictation_attempts(user_id, segment_id, answer, mode, accuracy)
    values (auth.uid(), p_segment_id, trim(p_answer), p_mode,
      public.voa_dictation_accuracy(v_reference, p_answer)) returning id into v_id;
  return v_id;
end $$;
revoke all on function public.submit_voa_dictation(uuid,text,text) from public;
grant execute on function public.submit_voa_dictation(uuid,text,text) to authenticated;
