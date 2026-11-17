"""Convert the ESL v2 lessons of the VI→EN bundle into "Luyện diễn đạt" exercises.

Usage:
  python scripts/import-esl-v2-translation.py --zip <IELTS_Viet_Anh_FULL_DATA_6650_2410_...zip>

Reads the bundle (and the H10/H11 source archives nested inside it) without extracting
it, then writes data/translation-practice/esl-v2-additions.json. Run
scripts/build-translation-practice.py afterwards to rebuild the per-band files.

ADD ONLY: the 950 existing exercises are never read or changed here. The script keeps
an ESL v2 lesson only if it has a reference answer and fits the band track's rules:
levels 1.0–2.0 have no answers in the bundle, and from 7.0 up a lesson must be a
paragraph of at least three sentences in both languages.
"""

from __future__ import annotations

import argparse
import hashlib
import io
import json
import re
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "data/translation-practice/esl-v2-additions.json"
RUBRIC = ROOT / "data/translation-practice/level-rubric.json"
EXPECTED_SHA256 = "8a32713da66ac7aa6e225bc923805caf1c82ed2014f2b9338c9f695aebc1f106"

LESSONS = "02_LESSONS_2410/LESSONS_2410_WITH_VIETNAMESE_PROMPTS.jsonl"
ANSWERS = "02_LESSONS_2410/admin_only/REFERENCE_ANSWERS_1990_H06-H11.jsonl"
H24 = "03_ORIGINAL_SOURCE_PACKAGES/IELTS_Viet_Anh_R19_HINT_H24_Complete_Codex_Import_ReviewOnly.zip"
GUARD_SOURCES = {
    "R19-HINT-H24/source_archives/IELTS_Viet_Anh_R19_HINT_H10_280_Lessons_6705_Hints_ReviewOnly.zip":
        "R19-HINT-H10/R19-HINT-H10-280-LESSONS-6705-HINTS.json",
    "R19-HINT-H24/source_archives/IELTS_Viet_Anh_R19_HINT_H11_330_Lessons_7908_Hints_ReviewOnly.zip":
        "R19-HINT-H11-330-LESSONS-7908-HINTS.json",
}

QUOTED = r"“[^”]*”\.?"
REPEATED_LABELS = ("Yêu cầu dịch", "Câu gốc", "Câu tiếng Việt", "Câu Việt", "Đề Việt", "Đáp án mẫu",
                   "Đáp án tham khảo", "Đáp án gợi ý", "Cách diễn đạt mẫu", "Cách diễn đạt khác",
                   "Cách dịch khác", "Cách khác")


def jsonl(archive: zipfile.ZipFile, name: str) -> list[dict]:
    return [json.loads(line) for line in archive.read(name).decode("utf-8").splitlines() if line.strip()]


def semantic_guards(bundle: zipfile.ZipFile) -> dict[str, list[str]]:
    """Meaning cautions written for the 7.0+ lessons, which carry no explanation of their own."""
    guards: dict[str, list[str]] = {}
    with zipfile.ZipFile(io.BytesIO(bundle.read(H24))) as h24:
        for archive_name, member in GUARD_SOURCES.items():
            with zipfile.ZipFile(io.BytesIO(h24.read(archive_name))) as source:
                for lesson in json.loads(source.read(member).decode("utf-8"))["lessons"]:
                    if lesson.get("semanticGuardVi"):
                        guards[lesson["lessonId"]] = lesson["semanticGuardVi"]
    return guards


def sentences(text: str) -> int:
    return len(re.findall(r"[.!?]", text))


