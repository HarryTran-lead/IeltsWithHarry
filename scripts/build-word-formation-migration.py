"""Validate the supplied Word Formation ZIP and build an idempotent SQL seed.

Usage: python scripts/build-word-formation-migration.py path/to/archive.zip
"""

import csv
import hashlib
import io
import json
import sys
import zipfile
from pathlib import Path


def sql(value: str | None) -> str:
    return "null" if value is None else "'" + value.replace("'", "''") + "'"


def main() -> None:
    archive = Path(sys.argv[1])
    source_hash = hashlib.sha256(archive.read_bytes()).hexdigest()
    prefix = "WordFormation_300_Demo/data/"
    with zipfile.ZipFile(archive) as bundle:
        families = json.loads(bundle.read(prefix + "word_families.json").decode("utf-8-sig"))
        csv_rows = list(csv.DictReader(io.StringIO(bundle.read(prefix + "word_families.csv").decode("utf-8-sig"))))
    assert len(families) == len(csv_rows) == 300
    assert {family["id"] for family in families} == set(range(1, 301))
    assert len({family["example"]["en"] for family in families}) == 300

    output = Path("supabase/migrations/202610290008_word_formation_seed.sql")
    with output.open("w", encoding="utf-8", newline="\n") as target:
        target.write(f"-- 300 owner-provided Word Families; source archive SHA-256: {source_hash}\n")
        target.write("-- Source warnings are retained. The archive contains one bilingual example per family.\n")
        for index, family in enumerate(families, 1):
            csv_row = csv_rows[index - 1]
            forms = family["forms"]
            position = family["example"]["pos"]
            answer = forms[position]
            assert family["id"] == int(csv_row["STT"]) == index
            assert position in {"noun", "verb", "adj", "adv"} and answer
            assert family["example"]["en"].count("____") == 1
            assert family["example"]["en"].replace("____", answer) == csv_row["Câu đầy đủ tiếng Anh"]
            assert family["example"]["vi"] == csv_row["Dịch tiếng Việt"]
            assert answer == csv_row["Đáp án"]
            assert family["warning"] == (csv_row["Lưu ý kiểm tra"] or None)
            values = [str(index), sql(forms["noun"]), sql(forms["verb"]), sql(forms["adj"]), sql(forms["adv"]),
                      sql(family["meaning"]), sql(position), sql(family["example"]["en"]),
                      sql(family["example"]["vi"]), sql(family["warning"]), sql(source_hash)]
            target.write(
                "insert into public.word_formation_families "
                "(id,noun,verb,adjective,adverb,meaning_vi,example_pos,example_blank_en,example_vi,source_warning,source_archive_sha256) "
                "values (" + ",".join(values) + ") on conflict (id) do nothing;\n"
            )
    print(f"Wrote {len(families)} families to {output}; SHA-256 {source_hash}")


if __name__ == "__main__":
    main()
