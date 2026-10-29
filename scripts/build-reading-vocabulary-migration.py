"""Validate the owner-supplied Reading 607 archive and write its seed migration.

Usage: python scripts/build-reading-vocabulary-migration.py path/to/archive.zip
"""

import hashlib
import json
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path


def quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def read_json(bundle: zipfile.ZipFile, name: str):
    return json.loads(bundle.read("01_Data/" + name).decode("utf-8-sig"))


def main() -> None:
    archive = Path(sys.argv[1])
    checksum = hashlib.sha256(archive.read_bytes()).hexdigest()
    with zipfile.ZipFile(archive) as bundle:
        words = read_json(bundle, "vocabulary_607.json")
        contexts = read_json(bundle, "learn_in_context_607.json")
        cards = read_json(bundle, "flashcards_1214.json")
        recalls = read_json(bundle, "active_recall_607.json")
        translations = read_json(bundle, "translations_self_review_1214.json")
        plan = read_json(bundle, "study_plan_84_days_core9.json")
        index = read_json(bundle, "core9_content_index_607.json")

    ids = {word["id"] for word in words}
    assert len(words) == len(ids) == len(contexts) == len(recalls) == len(index) == 607
    assert len(cards) == len(translations) == 1214
    assert len(plan) == 84
    assert ids == {f"RV{number:04d}" for number in range(1, 608)}
    assert len({word["headword"].casefold() for word in words}) == 607
    assert all(word["example_en"] and word["example_vi"] and word["meaning_vi"] for word in words)
    assert Counter(word["difficulty_seed"] for word in words) == {
        "foundation": 314, "intermediate": 132, "advanced": 161
    }
    exercises = {}
    for name, rows in (("context", contexts), ("cards", cards), ("recall", recalls), ("translations", translations)):
        grouped = defaultdict(list)
        for row in rows:
            assert row["vocabulary_id"] in ids
            grouped[row["vocabulary_id"]].append(row)
        assert set(grouped) == ids
        exercises[name] = grouped
    assert all(len(exercises["context"][entry_id]) == len(exercises["recall"][entry_id]) == 1 for entry_id in ids)
    assert all(len(exercises["cards"][entry_id]) == len(exercises["translations"][entry_id]) == 2 for entry_id in ids)
    assert all({row["direction"] for row in exercises["cards"][entry_id]} == {"en_vi", "vi_en"} for entry_id in ids)
    assert all({row["direction"] for row in exercises["translations"][entry_id]} == {"en_vi", "vi_en"} for entry_id in ids)
    assert {row["vocabulary_id"] for row in index} == ids
    assert sorted(day["day"] for day in plan) == list(range(1, 85))
    planned = [entry_id for day in plan for entry_id in day["new_vocabulary_ids"]]
    assert len(planned) == len(set(planned)) == 607 and set(planned) == ids

    output = Path("supabase/migrations/202610290010_reading_vocabulary_seed.sql")
    with output.open("w", encoding="utf-8", newline="\n") as target:
        target.write(f"-- Reading 607 owner-supplied archive SHA-256: {checksum}\n")
        target.write("-- 607 words, 607 context lessons, 1,214 flashcards, 607 recalls, 1,214 translations, 84 planner days.\n")
        for order, word in enumerate(words, 1):
            entry_id = word["id"]
            content = {
                "context": exercises["context"][entry_id][0],
                "flashcards": exercises["cards"][entry_id],
                "recall": exercises["recall"][entry_id][0],
                "translations": exercises["translations"][entry_id],
            }
            values = [
                quote(entry_id), str(order), quote(word["headword"]), quote(word["pos"]),
                quote(word["meaning_vi"]), quote(word["example_en"]), quote(word["example_vi"]),
                quote(word["related_expression_en"] or ""), quote(word["context_chunk"] or ""),
                quote(word["topic_hint"]), quote(word["difficulty_seed"]),
                quote(json.dumps(content, ensure_ascii=False, separators=(",", ":"))) + "::jsonb",
                quote(checksum),
            ]
            target.write(
                "insert into public.reading_vocabulary_entries "
                "(id,source_order,headword,pos,meaning_vi,example_en,example_vi,"
                "related_expression_en,context_chunk,topic,difficulty,content,source_archive_sha256) "
                "values (" + ",".join(values) + ") on conflict (id) do nothing;\n"
            )
        for day in plan:
            ids_sql = "array[" + ",".join(quote(entry_id) for entry_id in day["new_vocabulary_ids"]) + "]::text[]"
            tasks_sql = quote(json.dumps(day["daily_tasks"], ensure_ascii=False, separators=(",", ":"))) + "::jsonb"
            values = [
                str(day["day"]), str(day["week"]), quote(day["activity_type"]),
                quote(day["phase"]), ids_sql, tasks_sql, quote(day["notes_vi"]),
            ]
            target.write(
                "insert into public.reading_vocabulary_plan_days "
                "(day_number,week_number,activity_type,phase,new_vocabulary_ids,daily_tasks,notes_vi) "
                "values (" + ",".join(values) + ") on conflict (day_number) do nothing;\n"
            )
    print(f"Wrote {len(words)} entries and {len(plan)} plan days to {output}; archive SHA-256 {checksum}")


if __name__ == "__main__":
    main()
