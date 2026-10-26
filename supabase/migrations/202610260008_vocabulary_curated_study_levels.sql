-- Align the four reviewed examples with the same internal learning sequence.
update public.vocabulary_bank_entries
set study_lane = case source_id
  when 'app-curated-curriculum' then 'Level 5'
  when 'app-curated-deadline' then 'Level 4'
  when 'app-curated-drought' then 'Level 5'
  when 'app-curated-reliable' then 'Level 3'
end
where source_id in (
  'app-curated-curriculum', 'app-curated-deadline',
  'app-curated-drought', 'app-curated-reliable'
);
