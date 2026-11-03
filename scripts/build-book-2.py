"""Build the owner-supplied Book 2 archive into deployable Learn data.

Usage: python scripts/build-book-2.py C:/path/to/BOOK_2_FULL.zip
"""
import json
import re
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = Path(sys.argv[1]) if len(sys.argv) > 1 else None
if not ARCHIVE or not ARCHIVE.is_file():
    raise SystemExit("Pass BOOK_2_FULL.zip")

CATALOG = ROOT / "src/data/book2/catalog.json"
LESSONS = ROOT / "public/book-2/lessons"
MEDIA = ROOT / "public/book-2/media"
SKILLS = {"R": "Reading", "W": "Writing", "L": "Listening", "S": "Speaking"}

def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

with zipfile.ZipFile(ARCHIVE) as archive:
    manifest = json.loads(archive.read("BOOK_2/book_manifest.json"))
    if manifest["book_id"] != "BOOK_2" or manifest["total_units"] != 8 or manifest["total_questions"] != 1146:
        raise SystemExit("Unexpected Book 2 manifest")
    course = {"id": "book2-course", "slug": "english-skill-lab-book-2", "title": "English Skill Lab · Book 2 (5.0–6.0)", "description": "8 unit · 124 bài · 1.146 câu luyện Đọc, Nghe, Viết và Nói. Audio đang được rà soát.", "stage_id": "ielts-builder", "units": []}
    total = 0
    for unit_index, code in enumerate(manifest["units"], 1):
        base = f"BOOK_2/units/{code}/"
        source = json.loads(archive.read(base + "unit.json"))
        items = [json.loads(line) for line in archive.read(base + "items.jsonl").decode("utf-8").splitlines() if line.strip()]
        expected = next(item for item in manifest["items"] if item["unit_id"] == code)
        if source["unit_id"] != code or len(items) != expected["questions"]:
            raise SystemExit(f"{code}: count mismatch")
        ids = [item["question_id"] for item in items]
        if len(ids) != len(set(ids)):
            raise SystemExit(f"{code}: duplicate question ID")
        unit = {"id": f"book2-{code}", "course_id": "book2-course", "slug": f"book2-{code.lower()}", "title": f"Unit {unit_index} · {source['title']['en']}", "sort_order": unit_index, "lessons": []}
        media = {}
        for member in archive.namelist():
            if member.startswith(base + "audio/") or member.startswith(base + "assets/"):
                relative = member[len(base):]
                if member.endswith("/") or not re.fullmatch(r"(?:audio|assets)/[A-Za-z0-9_.-]+", relative):
                    continue
                target = MEDIA / code / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.read(member))
                media[relative] = f"/book-2/media/{code}/{relative}"
        lesson_index = 0
        for skill, group in source["skills"].items():
            if skill not in SKILLS:
                raise SystemExit(f"{code}: unknown skill {skill}")
            for lesson in group if isinstance(group, list) else group["lessons"]:
                lesson_index += 1
                lesson_id = lesson.get("id") or lesson.get("lesson_id")
                slug = lesson_id.lower()
                related = [item for item in items if item["lesson_id"] == lesson_id]
                passage_ids = dict.fromkeys(item.get("passage_id") for item in related if item.get("passage_id"))
                audio_ids = dict.fromkeys(item.get("audio_id") for item in related if item.get("audio_id"))
                visual_ids = dict.fromkeys(item.get("data_id") or item.get("asset_id") for item in related if item.get("data_id") or item.get("asset_id"))
                if any(ref not in source["passages"] for ref in passage_ids) or any(ref not in source["audio_tracks"] for ref in audio_ids):
                    raise SystemExit(f"{code}: broken passage or audio reference")
                passages = []
                for ref in passage_ids:
                    value = source["passages"][ref]
                    passages.append({"id": ref, "title": ref, "text": value} if isinstance(value, str) else value)
                audios = []
                for ref in audio_ids:
                    value = source["audio_tracks"][ref]
                    if isinstance(value, str):
                        audios.append({"id": ref, "title": value, "transcript": "", "audio_url": media.get(f"audio/{ref}.mp3", "")})
                    else:
                        audios.append({"id": ref, "title": value.get("title") or ref, "transcript": value.get("transcript", ""), "audio_url": media.get(value.get("file", ""), "")})
                visuals = []
                for ref in visual_ids:
                    value = source["data_visuals"].get(ref, {})
                    visuals.append({**value, "id": ref, "image_url": media.get(f"assets/{ref}.png") or media.get(f"assets/{ref}.svg") or ""})
                raw_exercises = lesson.get("exercises") or [{"id": ref, "title": ref} for ref in dict.fromkeys(item["exercise_id"] for item in related)]
                exercises = [{"id": exercise["id"], "title": exercise.get("title", exercise["id"]), "instruction": exercise.get("instruction"), "questions": [item for item in related if item["exercise_id"] == exercise["id"]]} for exercise in raw_exercises]
                if sum(len(exercise["questions"]) for exercise in exercises) != len(related):
                    raise SystemExit(f"{code}: orphan exercise item in {lesson_id}")
                content = {"type": "book2", "book_id": "BOOK_2", "source_id": lesson_id, "unit_id": code, "lesson": {"title": lesson["title"], "duration_minutes": lesson.get("duration_minutes"), "learning_objectives": lesson.get("learning_objectives") or ([{"en": lesson["objective"], "vi": ""}] if lesson.get("objective") else []), "theory": lesson.get("theory", []), "vocabulary": lesson.get("vocabulary", []), "grammar": lesson.get("grammar", []), "strategies": lesson.get("strategies", []), "common_mistakes": lesson.get("common_mistakes", []), "mini_review": lesson.get("mini_review", []), "rubric": lesson.get("rubric")}, "passages": passages, "audios": audios, "visuals": visuals, "exercises": exercises}
                save_json(LESSONS / f"{slug}.json", content)
                unit["lessons"].append({"id": lesson_id, "unit_id": unit["id"], "slug": slug, "title": lesson["title"], "skill": SKILLS[skill], "summary": (lesson.get("learning_objectives") or [{}])[0].get("vi") or lesson.get("objective") or "", "sort_order": lesson_index, "question_count": len(related), "objective_count": sum(item["answer"]["kind"] == "objective" for item in related)})
        if sum(len(exercise["questions"]) for lesson in unit["lessons"] for exercise in json.loads((LESSONS / f"{lesson['slug']}.json").read_text(encoding="utf-8"))["exercises"]) != len(items):
            raise SystemExit(f"{code}: imported question count mismatch")
        total += len(items)
        course["units"].append(unit)
        print(f"{code}: {len(unit['lessons'])} lessons, {len(items)} questions, {len(media)} media files")
    if total != 1146 or sum(len(unit["lessons"]) for unit in course["units"]) != 124:
        raise SystemExit("Book 2 total mismatch")
    save_json(CATALOG, course)
    print("Built 124 lessons and 1,146 questions in Learn.")
