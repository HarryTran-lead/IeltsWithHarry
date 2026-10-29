"""Validate the supplied Listening archive and build an idempotent SQL migration.

Usage: python scripts/build-listening-vocabulary-migration.py path/to/IELTS_Listening_1200.zip
"""

import csv
import hashlib
import io
import json
import sys
import zipfile
from collections import Counter
from pathlib import Path


def sql(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def main() -> None:
    archive = Path(sys.argv[1])
    sha = hashlib.sha256(archive.read_bytes()).hexdigest()
    with zipfile.ZipFile(archive) as bundle:
        rows = list(csv.DictReader(io.StringIO(bundle.read("IELTS_Listening_1200_Full.csv").decode("utf-8-sig"))))
        source_json = json.loads(bundle.read("IELTS_Listening_1200_Full.json").decode("utf-8-sig"))
    assert len(rows) == source_json["count"] == 1200
    assert len(source_json["items"]) == 1200
    assert len({row["id"] for row in rows}) == 1200
    assert len({(row["topic_id"], row["word"].casefold()) for row in rows}) == 1200
    assert {int(row["topic_id"]) for row in rows} == set(range(1, 36))
    assert Counter(row["source"] for row in rows) == {"Trong ảnh": 910, "Bổ sung": 290}
    assert Counter(row["level"] for row in rows) == {"Core": 209, "IELTS Listening": 991}
    required = ("topic_en", "topic_vi", "word", "meaning_vi", "example_en", "example_vi", "listening_note")
    assert all(all(row[field].strip() for field in required) for row in rows)
    assert all(row["id"] == f"LST-{index:04d}" for index, row in enumerate(rows, 1))
    assert [row["id"] for row in rows] == [item["id"] for item in source_json["items"]]

    output = Path("supabase/migrations/202610290006_listening_vocabulary_seed.sql")
    with output.open("w", encoding="utf-8", newline="\n") as target:
        target.write(f"-- 1,200 owner-provided IELTS Listening entries; archive SHA-256: {sha}\n")
        target.write("-- 910 image-transcribed rows and 290 additions retain their source label. IPA is approximate.\n")
        for index, row in enumerate(rows, 1):
            values = [sql(row["id"]), str(index), str(int(row["topic_id"]))]
            values.extend(sql(row[name]) for name in (
                "topic_en", "topic_vi", "subtopic", "word", "meaning_vi", "ipa_us_approx",
                "example_en", "example_vi", "listening_paraphrase", "listening_note", "source", "level",
            ))
            values.append(sql(sha))
            target.write(
                "insert into public.listening_vocabulary_entries "
                "(id,source_order,topic_id,topic_en,topic_vi,subtopic,word,meaning_vi,ipa_us_approx,"
                "example_en,example_vi,listening_paraphrase,listening_note,source_type,level_label,source_archive_sha256) "
                "values (" + ",".join(values) + ") on conflict (id) do nothing;\n"
            )
    print(f"Wrote {len(rows)} rows across 35 topics to {output}; archive SHA-256 {sha}")


if __name__ == "__main__":
    main()
