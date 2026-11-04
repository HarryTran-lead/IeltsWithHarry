"""Build the owner-supplied Book 2 archive into deployable Learn data.

Usage: python scripts/build-book-2.py C:/path/to/BOOK2_ALL_8_UNITS.zip [--publish U07]

--publish Uxx includes a unit marked is_published=false after the product owner has approved it.

Units whose unit.json says is_published=false are left out of the catalog and their old files removed.
Each unit's m05_writing_speaking becomes two "Luyện thêm" lessons after the unit, with its scripted coach.
Unit 6 Speaking L04 is shown as the three micro-lessons its u06_speaking_refactor recommends (same question IDs).
"""
import json
import re
import shutil
import sys
import zipfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
ARCHIVE = Path(sys.argv[1]) if len(sys.argv) > 1 else None
APPROVED = {sys.argv[index + 1].upper() for index, arg in enumerate(sys.argv[:-1]) if arg == "--publish"}
if not ARCHIVE or not ARCHIVE.is_file():
    raise SystemExit("Pass BOOK2_ALL_8_UNITS.zip")

CATALOG = ROOT / "src/data/book2/catalog.json"
LESSONS = ROOT / "content/book2/lessons"
MEDIA = ROOT / "public/book-2/media"
SKILLS = {"R": "Reading", "W": "Writing", "L": "Listening", "S": "Speaking"}

def save_json(path, value):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n", encoding="utf-8")

def lesson_content(code, lesson_id, lesson, passages, audios, visuals, exercises, coach=None, teaching=None):
    content = {"type": "book2", "book_id": "BOOK_2", "source_id": lesson_id, "unit_id": code, "lesson": {"title": lesson["title"], "duration_minutes": lesson.get("duration_minutes"), "learning_objectives": lesson.get("learning_objectives") or ([{"en": lesson["objective"], "vi": ""}] if lesson.get("objective") else []), "theory": lesson.get("theory", []), "vocabulary": lesson.get("vocabulary", []), "grammar": lesson.get("grammar", []), "strategies": lesson.get("strategies", []), "common_mistakes": lesson.get("common_mistakes", []), "mini_review": lesson.get("mini_review", []), "rubric": lesson.get("rubric")}, "passages": passages, "audios": audios, "visuals": visuals, "exercises": exercises}
    if coach:
        content["coach"] = coach
    if teaching:
        content["teaching"] = teaching
    return content

def catalog_lesson(unit, lesson_id, slug, title, skill, summary, order, related, supplement=False):
    entry = {"id": lesson_id, "unit_id": unit["id"], "slug": slug, "title": title, "skill": skill, "summary": summary, "sort_order": order, "question_count": len(related), "objective_count": sum(item["answer"]["kind"] == "objective" for item in related)}
    if supplement:
        entry["supplement"] = True
    return entry

def text(*values):
    """The first non-empty string among the values."""
    for value in values:
        if isinstance(value, str) and value.strip():
            return value.strip()
    return ""

def clean(rows):
    """Drop rows whose every value is empty, and keys with empty values."""
    result = []
    for row in rows:
        row = {key: value for key, value in row.items() if value not in ("", None, [], {})}
        if any(isinstance(value, str) for value in row.values()):
            result.append(row)
    return result

