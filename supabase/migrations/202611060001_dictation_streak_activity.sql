-- Dictation practice counts toward the study streak, like lessons, news quizzes and notebook words.
-- Additive only: three triggers that call the existing activity recorder.
create trigger track_activity after insert on public.voa_dictation_attempts
  for each row execute function public.track_learning_activity('dictation');
create trigger track_activity after insert on public.dictation_clip_attempts
  for each row execute function public.track_learning_activity('dictation');
-- Course and Skill Lab practice results are upserts, so updates count too.
create trigger track_activity after insert or update of correct, checked on public.package_practice_results
  for each row execute function public.track_learning_activity('practice');
