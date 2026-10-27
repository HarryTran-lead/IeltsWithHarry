-- Per-skill target bands for the dashboard "Mục tiêu của bạn" card.
-- target_band stays the overall goal; exam_date already lives on profiles.
alter table public.profiles
  add column target_reading numeric(2,1) check (target_reading is null or (target_reading between 1 and 9 and target_reading * 2 = floor(target_reading * 2))),
  add column target_listening numeric(2,1) check (target_listening is null or (target_listening between 1 and 9 and target_listening * 2 = floor(target_listening * 2))),
  add column target_writing numeric(2,1) check (target_writing is null or (target_writing between 1 and 9 and target_writing * 2 = floor(target_writing * 2))),
  add column target_speaking numeric(2,1) check (target_speaking is null or (target_speaking between 1 and 9 and target_speaking * 2 = floor(target_speaking * 2)));

-- profiles_self_select / profiles_self_update already limit rows to the caller.
grant update (target_band, target_reading, target_listening, target_writing, target_speaking, exam_date, updated_at) on public.profiles to authenticated;
