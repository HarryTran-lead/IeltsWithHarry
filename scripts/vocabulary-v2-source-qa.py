"""Read-only QA signals for the owner-provided IELTS vocabulary archive.

Signals are review leads, not automatic publication decisions. Output stays private.
"""

from __future__ import annotations

import argparse
import collections
import hashlib
import importlib.util
import json
import re
from pathlib import Path


def load_audit_module():
    path = Path(__file__).with_name("vocabulary-v2-phase1-audit.py")
    spec = importlib.util.spec_from_file_location("vocabulary_phase1_audit", path)
    if spec is None or spec.loader is None:
        raise RuntimeError("Cannot load archive parser")
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--archive", type=Path, required=True)
    parser.add_argument("--out-dir", type=Path, required=True)
    args = parser.parse_args()
    repo = Path(__file__).resolve().parent.parent
    output_dir = args.out_dir.resolve()
    if output_dir.is_relative_to(repo):
        parser.error("QA output must be outside the repository")
    output_dir.mkdir(parents=True, exist_ok=True)
    audit = load_audit_module()
    rows, source_report = audit.source_rows(args.archive)
    examples_by_text: collections.Counter[str] = collections.Counter()
    for row in rows:
        examples_by_text.update(audit.normalized(part) for part in row["Examples"].split(" | "))

    flags: list[dict[str, object]] = []
    by_signal: collections.Counter[str] = collections.Counter()
    by_topic_nine: collections.Counter[str] = collections.Counter()
    for row in rows:
        examples = row["Examples"].split(" | ")
        normalized_examples = [audit.normalized(part) for part in examples]
        normalized_term = audit.normalized(row["Term"])
        signals: list[str] = []
        if any(re.search(r"\bnine\b", example, flags=re.IGNORECASE) for example in examples):
            signals.append("example_contains_nine")
            by_topic_nine[row["Topic"]] += 1
        if all(normalized_term not in example for example in normalized_examples):
            signals.append("term_not_literal_in_examples")
        if len(set(normalized_examples)) != len(normalized_examples):
            signals.append("duplicate_example_within_row")
        if any(examples_by_text[example] > 1 for example in normalized_examples):
            signals.append("example_reused_across_rows")
        if len(audit.normalized(row["Definition"])) < 10:
            signals.append("short_definition")
        if signals:
            by_signal.update(signals)
            flags.append({
                "source_file": row["source_file"],
                "source_row": int(row["source_row"]),
                "term": row["Term"],
                "topic": row["Topic"],
                "signals": signals,
                "row_sha256": hashlib.sha256(json.dumps(row, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest(),
            })
    result = {
        "archive_sha256": source_report["archive_sha256"],
        "source_rows": len(rows),
        "examples": source_report["total_examples"],
        "rows_with_any_signal": len(flags),
        "signal_counts": dict(sorted(by_signal.items())),
        "example_contains_nine_by_topic": dict(sorted(by_topic_nine.items())),
        "flagged_rows": flags,
        "note": "Heuristic QA signals require editorial review; a flag is not proof of an error.",
    }
    destination = output_dir / "source-qa-signals.json"
    destination.write_text(json.dumps(result, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({key: result[key] for key in ("source_rows", "examples", "rows_with_any_signal", "signal_counts")}, ensure_ascii=False))


if __name__ == "__main__":
    main()
