"""Build src/data/reading-vi/passages.json from the Vietnamese Reading translation pack.

Usage: python scripts/build-reading-vi.py <unzipped pack folder>
The pack (IELTS_Reading_14_De_560_Loi_Giai_FULL_IMPORT_VI.zip) holds TESTS/TESTxx/STUDENT_EXAM_NO_KEYS.json
and TRANSLATIONS_VI/TESTxx.json. Each translation is keyed by the SHA-256 of its English passage with
whitespace collapsed, so the site only shows it beside the exact passage it was written for.
"""

import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUTPUT = ROOT / "src/data/reading-vi/passages.json"


def key(passage: str) -> str:
    return hashlib.sha256(re.sub(r"\s+", " ", passage).strip().encode("utf-8")).hexdigest()


def paragraphs(text: str) -> list[str]:
    return [part for part in re.split(r"\n\s*\n", text.strip()) if part.strip()]


pack = Path(sys.argv[1])
out: dict[str, dict] = {}
for path in sorted((pack / "TRANSLATIONS_VI").glob("TEST*.json")):
    number = int(re.sub(r"\D", "", path.stem))
    exam = json.loads((pack / f"TESTS/TEST{number:02d}/STUDENT_EXAM_NO_KEYS.json").read_text(encoding="utf-8"))
    translation = json.loads(path.read_text(encoding="utf-8"))
    for section, vi in zip(exam["sections"], translation["sections"]):
        if section["title"] != vi["title"]:
            raise SystemExit(f"Test {number}: section titles differ: {section['title']!r} / {vi['title']!r}")
        if len(paragraphs(section["passage"])) != len(paragraphs(vi["passage_vi"])):
            raise SystemExit(f"Test {number} {section['title']}: paragraph counts differ")
        out[key(section["passage"])] = {"exam": f"english-skill-lab-reading-{number:03d}", "section": section["id"], "title": section["title"], "vi": vi["passage_vi"]}

OUTPUT.write_text(json.dumps(out, ensure_ascii=False, indent=0) + "\n", encoding="utf-8")
print(f"{len(out)} passages → {OUTPUT.relative_to(ROOT)}")
