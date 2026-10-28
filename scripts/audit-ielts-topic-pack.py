"""Read-only inventory of the owner-supplied 15-topic ZIP against live IELTS rows."""

from __future__ import annotations

import argparse
import collections
import csv
import hashlib
import importlib.util
import io
import json
import zipfile
from pathlib import Path


def load_audit():
    path = Path(__file__).with_name("vocabulary-v2-phase1-audit.py")
    spec = importlib.util.spec_from_file_location("vocabulary_audit", path)
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def pack_rows(path: Path):
    with zipfile.ZipFile(path) as archive:
        name = next(name for name in archive.namelist() if name.endswith("/ALL_15_TOPICS_1650.csv"))
        rows = list(csv.DictReader(io.StringIO(archive.read(name).decode("utf-8-sig"), newline="")))
    return rows


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--zip", type=Path, required=True)
    parser.add_argument("--expected-ref", required=True)
    args = parser.parse_args()
    audit = load_audit()
    db = audit.ReadOnlyProject(args.expected_ref)
    rows = pack_rows(args.zip)
    live = db.rows("ielts_vocabulary_entries", "source_key,term,normalized_term,topic,definition_vi,content_origin,published")
    by_term = {row["normalized_term"]: row for row in live}
    authored = [row for row in rows if row["Data origin"] in ("prior_draft", "new_authored_proposal")]
    collisions = [row for row in authored if audit.normalized(row["Term"]) in by_term]
    terms = collections.defaultdict(list)
    for row in authored:
        terms[audit.normalized(row["Term"])].append(row)
    multiple = {term: values for term, values in terms.items() if len(values) > 1}
    print(json.dumps({
        "zip_sha256": hashlib.sha256(args.zip.read_bytes()).hexdigest(),
        "placements": len(rows),
        "origins": dict(collections.Counter(row["Data origin"] for row in rows)),
        "authored_placements": len(authored),
        "authored_distinct": len(terms),
        "authored_live_collisions": [{"term": row["Term"], "topic": row["Topic"],
                                      "live_topic": by_term[audit.normalized(row["Term"])]["topic"],
                                      "live_origin": by_term[audit.normalized(row["Term"])]["content_origin"]}
                                     for row in collisions],
        "authored_reused": {term: [{"topic": value["Topic"], "meaning": value["Meaning VI"]}
                                   for value in values] for term, values in multiple.items()},
        "live_ielts": len(live),
    }, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