def teaching_layer(sidecar, media, data_visuals):
    """
    The C09 self_study_v3 sidecar holds learner-facing teaching in several skill-specific shapes
    (c02 reading, c03 listening, c04/c05 writing, c06/part 2-3 speaking). This keeps one common shape and
    leaves out editorial metadata, statuses and teacher-only material.
    """
    theory = sidecar.get("theory") or {}
    reading = sidecar.get("c02_reading_deep_dive") or {}
    listening = sidecar.get("c03_listening_deep_dive") or {}
    task1 = sidecar.get("c04_task1") or {}
    part1 = sidecar.get("c06_part1_revision") or {}
    part23 = sidecar.get("speaking_part2_and_part3") or {}

    concepts = [{"title": text(item.get("title")), "text": text(item.get("explanation_vi"))} for item in theory.get("deep_dive_sections", [])]
    concepts += [{"title": text(item.get("heading")), "text": text(item.get("explanation_vi")), "can_do": text(item.get("what_learner_can_do"))} for item in task1.get("theory", [])]
    explained = listening.get("theory_explained_vi") or {}
    for key, title in (("what_vi", "Đây là gì?"), ("why_vi", "Vì sao cần?"), ("how_vi", "Làm thế nào?"), ("limits_vi", "Giới hạn")):
        if text(explained.get(key)):
            concepts.append({"title": title, "text": text(explained.get(key))})

    examples = []
    for item in reading.get("worked_examples", []):
        examples.append({"question": text(item.get("task_en")), "source": text(item.get("source_en")), "answer": text(item.get("answer_en")), "evidence": text(item.get("evidence_exact_en")), "why": text(item.get("reasoning_vi")), "trap": text(item.get("why_common_wrong_answer_fails_vi"))})
    for item in listening.get("worked_microcases", []):
        examples.append({"question": text(item.get("question_en")), "predict": text(item.get("prediction_prompt_vi")), "source": text(item.get("source_script_en")), "answer": text(item.get("answer_en")), "evidence": text(item.get("source_evidence_verbatim")), "why": text(item.get("explanation_vi")), "trap": text(item.get("why_distractor_is_wrong_vi"))})
    for item in task1.get("worked_examples", []):
        examples.append({"question": text(item.get("question_en")), "source": text(item.get("observed_data")), "answer": text(item.get("teacher_answer_en")), "why": text(item.get("analysis_vi")), "try": text(item.get("try_it_vi"))})
    for item in part1.get("prelearn_guided_examples", []):
        examples.append({"question": text(item.get("question_en")), "answer": text(item.get("illustrative_answer_en")), "pattern": text(item.get("pattern_en")), "why": text(item.get("annotation_vi"))})
    for item in part23.get("part3_worked_questions", []):
        examples.append({"question": text(item.get("question")), "pattern": text(item.get("structure")), "answer": text(item.get("model_en")), "why": text(item.get("notes_vi"))})
    if not examples:
        for item in sidecar.get("worked_examples", []):
            examples.append({"question": text(item.get("question_or_goal_en")), "notice": text(item.get("notice_vi")), "source": text(item.get("source_excerpt")), "answer": text(item.get("worked_answer_en")), "why": text(item.get("why_this_works_vi")), "trap": text(item.get("contrast_or_trap_vi"))})

    tips = [{"when": text(item.get("when_vi")), "do": text(item.get("action_vi")), "why": text(item.get("why_vi"))} for item in reading.get("exam_tips_with_reason", [])]
    tips += [{"when": text(item.get("stage")), "do": text(item.get("action_vi")), "why": text(item.get("why_vi")), "example": text(item.get("concrete_example_vi")), "limit": text(item.get("boundary_vi"))} for item in listening.get("strategies", [])]
    tips += [{"when": text(item.get("when_to_apply_vi")), "do": text(item.get("tip_vi")), "why": text(item.get("why_vi")), "example": text(item.get("example_en"))} for item in task1.get("tips_explained", [])]
    if not tips:
        tips = [{"when": text(item.get("when_to_use_vi")), "do": text(item.get("do_this_vi")), "why": text(item.get("why_it_helps_vi")), "example": text(item.get("worked_example_vi")), "limit": text(item.get("when_not_to_use_vi"))} for item in sidecar.get("strategies_explained", [])]

    mistakes = [{"wrong": text(item.get("incorrect")), "right": text(item.get("correction")), "why": text(item.get("because_vi")), "check": text(item.get("student_self_check_vi"))} for item in sidecar.get("common_mistakes_explained", [])]
    for item in listening.get("common_mistakes", []) + task1.get("common_mistakes", []) + part1.get("common_mistakes", []):
        mistakes.append({"wrong": text(item.get("wrong"), item.get("wrong_en")), "right": text(item.get("correct"), item.get("correct_en")), "why": text(item.get("why_vi"), item.get("explanation_vi")), "check": text(item.get("repair_drill_vi"))})

    vocabulary = [{"term": text(item.get("term"), item.get("term_en")), "pos": text(item.get("part_of_speech"), item.get("pos")), "meaning": text(item.get("meaning_vi")), "example": text(item.get("example_en"), item.get("speaking_or_writing_example_en")), "example_vi": text(item.get("example_vi"))} for item in sidecar.get("vocabulary_and_collocations", []) + task1.get("vocabulary_and_collocations", []) + part1.get("topic_phrase_bank", [])]
    seen = set()
    vocabulary = [item for item in vocabulary if item["term"] and not (item["term"].lower() in seen or seen.add(item["term"].lower()))]

    guided = [{"title": text(item.get("title")), "do": text(item.get("learner_instruction_vi")), "feedback": text(item.get("feedback_vi")), "model": text(item.get("worked_feedback_en"))} for item in task1.get("guided_ladder", [])]
    guided = guided or [{"do": text(item.get("prompt_vi")), "pass": text(item.get("pass_condition"))} for item in reading.get("guided_practice", [])]
    guided = guided or [{"do": text(item.get("instruction_vi")), "pass": text(item.get("expected_evidence"))} for item in listening.get("guided_practice", [])]
    guided = guided or [{"do": text(item.get("instruction_vi")), "hint": text(item.get("contextual_prompt_vi"))} for item in sidecar.get("guided_practice_steps", [])]

    coach = [{"trigger": text(item.get("trigger") if isinstance(item.get("trigger"), str) else (item.get("trigger") or {}).get("event")), "stage": text(item.get("stage")), "message": text(item.get("message_vi"))} for item in (sidecar.get("c08_coach_v3") or {}).get("events", [])]
    coach += [{"trigger": text(item.get("trigger")), "message": text(item.get("message_vi"))} for item in reading.get("coach_reactions", []) + listening.get("contextual_coach", []) + task1.get("interactive_learning_coach", [])]
    coach += [{"trigger": text(item.get("trigger")), "message": text(item.get("message_vi")), "example": text(item.get("micro_example"))} for item in (sidecar.get("interactive_learning_coach") or {}).get("contextual_events", [])]

    visual = None
    task1_visual = task1.get("visual") or {}
    if task1_visual.get("asset"):
        data = data_visuals.get(task1_visual.get("visual_data_id"), {})
        visual = {"id": task1_visual.get("visual_data_id"), "title": data.get("title") or text(task1_visual.get("source_label_vi")), "image_url": media.get(task1_visual["asset"], ""), "headers": data.get("headers"), "rows": data.get("rows")}

    review = sidecar.get("review_and_retake") or {}
    layer = {
        "title_vi": text(sidecar.get("title_vi")),
        "outcome": text(sidecar.get("learning_outcome_vi")),
        "why": text(sidecar.get("why_learn_this_vi"), reading.get("why_needed_vi")),
        "overview": text(theory.get("overview_vi")),
        "steps": clean([{"do": text(item.get("action_vi")), "why": text(item.get("why_vi"))} for item in theory.get("numbered_process", [])]),
        "concepts": clean(concepts),
        "boundary": text(theory.get("boundary_and_exception_vi"), reading.get("exam_boundary_vi")),
        "micro_passage": text(reading.get("micro_passage_en")),
        "before_listening": text(listening.get("before_listening_prompt_vi")),
        "visual": visual if visual and (visual["image_url"] or visual.get("rows")) else None,
        "examples": clean(examples),
        "tips": clean(tips),
        "mistakes": clean(mistakes),
        "vocabulary": clean(vocabulary),
        "guided": clean(guided),
        "note_map": clean([{"label": text(item.get("label")), "note": text(item.get("example_note")), "sentence": text(item.get("sample_sentence"))} for item in part23.get("note_map", [])]),
        "self_check": [value for value in task1.get("rubric_self_check_vi", []) + part1.get("self_check_rubric_vi", []) if isinstance(value, str)],
        "coach": clean(coach),
        "review_days": [day for day in review.get("spaced_review_schedule_suggestion_days", []) if isinstance(day, int)],
    }
    # The package often repeats the same sentence as "why" and as the theory overview.
    if layer["overview"] == layer["why"]:
        layer["overview"] = ""
    return {key: value for key, value in layer.items() if value not in ("", None, [], {})}

