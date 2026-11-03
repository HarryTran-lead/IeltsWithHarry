"""Import the six canonical LEVELS files from the Grammar editorial ZIP.

Usage: python scripts/import-grammar-editorial.py path/to/editorial.zip
The BY_LESSON copies and source archives are intentionally ignored.
"""

import json
import sys
import zipfile
from collections import Counter, defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "data" / "grammar-editorial"
LEVELS = ("A1", "A2", "B1", "B2", "C1", "C2")
PREFIX = "English_Skill_Lab_Grammar_A1_C2/LEVELS"


def lesson_id(lesson):
    return lesson.get("lesson_id") or lesson.get("id")


def public_lesson(lesson, level, counts):
    code = lesson_id(lesson)
    learn = lesson.get("learn") or {}
    sections = lesson.get("sections") or learn.get("rules") or []
    first = sections[0] if sections else {}
    examples = first.get("examples") or []
    return {
        "code": code,
        "level": level,
        "group": lesson.get("group") or lesson.get("name_en") or lesson.get("title") or "",
        "title": learn.get("title") or lesson.get("title") or lesson.get("name_en") or code,
        "formula": first.get("formula") or first.get("formula_or_pattern") or "",
        "example": examples[0].get("en", "") if examples else "",
        "counts": dict(counts),
    }


def main():
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/import-grammar-editorial.py <editorial.zip>")
    OUT.mkdir(parents=True, exist_ok=True)
    catalog = []
    seen = set()
    total = 0
    with zipfile.ZipFile(sys.argv[1]) as archive:
        for level in LEVELS:
            base = f"{PREFIX}/{level}"
            lessons = json.loads(archive.read(f"{base}/ALL_LEARN.json"))
            questions = json.loads(archive.read(f"{base}/ALL_QUESTIONS.json"))
            grouped = defaultdict(list)
            for question in questions:
                qid = question["id"]
                assert qid not in seen, f"Duplicate question ID: {qid}"
                assert question.get("publishable") is False, qid
                seen.add(qid)
                grouped[question["lesson_id"]].append(question)
            payload = {}
            for lesson in lessons:
                code = lesson_id(lesson)
                assert code not in payload and code in grouped, code
                items = grouped.pop(code)
                counts = Counter(item["stage"] for item in items)
                summary = public_lesson(lesson, level, counts)
                catalog.append(summary)
                payload[code] = {"lesson": lesson, "questions": items}
            assert not grouped, f"Unknown lessons in {level}: {list(grouped)}"
            total += len(questions)
            (OUT / f"{level}.json").write_text(json.dumps(payload, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    assert len(catalog) == 180 and total == 14455 and len(seen) == total
    (OUT / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Imported {len(catalog)} lessons and {total} questions to {OUT}")


if __name__ == "__main__":
    main()
