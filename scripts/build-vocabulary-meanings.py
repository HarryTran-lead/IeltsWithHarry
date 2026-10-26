"""Join the English word pack to attributed English–Vietnamese dictionaries.

Run after placing the source ZIP and dictionary files in deliverables/. This
script never labels a dictionary match as an editor-reviewed IELTS sense.
The generated data is CC BY-SA 4.0; see docs/VOCABULARY_MEANINGS.md.
"""

from __future__ import annotations

import csv
import difflib
import io
import json
import re
import sqlite3
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
PACK = ROOT / "deliverables/IeltsWithHarry_Vocabulary_Topics_Level_1-7plus.zip"
THICHHOC = ROOT / "deliverables/thichhoc-dict/dict-en-vi/data/entries"
SKYPEDIA = ROOT / "deliverables/dictionary_en_vi.db"
OUTPUT = ROOT / "data/vocabulary-meanings.jsonl"

POS = {"noun": "n", "verb": "v", "adjective": "adj", "adverb": "adv"}
SKY_POS = {"noun": "N", "verb": "V", "adjective": "A", "adverb": "D"}
THICHHOC_URL = "https://github.com/thichhoc-org/thichhoc-dict"
SKYPEDIA_URL = "https://github.com/skypediacode/english-vietnamese-dictionary"


def normalize_gloss(value: str) -> str:
    value = value.lower().replace("‘", "'").replace("’", "'").replace("`", "'")
    return " ".join(re.findall(r"[a-z0-9]+", value))


def variants(headword: str) -> list[str]:
    word = headword.strip().casefold()
    return list(dict.fromkeys([word, *(part.strip() for part in word.split("/"))]))


def unique(values: list[str]) -> list[str]:
    return list(dict.fromkeys(value.strip() for value in values if value and value.strip()))


def load_thichhoc() -> dict[str, list[dict]]:
    by_word: dict[str, list[dict]] = defaultdict(list)
    for path in sorted(THICHHOC.glob("*.jsonl")):
        with path.open(encoding="utf-8") as handle:
            for line in handle:
                if line.strip():
                    row = json.loads(line)
                    by_word[row["headword"].casefold()].append(row)
    if not by_word:
        raise RuntimeError(f"Missing Thichhoc source files: {THICHHOC}")
    return by_word


def load_skypedia() -> dict[str, list[tuple[str, str]]]:
    if not SKYPEDIA.exists():
        raise RuntimeError(f"Missing Skypedia SQLite file: {SKYPEDIA}")
    connection = sqlite3.connect(SKYPEDIA)
    by_word: dict[str, list[tuple[str, str]]] = defaultdict(list)
    for word, meaning, pos in connection.execute(
        "select w.word, d.definition, d.pos from words w "
        "join word_definitions wd on wd.word_id = w.id "
        "join definitions d on d.id = wd.definition_id"
    ):
        by_word[word.casefold()].append((meaning, pos or ""))
    connection.close()
    return by_word


def thichhoc_match(row: dict[str, str], dictionary: dict[str, list[dict]]) -> dict | None:
    records = next((dictionary[word] for word in variants(row["headword"]) if word in dictionary), [])
    if not records:
        return None
    matching_pos = [record for record in records if record.get("pos") == POS.get(row["pos"])]
    if matching_pos:
        records = matching_pos
    source_gloss = normalize_gloss(row.get("definition_en", ""))
    candidates: list[tuple[float, str, str, str]] = []
    all_meanings: list[str] = []
    for record in records:
        glosses = record.get("gloss_en") or []
        meanings = record.get("senses_vi") or []
        all_meanings.extend(meanings)
        for index, gloss in enumerate(glosses):
            if index >= len(meanings) or not source_gloss:
                continue
            normalized = normalize_gloss(gloss)
            if not normalized:
                continue
            if normalized == source_gloss:
                score, status = 1.0, "matched_exact_gloss"
            elif len(normalized) >= 12 and (normalized in source_gloss or source_gloss in normalized):
                score, status = 0.96, "matched_contained_gloss"
            else:
                score = difflib.SequenceMatcher(None, normalized, source_gloss).ratio()
                status = "matched_similar_gloss"
            candidates.append((score, meanings[index], gloss, status))
    candidates.sort(key=lambda item: item[0], reverse=True)
    best = candidates[0] if candidates else None
    runner_up = next((item for item in candidates[1:] if item[1] != best[1]), None) if best else None
    confident = bool(best and (best[0] >= 0.96 or (best[0] >= 0.88 and (not runner_up or best[0] - runner_up[0] >= 0.08))))
    options = unique(([best[1]] if best else []) + all_meanings)[:6]
    return {
        "meaning_vi_suggested": best[1] if confident else (options[0] if options else ""),
        "meaning_vi_options": options,
        "meaning_status": best[3] if confident else "dictionary_candidates",
        "meaning_gloss_en": best[2] if confident else "",
        "meaning_source": "Thichhoc English–Vietnamese Dictionary",
        "meaning_source_url": THICHHOC_URL,
        "meaning_license": "CC BY-SA 4.0",
        "ipa": next((record.get("pron") for record in records if record.get("pron")), ""),
    }


def skypedia_match(row: dict[str, str], dictionary: dict[str, list[tuple[str, str]]]) -> dict | None:
    records = next((dictionary[word] for word in variants(row["headword"]) if word in dictionary), [])
    if not records:
        return None
    matching_pos = [meaning for meaning, pos in records if pos == SKY_POS.get(row["pos"])]
    options = unique(matching_pos or [meaning for meaning, _ in records])[:6]
    return {
        "meaning_vi_suggested": options[0] if options else "",
        "meaning_vi_options": options,
        "meaning_status": "dictionary_candidates",
        "meaning_gloss_en": "",
        "meaning_source": "Skypedia English–Vietnamese Dictionary",
        "meaning_source_url": SKYPEDIA_URL,
        "meaning_license": "CC BY-SA 4.0",
        "ipa": "",
    }


def build() -> None:
    sys.stdout.reconfigure(encoding="utf-8")
    thichhoc = load_thichhoc()
    skypedia = load_skypedia()
    with zipfile.ZipFile(PACK) as archive:
        rows = list(csv.DictReader(io.TextIOWrapper(archive.open("catalog/vocabulary_all.csv"), encoding="utf-8-sig")))
    if len(rows) != 9937:
        raise RuntimeError(f"Unexpected source row count: {len(rows)}")
    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    counts: Counter[str] = Counter()
    with OUTPUT.open("w", encoding="utf-8", newline="\n") as output:
        for row in rows:
            meaning = thichhoc_match(row, thichhoc) or skypedia_match(row, skypedia) or {
                "meaning_vi_suggested": "",
                "meaning_vi_options": [],
                "meaning_status": "missing",
                "meaning_gloss_en": "",
                "meaning_source": "",
                "meaning_source_url": "",
                "meaning_license": "",
                "ipa": "",
            }
            counts[meaning["meaning_status"]] += 1
            record = {"source_id": row["source_id"], "headword": row["headword"], **meaning}
            output.write(json.dumps(record, ensure_ascii=False, separators=(",", ":")) + "\n")
    print(json.dumps({"total": len(rows), "statuses": counts, "output": str(OUTPUT)}, ensure_ascii=False))


if __name__ == "__main__":
    build()
