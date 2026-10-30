"""Build a compact Vietnamese-to-English hint index from the existing vocabulary data."""

import json
import re
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "data/vocabulary-meanings.jsonl"
OUTPUT = ROOT / "src/lib/vocabulary/vi-en-word-hints.json"

hints: dict[str, set[str]] = defaultdict(set)
for line in SOURCE.open(encoding="utf-8"):
    entry = json.loads(line)
    english = entry["headword"].lower().strip()
    if not re.fullmatch(r"[a-z][a-z -]{0,39}", english):
        continue
    for option in entry.get("meaning_vi_options", [])[:2]:
        for part in re.split(r"[;,]", option.lower()):
            vietnamese = re.sub(r"\([^)]*\)", "", part).strip()
            if (
                1 <= len(vietnamese.split()) <= 4
                and len(vietnamese) <= 45
                and re.fullmatch(r"[a-zA-Z\u00c0-\u1ef9\s-]+", vietnamese)
            ):
                hints[vietnamese].add(english)

OUTPUT.write_text(
    json.dumps({key: sorted(values) for key, values in sorted(hints.items())}, ensure_ascii=False, separators=(",", ":")),
    encoding="utf-8",
)
print(f"Wrote {len(hints)} Vietnamese hints to {OUTPUT}")
