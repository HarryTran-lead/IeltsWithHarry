"""Build the reviewed-shape SQL seed from the owner-authorized source archive.

Usage: python scripts/build-collocations-migration.py path/to/package.zip
"""

import csv
import hashlib
import io
import sys
import zipfile
from pathlib import Path


def quote(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"


def array(value: str, delimiter: str = ";") -> str:
    parts = [part.strip() for part in value.split(delimiter) if part.strip()]
    return "ARRAY[" + ",".join(quote(part) for part in parts) + "]::text[]"


def main() -> None:
    archive_path = Path(sys.argv[1])
    archive_hash = hashlib.sha256(archive_path.read_bytes()).hexdigest()
    with zipfile.ZipFile(archive_path) as archive:
        data = archive.read("collocations_unique_988_import.csv")
    rows = list(csv.DictReader(io.StringIO(data.decode("utf-8-sig"))))
    assert len(rows) == 988, f"Expected 988 rows, got {len(rows)}"
    assert len({row["id"] for row in rows}) == 988
    assert len({row["normalized_key"] for row in rows}) == 988
    assert {row["level"] for row in rows} == {"A1", "A2", "B1", "B2", "C1", "C2"}
    assert all(row["collocation"] and row["meaning_vi"] and row["example_en"] and row["example_vi"] for row in rows)

    output = Path("supabase/migrations/202610290004_collocations_seed.sql")
    with output.open("w", encoding="utf-8", newline="\n") as target:
        target.write(f"-- 988 unique, owner-authorized bilingual collocations. Source archive SHA-256: {archive_hash}\n")
        target.write("-- Original editorial review flags are retained; publication permission was confirmed by the project owner.\n")
        for row in rows:
            duplicate_orders = [int(x) for x in row["duplicate_source_orders"].replace("|", ";").split(";") if x.strip()]
            duplicates_sql = "ARRAY[" + ",".join(str(x) for x in duplicate_orders) + "]::integer[]"
            flags = row["qa_flags"].replace("|", ";")
            values = [
                quote(row["id"]), str(int(row["source_order"])), duplicates_sql,
                quote(row["level"]), quote(row["collocation"]), quote(row["normalized_key"]),
                quote(row["meaning_vi"]), quote(row["example_en"]), quote(row["example_vi"]),
                quote(row["note"]), array(flags), quote(archive_hash),
            ]
            target.write("insert into public.collocation_entries "
                         "(id,source_order,duplicate_source_orders,level,phrase,normalized_key,meaning_vi,example_en,example_vi,note,qa_flags,source_archive_sha256) "
                         "values (" + ",".join(values) + ") on conflict (id) do nothing;\n")
    print(f"Wrote {len(rows)} rows to {output}; archive SHA-256 {archive_hash}")


if __name__ == "__main__":
    main()
