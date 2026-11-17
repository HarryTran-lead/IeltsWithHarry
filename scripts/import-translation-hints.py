"""Select the learner-safe step hints for "Luyện diễn đạt" from the VI→EN bundle.

Usage:
  python scripts/import-translation-hints.py --zip <IELTS_Viet_Anh_FULL_DATA_6650_2410_...zip>

The bundle holds 45,320 review-only hints in eight categories and three levels. Most
are unsuitable for learners: level 2–3 hints spell out first letters, give the
English key word or a model structure, and some split Vietnamese compounds in two.
This keeps only level-1 "how to approach it" hints (syntax, logic, self-check) and
drops any hint that
  - the bundle's own QA queues flagged (H22 P0/P1, H25 unified queue, H22 source risks),
  - quotes a part of the prompt that is not a whole clause or a whole word,
  - repeats three or more consecutive words of a reference answer.

Reads the published band files to know which exercises exist, so run it after
scripts/build-translation-practice.py has written them, then rebuild once more.
Writes data/translation-practice/hints-l1.json: {exerciseId: [hint, ...]}.
"""

from __future__ import annotations

import argparse
import csv
import hashlib
import io
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
BANDS = ROOT / "public/practice-data/translation"
DEST = ROOT / "data/translation-practice/hints-l1.json"
EXPECTED_SHA256 = "8a32713da66ac7aa6e225bc923805caf1c82ed2014f2b9338c9f695aebc1f106"

HINTS = "02_LESSONS_2410/admin_only/H24-45320-HINTS-REVIEWONLY.jsonl"
H24 = "03_ORIGINAL_SOURCE_PACKAGES/IELTS_Viet_Anh_R19_HINT_H24_Complete_Codex_Import_ReviewOnly.zip"
H25 = "03_ORIGINAL_SOURCE_PACKAGES/IELTS_Viet_Anh_R19_HINT_H25_Remediation_1300_ReviewOnly.zip"
H22_HINT_QUEUE = "R19-HINT-H24/canonical/admin_only/qa/H22_998_PRIORITY_QUEUE.csv"
H22_SOURCE_QUEUE = "R19-HINT-H24/canonical/admin_only/qa/H22_35_SOURCE_QUEUE.csv"
H25_QUEUE = "R19-HINT-H25/H25-UNIFIED-P0-P1-QUEUE.csv"

CATEGORIES = ("syntax", "logic", "self_check")  # also the order shown to the learner
# Teacher-facing wording, reworded for learners.
REWRITES = {"Rà ba lỗi có thể chấm oan:": "Soát ba lỗi dễ mắc:"}
# Templates whose slot was never filled or that repeat themselves.
DROP = re.compile(r"Từ khóa quan hệ trong đề: (hành động chính|mốc thời gian)|ưu tiên a thay vì b"
                  r"|phần thể hiện mệnh đề chính và thành phần mở rộng")
BOUNDARY_BEFORE = re.compile(r"[,.;:!?–—-]\s*$")


def rows(data: bytes) -> list[dict]:
    return list(csv.DictReader(io.StringIO(data.decode("utf-8-sig"))))


def flagged(bundle: zipfile.ZipFile) -> tuple[set[str], set[str]]:
    with zipfile.ZipFile(io.BytesIO(bundle.read(H24))) as h24:
        hint_ids = {row["hint_id"] for row in rows(h24.read(H22_HINT_QUEUE))}
        lesson_ids = {row["lesson_id"] for row in rows(h24.read(H22_SOURCE_QUEUE))}
    with zipfile.ZipFile(io.BytesIO(bundle.read(H25))) as h25:
        hint_ids |= {row["hint_id"] for row in rows(h25.read(H25_QUEUE))}
    return hint_ids, lesson_ids


def quotes_whole_units(hint: str, prompt: str) -> bool:
    """Every “…” quote must be a whole clause (3+ words) or a whole word/short signal."""
    for raw in re.findall(r"“([^”]*)”", hint):
        truncated = raw.rstrip().endswith(("…", "..."))
        quote = raw.rstrip().rstrip("…").rstrip(".").strip() if truncated else raw.strip()
        if not quote:
            return False
        start = prompt.find(quote)
        if start < 0:
            return False
        before, after = prompt[:start], prompt[start + len(quote):]
        words = quote.split()
        if before and before[-1].isalnum():
            return False  # starts inside a word
        if not truncated and after and after[0].isalnum():
            return False  # ends inside a word
        if len(words) >= 3 and before.strip() and not BOUNDARY_BEFORE.search(before):
            return False  # a long excerpt must start a clause, not split a compound
    return True


def leaks_answer(hint: str, answers: list[str]) -> bool:
    text = " ".join(re.findall(r"[a-z']+", hint.lower()))
    for answer in answers:
        words = re.findall(r"[a-z']+", answer.lower())
        if any(" ".join(words[i:i + 3]) in text for i in range(len(words) - 2)):
            return True
    return False


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--zip", required=True, type=Path)
    args = parser.parse_args()
    digest = hashlib.sha256(args.zip.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA256:
        raise SystemExit(f"Unexpected bundle SHA-256 {digest}")

    exercises = {row["id"]: row for path in sorted(BANDS.glob("band-*.json"))
                 for row in json.loads(path.read_text(encoding="utf-8"))}
    with zipfile.ZipFile(args.zip) as bundle:
        hints = [json.loads(line) for line in bundle.read(HINTS).decode("utf-8").splitlines() if line.strip()]
        flagged_hints, flagged_lessons = flagged(bundle)

    counts = {"candidates": 0, "flagged": 0, "unfilled_template": 0, "partial_quote": 0, "answer_words": 0, "kept": 0}
    selected: dict[str, dict[str, str]] = {}
    for hint in hints:
        exercise = exercises.get(hint["lessonId"])
        if not exercise or hint["category"] not in CATEGORIES or hint["level"] != 1:
            continue
        counts["candidates"] += 1
        text = re.sub(r"(?<!\.)\.\.(?!\.)", ".", hint["hintVi"]).strip()
        for old, new in REWRITES.items():
            text = text.replace(old, new)
        if hint["hintId"] in flagged_hints or hint["lessonId"] in flagged_lessons:
            counts["flagged"] += 1
        elif DROP.search(text):
            counts["unfilled_template"] += 1
        elif not quotes_whole_units(text, exercise["promptVi"]):
            counts["partial_quote"] += 1
        elif leaks_answer(text, exercise["referenceAnswers"]):
            counts["answer_words"] += 1
        else:
            counts["kept"] += 1
            selected.setdefault(hint["lessonId"], {})[hint["category"]] = text

    result = {lesson: [by_category[c] for c in CATEGORIES if c in by_category]
              for lesson, by_category in sorted(selected.items())}
    DEST.write_text(json.dumps(result, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    print(f"Wrote hints for {len(result)} of {len(exercises)} exercises; {counts}")


if __name__ == "__main__":
    main()
