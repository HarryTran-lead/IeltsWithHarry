-- Numbers is no longer a learner bank. Answers and attempts cascade with the clips.
delete from public.dictation_clips where bank = 'numbers';

-- Keep later imports from restoring the retired bank.
alter table public.dictation_clips
  add constraint dictation_clips_quick_only check (bank = 'quick');
