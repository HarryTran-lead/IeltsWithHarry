"""Build the Grammar preview data from the V5 handoff ZIP.

Usage: python scripts/import-grammar-v5.py path/to/grammar-v5.zip
The generated JSON is intentionally compact and deterministic. The archived V3
reference and disabled placement pilot are not imported.
"""

import json
import sys
import zipfile
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "src" / "data" / "grammar"
LEVELS = ("A1", "A2", "B1", "B2", "C1", "C2")


def main() -> None:
    if len(sys.argv) != 2:
        raise SystemExit("Usage: python scripts/import-grammar-v5.py <V5.zip>")
    OUT.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(sys.argv[1]) as archive:
        prefix = "English_Skill_Lab_Grammar_CODEX_READY_V5/02_LEVELS"
        catalog = []
        guides = {}
        for level in LEVELS:
            lessons = json.loads(archive.read(f"{prefix}/{level}/lessons_{level}.json"))
            practice = json.loads(archive.read(f"{prefix}/{level}/practice_{level}_NO_AI.json"))
            assert len(practice) == len(lessons) * 30
            for lesson in lessons:
                assert lesson["production_approved"] is False
                code = lesson["code"]
                catalog.append({key: lesson[key] for key in ("code", "level", "group", "title", "formula", "example")})
                guides[code] = {key: lesson.get(key) for key in (
                    "code", "level", "group", "title", "formula", "example",
                    "translation", "common_mistake", "mistake_explanation",
                    "exception_note", "micro_rules", "guide",
                )}
            items = {}
            for item in practice:
                assert item["auto_score_eligible"] == "False"
                assert item["production_approved"] == "False"
                code = item["lesson_code"]
                items.setdefault(code, []).append({key: item[key] for key in (
                    "item_id", "question", "reference_answer", "answer_explanation",
                    "source_english", "source_vietnamese", "reuse_tier",
                )})
            assert all(len(value) == 30 for value in items.values())
            (OUT / f"practice-{level}.json").write_text(json.dumps(items, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        assert len(catalog) == 180
        (OUT / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        (OUT / "guides.json").write_text(json.dumps(guides, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"Imported {len(catalog)} lessons and 5,400 self-review items to {OUT}")


if __name__ == "__main__":
    main()
