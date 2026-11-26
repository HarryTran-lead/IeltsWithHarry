-- Sentence pairs and the glossary belong to the English body they were made from: clear them
-- when the body changes, and keep them on feed upserts that leave the body unchanged.
create or replace function public.news_reset_translation_on_body_change() returns trigger
language plpgsql set search_path = '' as $$
begin
  if new.body_text is distinct from old.body_text then
    new.translation_vi := null;
    new.translation_vi_draft := '{}'::text[];
    new.translation_model := null;
    new.translation_updated_at := null;
    new.translation_retry_after := null;
    new.translation_pairs := null;
    new.glossary := null;
  elsif new.translation_vi is null and cardinality(new.translation_vi_draft) = 0
    and new.translation_model is null and new.translation_updated_at is null
    and new.translation_retry_after is null then
    -- Feed upserts and the manual editor omit translation columns. Keep the
    -- finished or in-progress translation when the English body is unchanged.
    -- (An admin "translate again" sets translation_retry_after, so it is not undone here.)
    new.translation_vi := old.translation_vi;
    new.translation_vi_draft := old.translation_vi_draft;
    new.translation_model := old.translation_model;
    new.translation_updated_at := old.translation_updated_at;
    new.translation_retry_after := old.translation_retry_after;
    new.translation_pairs := coalesce(new.translation_pairs, old.translation_pairs);
    new.glossary := coalesce(new.glossary, old.glossary);
  end if;
  return new;
end;
$$;
