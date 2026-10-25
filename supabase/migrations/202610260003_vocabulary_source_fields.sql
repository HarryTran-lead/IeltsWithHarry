-- Keep imported dictionary text separate from admin-reviewed teaching copy.
-- Reimporting a source file must never replace a published definition or example.
alter table public.vocabulary_bank_entries
  add column source_definition_en text not null default '',
  add column source_example_en text not null default '';

update public.vocabulary_bank_entries
set source_definition_en = definition_en, source_example_en = example_en
where source_definition_en = '' and source_example_en = '';