def clean_explanation(answer: dict, guards: list[str] | None) -> str:
    text = answer.get("sourceExplanationVi") or answer.get("explanationVi")
    if not text:
        return " ".join(guards or [])
    # Labelled parts such as "Câu gốc: “…”", "Đáp án mẫu: …" or "Cách khác: …" repeat
    # the prompt, the model answer or an alternative, all of which the review screen
    # already shows. Split the note at its labels and keep the analysis and self-check.
    text = re.sub(r"\s*Lưu ý: đáp án mẫu không phải là cách diễn đạt duy nhất đúng\.?", "", text)
    repeated = "|".join(REPEATED_LABELS)
    text = re.sub(rf"(?:{repeated}):\s*{QUOTED}\s*", "", text)  # quoted: drop the quote only
    label = r"(?:(?<=^)|(?<=\n)|(?<=[.!?”])\s+)(?=[A-ZÀ-ỸĐ][^:\n“”.]{1,40}:\s)"
    kept = [part.strip() for part in re.split(label, text)
            if part.strip() and not re.match(rf"(?:{repeated}):", part.strip())]
    return re.sub(r"\s+", " ", " ".join(kept)).strip()


def clean_reason(reason: str) -> str:
    reason = re.sub(r"^So với đáp án mẫu, phần cần sửa: “[^”]*” → “[^”]*”\.\s*", "", reason)
    reason = re.sub(r"\s*Đây là ví dụ lỗi trong ngữ cảnh bài này, không phải quy tắc loại mọi cách diễn đạt khác\.?$", "", reason)
    return reason.strip()


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("--zip", required=True, type=Path)
    args = parser.parse_args()
    digest = hashlib.sha256(args.zip.read_bytes()).hexdigest()
    if digest != EXPECTED_SHA256:
        raise SystemExit(f"Unexpected bundle SHA-256 {digest}")

    rubric = {row["level"]: row for row in json.loads(RUBRIC.read_text(encoding="utf-8"))}
    with zipfile.ZipFile(args.zip) as bundle:
        lessons = {row["lessonId"]: row for row in jsonl(bundle, LESSONS)}
        answers = {row["lessonId"]: row for row in jsonl(bundle, ANSWERS)}
        guards = semantic_guards(bundle)

    rows, skipped = [], {"no_reference_answer": 0, "not_a_paragraph_at_7_plus": 0, "no_explanation": 0}
    for lesson_id, lesson in lessons.items():
        if lesson["sourceGroup"] != "1460_additional":
            continue
        answer = answers.get(lesson_id)
        if not answer:
            skipped["no_reference_answer"] += 1
            continue
        assert answer.get("promptVi", lesson["promptVi"]) == lesson["promptVi"], lesson_id
        band, kind = lesson["band"], lesson["lessonType"]
        references = list(dict.fromkeys(answer["referenceAnswers"] + (answer.get("acceptedAlternatives") or [])))
        if float(band) >= 7 and (kind != "paragraph" or sentences(lesson["promptVi"]) < 3 or sentences(references[0]) < 3):
            skipped["not_a_paragraph_at_7_plus"] += 1
            continue
        explanation = clean_explanation(answer, guards.get(lesson_id))
        if not explanation:
            skipped["no_explanation"] += 1
            continue
        # Errors tied to another sentence of the same unit would confuse this exercise.
        errors = [{"incorrect": error["incorrect"], "correction": error["correction"], "reasonVi": clean_reason(error["reasonVi"])}
                  for error in answer.get("commonErrors") or [] if error.get("scope", "item") == "item"]
        unit = "-".join(lesson_id.split("-")[2:4]).upper()
        rows.append({
            "id": lesson_id, "practiceLevel": band, "type": kind, "topic": lesson["topic"],
            "promptVi": lesson["promptVi"], "referenceAnswers": references,
            "grammarTags": answer.get("grammarTags") or [], "explanationVi": explanation,
            "rationaleVi": f"{rubric[band]['focusVi']} Bài bổ sung từ bộ ESL v2 ({unit}), chủ đề {lesson['topic']}.",
            "commonErrors": errors, "calibrationStatus": "internal_review", "editorialStatus": "pilot",
            "source": "esl-v2", "version": 1,
        })

    rows.sort(key=lambda row: (float(row["practiceLevel"]), row["id"]))
    DEST.write_text(json.dumps(rows, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
    print(f"Wrote {len(rows)} ESL v2 exercises; skipped {skipped}")


if __name__ == "__main__":
    main()
