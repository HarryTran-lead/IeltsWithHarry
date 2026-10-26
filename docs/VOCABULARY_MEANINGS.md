# Vietnamese vocabulary suggestions

`data/vocabulary-meanings.jsonl` contains English–Vietnamese dictionary suggestions for the 9,937 source records in the IELTS vocabulary reference pack. This is a **derived and modified dataset**, not an editorially approved translation or an official IELTS band list. English definitions and Vietnamese dictionary senses can diverge; learners should compare them, and an editor must verify the sense before marking a record reviewed.

## Sources and attribution

- [Thichhoc English–Vietnamese Dictionary](https://github.com/thichhoc-org/thichhoc-dict), [data license CC BY-SA 4.0](https://github.com/thichhoc-org/thichhoc-dict/blob/main/dict-en-vi/LICENSE-DATA). We selected records by headword and part of speech, then attempted to align the English gloss with the source pack. Some underlying entries are machine generated and not human reviewed.
- [Skypedia English–Vietnamese Dictionary](https://github.com/skypediacode/english-vietnamese-dictionary), [license CC BY-SA 4.0](https://github.com/skypediacode/english-vietnamese-dictionary/blob/main/LICENSE), [attribution](https://github.com/skypediacode/english-vietnamese-dictionary/blob/main/ATTRIBUTION.md). We used a dictionary headword/part-of-speech match when the first source had no match.
- English definitions in the vocabulary source pack include [Open English WordNet](https://en-word.net/) under CC BY 4.0. See the original ZIP package for its full source and license manifest.

The derived `data/vocabulary-meanings.jsonl` is distributed under **CC BY-SA 4.0**. The preceding source links and this modification note must be retained when redistributing it. The license does not apply to the website application code.

## Rebuild and import

Place the source ZIP, Thichhoc JSONL directory, and Skypedia SQLite database in `deliverables/` at the paths specified in `scripts/build-vocabulary-meanings.py`. Run `python scripts/build-vocabulary-meanings.py`, then `node scripts/import-vocabulary-meanings.mjs` while authenticated to the linked Supabase project. The import updates only `auto_meaning_*` and `source_ipa` fields; it never changes `meaning_vi`, `published`, or editor reviewed fields.

Of 9,937 source records, 9,829 received at least one Vietnamese dictionary candidate and 108 had no direct match. Dictionary candidates are shown as such in the learner library. The current quiz grades English definitions/headwords, never unverified Vietnamese meanings.
