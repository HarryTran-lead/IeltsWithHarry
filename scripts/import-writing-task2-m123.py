"""Build the Writing Task 2 Lab content from the M123 import package.

Usage:
    python scripts/import-writing-task2-m123.py <path to IELTS_Task2_M123>

Writes two files, both read on the server only:
    content/writing-task2/lessons.json  learner content (36 lessons, no answers)
    content/writing-task2/answers.json  reference answers and model essays (server_only feeds)

The package's own SHA-256 manifest is checked first, every answer must point at the lesson
hash it was written for, and a lesson already imported with a different hash stops the run
(pass --allow-update after reviewing the change). The 12 M112 lessons shipped their *_vi
fields in English; content/writing-task2/source/m112-vi-overlay.json supplies the Vietnamese.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "content" / "writing-task2"
OVERLAY = OUT_DIR / "source" / "m112-vi-overlay.json"

FEEDS = {
    "lessons": "import/learner_guided/lessons_36.jsonl",
    "answers": "import/server_only/lesson_answers_36.jsonl",
    "essays": "import/server_only/model_essays_7.jsonl",
}
VI = re.compile("[áàảãạăắằẳẵặâấầẩẫậđéèẻẽẹêếềểễệíìỉĩịóòỏõọôốồổỗộơớờởỡợúùủũụưứừửữựýỳỷỹỵ]", re.IGNORECASE)
STAGES = ["foundation", "basic", "developing", "advanced"]


def fail(message: str) -> None:
    print(f"ERROR: {message}", file=sys.stderr)
    sys.exit(1)


def rows(path: Path) -> list[dict]:
    return [json.loads(line) for line in path.read_text(encoding="utf-8").splitlines() if line.strip()]


def verify_manifest(package: Path) -> None:
    manifest = json.loads((package / "M123_FILE_MANIFEST_SHA256.json").read_text(encoding="utf-8"))
    expected = {item["path"]: item["sha256"] for item in manifest["files"]}
    for feed in FEEDS.values():
        if feed not in expected:
            fail(f"{feed} is not in the package manifest")
        actual = hashlib.sha256((package / feed).read_bytes()).hexdigest()
        if actual != expected[feed]:
            fail(f"{feed} does not match the package manifest (got {actual})")


def vietnamese(value: str, where: str) -> str:
    if not VI.search(value):
        fail(f"{where} has no Vietnamese text: {value!r}")
    return value


def step_title(value: str, where: str) -> str:
    # M112 numbered its steps "Bước 1".."Bước 4"; the overlay gives each a real name.
    if re.fullmatch(r"Bước \d+", value):
        fail(f"{where} step title {value!r} was not replaced by the overlay")
    return vietnamese(value, f"{where} step title")


def translate(lesson: dict, overlay: dict) -> dict:
    """Fill the English *_vi fields of an M112 lesson from the overlay."""
    lesson = json.loads(json.dumps(lesson))
    lesson["learning_goal_vi"] = overlay["learning_goal_vi"].get(lesson["learning_goal_vi"], lesson["learning_goal_vi"])
    for step in lesson["guided_steps"]:
        if step["instruction_vi"] in overlay["guided_steps"]:
            step["title_vi"], step["instruction_vi"] = overlay["guided_steps"][step["instruction_vi"]]
    for drill in lesson["drills"]:
        drill["question_vi"] = overlay["drill_question_vi"].get(drill["question_vi"], drill["question_vi"])
    for word in lesson["vocabulary"]:
        if not word["meaning_vi"]:
            word["meaning_vi"] = overlay["vocabulary_meaning_vi"].get(word["phrase_en"], "")
    return lesson


def build(package: Path) -> tuple[dict, dict]:
    lessons = rows(package / FEEDS["lessons"])
    answers = {row["lesson_id"]: row for row in rows(package / FEEDS["answers"])}
    essays = {row["lesson_id"]: row for row in rows(package / FEEDS["essays"])}
    overlay = json.loads(OVERLAY.read_text(encoding="utf-8"))

    public: list[dict] = []
    private: dict[str, dict] = {}
    for source in lessons:
        lesson = translate(source, overlay) if source["source_pack"] == "M112" else source
        lesson_id = lesson["lesson_id"]
        if lesson["stage"] not in STAGES:
            fail(f"{lesson_id} has an unknown stage {lesson['stage']!r}")
        if lesson.get("is_official_ielts") is not False:
            fail(f"{lesson_id} is not marked as non-official practice")
        answer = answers.get(lesson_id)
        if not answer or answer["source_content_sha256"] != lesson["content_sha256"]:
            fail(f"{lesson_id} answers are missing or were written for a different lesson version")
        drill_ids = [drill["id"] for drill in lesson["drills"]]
        if [drill["id"] for drill in answer["drills"]] != drill_ids:
            fail(f"{lesson_id} answer drills do not match the lesson drills")
        essay = essays.get(lesson_id)
        if essay and essay["source_content_sha256"] != lesson["content_sha256"]:
            fail(f"{lesson_id} model essay was written for a different lesson version")

        where = lesson_id
        public.append({
            "id": lesson_id,
            "pack": lesson["source_pack"],
            "content_sha256": lesson["content_sha256"],
            "stage": lesson["stage"],
            "target_range": lesson["target_range"],
            "question_type": lesson["question_type"],
            "topic": lesson["topic"],
            "prompt": lesson["prompt"],
            "minutes": lesson["estimated_minutes"],
            "goal_vi": vietnamese(lesson["learning_goal_vi"], f"{where} learning_goal_vi"),
            "target_vi": vietnamese(lesson["completion_target_vi"], f"{where} completion_target_vi"),
            "steps": [{
                "title_vi": step_title(step["title_vi"], where),
                "instruction_vi": vietnamese(step["instruction_vi"], f"{where} step"),
                "sample_en": step["sample_en"],
            } for step in lesson["guided_steps"]],
            "vocabulary": [{
                "phrase_en": word["phrase_en"],
                "meaning_vi": vietnamese(word["meaning_vi"], f"{where} vocabulary {word['phrase_en']}"),
            } for word in lesson["vocabulary"]],
            "drills": [{
                "id": drill["id"],
                "mode": drill["mode"],
                "question_vi": vietnamese(drill["question_vi"], f"{where} drill {drill['id']}"),
                "hint_vi": vietnamese(drill["hint_vi"], f"{where} drill hint {drill['id']}"),
            } for drill in lesson["drills"]],
            "has_model_essay": bool(essay),
        })
        private[lesson_id] = {
            "content_sha256": lesson["content_sha256"],
            "drills": {drill["id"]: {"answer_guide": drill["answer_guide"], "explanation_vi": drill["explanation_vi"]} for drill in answer["drills"]},
            **({"model_essay": {
                "title": essay["title"],
                "essay": essay["essay"],
                "word_count": essay["word_count_approx"],
                "explanation_vi": essay["guided_explanation_vi"],
                "outline_vi": essay["outline_note_vi"],
            }} if essay else {}),
        }

    order = {stage: index for index, stage in enumerate(STAGES)}
    public.sort(key=lambda item: (order[item["stage"]], item["pack"], item["id"]))
    source = {"package": "IELTS_Task2_M123", "feeds": FEEDS}
    return {"source": source, "lessons": public}, {"source": source, "lessons": private}


def check_existing(lessons: dict, allow_update: bool) -> None:
    path = OUT_DIR / "lessons.json"
    if not path.exists():
        return
    previous = {item["id"]: item["content_sha256"] for item in json.loads(path.read_text(encoding="utf-8"))["lessons"]}
    changed = [item["id"] for item in lessons["lessons"] if item["id"] in previous and previous[item["id"]] != item["content_sha256"]]
    if changed and not allow_update:
        fail(f"these lessons changed since the last import: {', '.join(changed)} (review, then pass --allow-update)")


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("package", type=Path, help="the extracted IELTS_Task2_M123 folder")
    parser.add_argument("--allow-update", action="store_true", help="accept lessons whose source hash changed")
    args = parser.parse_args()

    verify_manifest(args.package)
    lessons, answers = build(args.package)
    check_existing(lessons, args.allow_update)
    OUT_DIR.mkdir(parents=True, exist_ok=True)
    for name, data in (("lessons.json", lessons), ("answers.json", answers)):
        (OUT_DIR / name).write_text(json.dumps(data, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    drills = sum(len(item["drills"]) for item in lessons["lessons"])
    essays = sum(1 for item in answers["lessons"].values() if "model_essay" in item)
    print(f"Imported {len(lessons['lessons'])} lessons, {drills} drills, {essays} model essays.")


if __name__ == "__main__":
    main()
