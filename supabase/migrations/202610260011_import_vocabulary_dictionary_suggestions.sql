-- Bulk import changes only dictionary suggestions on existing source records.
create function public.import_vocabulary_dictionary_suggestions(p_entries jsonb)
returns integer
language plpgsql security invoker
set search_path = ''
as $$
declare changed integer;
begin
  update public.vocabulary_bank_entries b
  set auto_meaning_vi = coalesce(src.auto_meaning_vi, ''),
      auto_meaning_options = coalesce(src.auto_meaning_options, '{}'),
      auto_meaning_status = coalesce(src.auto_meaning_status, 'missing'),
      auto_meaning_source = coalesce(src.auto_meaning_source, ''),
      auto_meaning_source_url = coalesce(src.auto_meaning_source_url, ''),
      auto_meaning_gloss_en = coalesce(src.auto_meaning_gloss_en, ''),
      source_ipa = coalesce(src.source_ipa, '')
  from jsonb_to_recordset(p_entries) as src(
    source_id text, auto_meaning_vi text, auto_meaning_options text[],
    auto_meaning_status text, auto_meaning_source text,
    auto_meaning_source_url text, auto_meaning_gloss_en text, source_ipa text
  )
  where b.source_id = src.source_id;
  get diagnostics changed = row_count;
  return changed;
end;
$$;
revoke all on function public.import_vocabulary_dictionary_suggestions(jsonb) from public, anon, authenticated;
grant execute on function public.import_vocabulary_dictionary_suggestions(jsonb) to service_role;