def supplement_lessons(code, unit, supplement, start_order):
    """Writing pilot task and Speaking Part 2 cue card from m05_writing_speaking, as open, self-assessed lessons."""
    built = []
    rubrics = supplement.get("assessment_rubrics", {})
    coach = supplement.get("coach_script", {})
    task = supplement.get("pilot_task")
    if task:
        data = task.get("data_source") or {}
        visual_id = f"{task['id']}-DATA"
        visuals = [{"id": visual_id, "title": "Số liệu của đề", "headers": data["columns"], "rows": data["rows"], "image_url": ""}] if data.get("columns") else []
        item = {"book_id": "BOOK_2", "unit_id": code, "skill": "W", "lesson_id": task["id"], "exercise_id": f"{task['id']}-E", "question_id": f"{task['id']}-Q001", "item_type": "open_writing", "prompt_en": f"{task['prompt_en']} Write at least {task.get('target_min_words', 150)} words.", "prompt_vi": task.get("focus", ""), "options": [], "answer": {"kind": "self_assessment", "accepted": [], "model_en": task.get("model_en", ""), "model_vi": ""}, "explanation_vi": "Bài mẫu minh họa mức 5.5–6.0, chưa được chấm band độc lập. Hãy tự sửa ít nhất hai chỗ trước khi xem.", **({"data_id": visual_id} if visuals else {})}
        criteria = rubrics.get("rubric_writing", {}).get("task2" if task.get("task_type") == "task2" else "task1", [])
        lesson = {"title": f"Luyện thêm · Writing {'Task 2' if task.get('task_type') == 'task2' else 'Task 1'}", "duration_minutes": 40 if task.get("task_type") == "task2" else 25, "learning_objectives": [{"vi": task.get("focus", ""), "en": ""}], "strategies": [{"topic": f"Bước {index + 1}", "vi": step} for index, step in enumerate(task.get("scaffold", {}).get("guided", []))], "mini_review": [{"vi": text} for text in criteria], "rubric": {"criteria": criteria}}
        slug = task["id"].lower()
        exercises = [{"id": item["exercise_id"], "title": "Bài viết hoàn chỉnh", "instruction": {"vi": task.get("scaffold", {}).get("mastery", ""), "en": ""}, "questions": [item]}]
        save_json(LESSONS / f"{slug}.json", lesson_content(code, task["id"], lesson, [], [], visuals, exercises, {"mode": "writing", "phases": coach.get("writing", [])}))
        built.append(catalog_lesson(unit, task["id"], slug, lesson["title"], "Writing", task.get("focus", ""), start_order, [item], True))
    cue = supplement.get("speaking_part2")
    if cue:
        bullets = "; ".join(cue.get("bullet_points", []))
        item = {"book_id": "BOOK_2", "unit_id": code, "skill": "S", "lesson_id": cue["id"], "exercise_id": f"{cue['id']}-E", "question_id": f"{cue['id']}-Q001", "item_type": "open_speaking", "prompt_en": f"{cue['cue_card_en']} You should say: {bullets}.", "prompt_vi": "Part 2: chuẩn bị 60 giây, nói tối đa 2 phút.", "options": [], "answer": {"kind": "self_assessment", "accepted": [], "model_en": cue.get("model_en", ""), "model_vi": ""}, "explanation_vi": "Mẫu chỉ để tham khảo, không bắt buộc học thuộc. Đối chiếu bốn tiêu chí nói."}
        criteria = rubrics.get("rubric_speaking", [])
        lesson = {"title": "Luyện thêm · Speaking Part 2", "duration_minutes": 15, "learning_objectives": [{"vi": "Nói 1–2 phút theo cue card, có ví dụ cụ thể và tự đánh giá theo bốn tiêu chí.", "en": ""}], "strategies": [{"topic": f"Bước {index + 1}", "vi": step} for index, step in enumerate(cue.get("scaffold", []))], "mini_review": [{"vi": text} for text in criteria], "rubric": {"criteria": criteria}}
        slug = cue["id"].lower()
        exercises = [{"id": item["exercise_id"], "title": "Part 2 cue card", "instruction": {"vi": "Chuẩn bị 1 phút rồi nói 1–2 phút; ghi âm và tự nghe lại.", "en": ""}, "questions": [item]}]
        save_json(LESSONS / f"{slug}.json", lesson_content(code, cue["id"], lesson, [], [], [], exercises, {"mode": "speaking", "phases": coach.get("speaking", [])}))
        built.append(catalog_lesson(unit, cue["id"], slug, lesson["title"], "Speaking", "Part 2 cue card có chuẩn bị, ghi âm và tự đánh giá", start_order + 1, [item], True))
    return built

with zipfile.ZipFile(ARCHIVE) as archive:
    manifest = json.loads(archive.read("BOOK_2/book_manifest.json"))
    if manifest["book_id"] != "BOOK_2" or manifest["total_units"] != 8:
        raise SystemExit("Unexpected Book 2 manifest")
    if sum(item["questions"] for item in manifest["items"]) != manifest["total_questions"]:
        raise SystemExit("Manifest question counts do not add up")
    # The learner-facing course title is edited in the catalog, so a rebuild keeps it.
    title = json.loads(CATALOG.read_text(encoding="utf-8")).get("title") if CATALOG.exists() else None
    course = {"id": "book2-course", "slug": "english-skill-lab-book-2", "title": title or "English Skill Lab · Book 2 (5.0–6.0)", "description": "", "stage_id": "ielts-builder", "units": []}
    total = 0
    hidden = []
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
        # Some open Speaking items carry their item type in `options` ("open_speaking"); the player expects a list.
        for item in items:
            if not isinstance(item.get("options"), list):
                item["options"] = []
        total += len(items)
        # An unpublished unit must not stay reachable through old lesson or media files.
        if source.get("is_published") is False and code not in APPROVED:
            hidden.append(code)
            for old in LESSONS.glob(f"b2-{code.lower()}-*.json"):
                old.unlink()
            shutil.rmtree(MEDIA / code, ignore_errors=True)
            print(f"{code}: not published ({source.get('publication_status', 'is_published=false')}), left out")
            continue
        unit = {"id": f"book2-{code}", "course_id": "book2-course", "slug": f"book2-{code.lower()}", "title": f"Unit {unit_index} · {source['title']['en']}", "sort_order": unit_index, "lessons": []}
        media = {}
        for member in archive.namelist():
            if member.startswith(base + "audio/") or member.startswith(base + "assets/"):
                relative = member[len(base):]
                if member.endswith("/") or not re.fullmatch(r"(?:audio|assets)/(?:[A-Za-z0-9_.-]+/)*[A-Za-z0-9_.-]+", relative) or ".." in relative:
                    continue
                target = MEDIA / code / relative
                target.parent.mkdir(parents=True, exist_ok=True)
                target.write_bytes(archive.read(member))
                media[relative] = f"/book-2/media/{code}/{relative}"
        supplement = source.get("m05_writing_speaking") or {}
        refactor = supplement.get("u06_speaking_refactor") or {}
        lesson_index = 0
        for skill, group in source["skills"].items():
            if skill not in SKILLS:
                raise SystemExit(f"{code}: unknown skill {skill}")
            for lesson in group if isinstance(group, list) else group["lessons"]:
                lesson_id = lesson.get("id") or lesson.get("lesson_id")
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
                summary = (lesson.get("learning_objectives") or [{}])[0].get("vi") or lesson.get("objective") or ""
                # C09 teaching sidecar: units/Uxx/self_study_v3/<skill>-Lnn.json, named after the end of the lesson ID.
                sidecar_name = f"{base}self_study_v3/{lesson_id.split('-', 2)[2]}.json"
                teaching = teaching_layer(json.loads(archive.read(sidecar_name)), media, source.get("data_visuals", {})) if sidecar_name in archive.namelist() else None
                parts = refactor.get("recommended_micro_lessons") if refactor.get("original_lesson_id") == lesson_id else None
                if parts:
                    # Same exercises and question IDs, shown on three shorter screens; the old slug is kept as legacy state.
                    if sorted(ref for part in parts for ref in part["exercise_ids"]) != sorted(exercise["id"] for exercise in exercises):
                        raise SystemExit(f"{code}: refactor does not cover {lesson_id}")
                    (LESSONS / f"{lesson_id.lower()}.json").unlink(missing_ok=True)
                    for part in parts:
                        lesson_index += 1
                        chosen = [exercise for exercise in exercises if exercise["id"] in part["exercise_ids"]]
                        part_items = [item for exercise in chosen for item in exercise["questions"]]
                        part_lesson = {**lesson, "title": part["title"], "duration_minutes": part.get("recommended_minutes")}
                        part_passages = [value for value in passages if any(item.get("passage_id") == value["id"] for item in part_items)]
                        part_audios = [value for value in audios if any(item.get("audio_id") == value["id"] for item in part_items)]
                        part_visuals = [value for value in visuals if any((item.get("data_id") or item.get("asset_id")) == value["id"] for item in part_items)]
                        save_json(LESSONS / f"{part['id'].lower()}.json", {**lesson_content(code, part["id"], part_lesson, part_passages, part_audios, part_visuals, chosen, teaching=teaching), "legacy_slug": lesson_id.lower()})
                        unit["lessons"].append(catalog_lesson(unit, part["id"], part["id"].lower(), part["title"], SKILLS[skill], summary, lesson_index, part_items))
                    continue
                lesson_index += 1
                save_json(LESSONS / f"{lesson_id.lower()}.json", lesson_content(code, lesson_id, lesson, passages, audios, visuals, exercises, source.get("m06_learning_coach") if skill in ("R", "L") else None, teaching))
                unit["lessons"].append(catalog_lesson(unit, lesson_id, lesson_id.lower(), lesson["title"], SKILLS[skill], summary, lesson_index, related))
        graded = [lesson for lesson in unit["lessons"]]
        if sum(len(exercise["questions"]) for lesson in graded for exercise in json.loads((LESSONS / f"{lesson['slug']}.json").read_text(encoding="utf-8"))["exercises"]) != len(items):
            raise SystemExit(f"{code}: imported question count mismatch")
        unit["lessons"].extend(supplement_lessons(code, unit, supplement, lesson_index + 1))
        course["units"].append(unit)
        print(f"{code}: {len(unit['lessons'])} lessons ({sum(1 for lesson in unit['lessons'] if lesson.get('supplement'))} supplementary), {len(items)} questions, {len(media)} media files")
    if total != manifest["total_questions"]:
        raise SystemExit("Book 2 total mismatch")
    lessons = [lesson for unit in course["units"] for lesson in unit["lessons"]]
    questions = sum(lesson["question_count"] for lesson in lessons if not lesson.get("supplement"))
    course["description"] = f"{len(course['units'])} unit · {len(lessons)} bài · {questions:,} câu luyện Đọc, Nghe, Viết và Nói.".replace(f"{questions:,}", f"{questions:,}".replace(",", "."))
    save_json(CATALOG, course)
    print(f"Built {len(lessons)} lessons and {questions} graded questions; hidden units: {', '.join(hidden) or 'none'}.")
