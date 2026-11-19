"""Build the Speaking Lab data from the M10-L80 curriculum handoff (milestones L36–L79).

Usage (run with -I; the source folder is untrusted data):
    python -I scripts/import-speaking-lab.py <L80 folder> <private output folder>

<L80 folder> holds manifest/ and milestones/ as expanded from
IELTS_Speaking_M10_L80_Final_Curriculum_Import_Handoff_Pack.zip. Every source file is checked against the
SHA-256 in manifest/import_routing_DRY_RUN_ONLY.csv before it is read.

Writes two files:
  content/speaking-lab/catalog.json       public: titles, skills, task shapes. No question text, tips or models.
  <private>/speaking-lab-private.json     server-only: questions, guides, coaching and models. Never commit it;
                                          the app reads it from SPEAKING_LAB_DIR or the SPEAKING_LAB_BUCKET bucket.

Phase 1 uses: the 16-skill taxonomy (L48), 16 skill routes and guides (L67), two-stage questions and
after-attempt guides (L65), repair cards (L41) and the 24 Part 1/2 topic lessons (L79).
"""
import csv
import hashlib
import json
import sys
from pathlib import Path

REPO = Path(__file__).resolve().parent.parent
CATALOG_OUT = REPO / "content" / "speaking-lab" / "catalog.json"

SOURCES = {
    "taxonomy": "milestones/L48/data/server/skill_taxonomy.json",
    "onboarding": "milestones/L67/data/public/onboarding.json",
    "routes": "milestones/L67/data/public/route_catalog.json",
    "skill_guides": "milestones/L67/data/server/skill_guides_NEW_L67.json",
    "units": "milestones/L65/data/public/skill_consolidation_catalog.json",
    "unit_questions": "milestones/L65/data/server/two_stage_questions_SERVER_ONLY.json",
    "unit_guides": "milestones/L65/data/server/skill_guides_AFTER_ATTEMPT.json",
    "repairs": "milestones/L41/data/public/repair_catalog.json",
    "topics": "milestones/L79/data/public/lesson_catalog_METADATA_ONLY.json",
    "topic_questions": "milestones/L79/data/server/questions_SERVER_ONLY.json",
    "topic_guidance": "milestones/L79/data/server/guidance_AFTER_CURRENT_ATTEMPT.json",
    "topic_models": "milestones/L79/data/server/models_AFTER_LESSON_COMPLETION.json",
}

CRITERIA = {
    "fluency_coherence": "FC",
    "lexical_resource": "LR",
    "grammar_range_accuracy": "GR",
    "pronunciation": "PR",
}

# Learner-facing Vietnamese names for each task phase.
PHASES = {
    "independent_baseline": ("Nói lần đầu", "Tự trả lời trước khi xem gợi ý."),
    "delayed_independent_transfer": ("Nói câu mới", "Câu hỏi khác, cùng kỹ năng. Nên nói sau vài ngày."),
    "precision_and_condition": ("Nói chính xác hơn", "Giới hạn ý: đúng với ai, khi nào, trong điều kiện nào."),
    "contrast_and_exception": ("Đối chiếu và ngoại lệ", "Nối hai phía bằng but / whereas / although."),
    "targeted_repair": ("Sửa có chủ đích", "Nói lại, tập trung đúng một điểm cần sửa."),
    "unexpected_followup": ("Câu hỏi bất ngờ", "Điều kiện thay đổi: nêu lý do mới, không lặp bài cũ."),
    "unseen_transfer": ("Tình huống mới", "Tình huống liên quan nhưng khác, không nhìn mẫu."),
    "baseline_cue": ("Cue card lần đầu", "Chuẩn bị 1 phút, nói tối đa 2 phút."),
    "chronology_drill": ("Kể theo mốc thời gian", "Bắt đầu, trở ngại, bước ngoặt."),
    "specificity_drill": ("Chi tiết cụ thể", "Một ví dụ thật, có việc làm và kết quả."),
    "unseen_transfer_cue": ("Cue card mới", "Đề liên quan nhưng khác, không nhìn mẫu."),
    "delayed_retest_cue": ("Nói lại sau vài ngày", "Làm lại sau vài ngày để xem mình nhớ được gì."),
}

# Fields that describe the source record, not the lesson; never shown to learners.
DROP = {
    "source_ref", "source_sha256", "source_audit_finding", "requires_teacher_qa", "band_awarded", "official_ielts_content",
    "teacher_verified_band", "after_lesson_completion_only", "after_current_attempt_only", "server_release", "no_scoring",
    "reveal_policy", "reveal_after", "not_a_band_assessment", "not_a_band_score", "automated_score", "ielts_band",
    "content_origin", "range_is_not_assessed_ielts_score", "requires_learner_confirmation", "linked_l40_transfer_id",
    "linked_l37_skill_id", "pronunciation_audio_required", "preview_release", "coaching_release", "model_release",
}


def fail(message):
    sys.exit(f"import-speaking-lab: {message}")


def load_hashes(root):
    path = root / "manifest" / "import_routing_DRY_RUN_ONLY.csv"
    if not path.is_file():
        fail(f"missing {path}")
    with path.open(encoding="utf-8", newline="") as handle:
        return {row["expanded_path"]: row["sha256"] for row in csv.DictReader(handle)}


def read(root, hashes, key):
    rel = SOURCES[key]
    path = root / rel
    if not path.is_file():
        fail(f"missing source file {rel}")
    raw = path.read_bytes()
    expected = hashes.get(rel)
    if not expected:
        fail(f"{rel} is not listed in the L80 routing manifest")
    if hashlib.sha256(raw).hexdigest() != expected:
        fail(f"{rel} does not match its manifest SHA-256; stop and review the source")
    return json.loads(raw.decode("utf-8"))


def clean(value):
    if isinstance(value, dict):
        return {k: clean(v) for k, v in value.items() if k not in DROP and v not in (None, "", [])}
    if isinstance(value, list):
        return [clean(v) for v in value]
    return value


def short_skill(skill_id):
    # SPK-M10L48-SFC01 -> FC01
    return skill_id.rsplit("-S", 1)[-1]


def build(root):
    hashes = load_hashes(root)
    data = {key: read(root, hashes, key) for key in SOURCES}

    skills = []
    for skill in data["taxonomy"]["skills"]:
        skills.append({
            "id": skill["code"],
            "criterion": CRITERIA[skill["criterion"]],
            "title_vi": skill["title_vi"],
            "title_en": skill["title_en"],
            "objective_vi": skill.get("learning_objective_vi", ""),
            "objective_en": skill.get("learning_objective_en", ""),
        })
    skill_codes = {s["id"] for s in skills}
    if len(skills) != 16:
        fail(f"expected 16 skills, found {len(skills)}")

    guides = {g["route_id"]: g for g in data["skill_guides"]["guides"]}
    units = {u["unit_id"]: u for u in data["units"]["units"]}
    unit_guides = {g["unit_id"]: g for g in data["unit_guides"]["guides"]}
    repairs = {c["card_id"]: c for c in data["repairs"]["cards"]}
    unit_questions = {}
    for q in data["unit_questions"]["questions"]:
        unit_questions.setdefault(q["unit_id"], []).append(q)

    catalog_units = []
    private_units = {}
    guide_by_skill = {}

    for route in data["routes"]["routes"]:
        code = short_skill(route["skill_id"])
        if code not in skill_codes:
            fail(f"route {route['route_id']} names unknown skill {code}")
        unit = units[route["unit_id"]]
        guide = guides[route["route_id"]]
        repair = repairs.get(route["l41_repair_id"])
        questions = sorted(unit_questions.get(route["unit_id"], []), key=lambda q: q["id"])
        if len(questions) != 2:
            fail(f"{route['unit_id']} should have 2 questions, found {len(questions)}")
        unit_id = f"skill-{code}"
        tasks = []
        prompts = {}
        for index, question in enumerate(questions, start=1):
            task_id = f"T{index}"
            label, hint = PHASES[question["stage"]]
            tasks.append({
                "id": task_id, "phase": question["stage"], "label": label, "hint": hint, "part": question["part"],
                "mode": "full_cue" if question["part"] == 2 else "short_spoken_answer",
                "prep_seconds": 60 if question["part"] == 2 else 0,
                "expected_seconds": {1: {"min": 20, "max": 45}, 2: {"min": 85, "max": 120}, 3: {"min": 30, "max": 60}}[question["part"]],
                "gap_days": question.get("suggested_gap_days") or 0,
            })
            instructions = question.get("instructions_vi") or ""
            if question["part"] != 2:
                # The source adds a Part 2 timing note to every question; keep it only where it applies.
                instructions = instructions.split(" Với Part 2:")[0]
            prompts[task_id] = clean({"prompt_en": question["question_en"], "instructions_vi": instructions})
        guide_body = clean({
            "objective_vi": guide.get("learner_objective_vi"),
            "steps_vi": [guide.get("step_1_vi"), guide.get("step_2_vi"), guide.get("step_3_vi")],
            "caution_vi": guide.get("caution_vi"),
            "self_check_vi": guide.get("self_check_vi"),
        })
        guide_by_skill[code] = {"title_vi": guide["title_vi"], **guide_body}
        teach = {"guide": guide_body}
        if repair:
            teach["repair"] = clean({
                "title_vi": repair.get("title_vi"), "title_en": repair.get("title_en"),
                "goal_vi": repair.get("learner_goal_vi"), "goal_en": repair.get("learner_goal_en"),
                "steps": [{"label": s.get("label"), "en": s.get("en"), "vi": s.get("vi")} for s in repair.get("teach_steps", [])],
                "ideas_vi": repair.get("hints", {}).get("ideas_vi"),
                "useful_language_en": repair.get("hints", {}).get("useful_language_en"),
                "self_check_vi": repair.get("self_check_vi"),
            })
        after_guide = unit_guides.get(route["unit_id"], {})
        coaching = clean({
            "focus_vi": after_guide.get("skill_focus_vi"), "focus_en": after_guide.get("skill_focus_en"),
            "weak_en": after_guide.get("weak_answer_en"), "improved_en": after_guide.get("improved_example_en"),
            "analysis_vi": after_guide.get("analysis_vi"),
            "reflection_vi": after_guide.get("suggested_reflection_vi"), "reflection_en": after_guide.get("suggested_reflection_en"),
        })
        catalog_units.append({
            "id": unit_id, "kind": "skill", "part": route["part"], "criterion": CRITERIA[route["criterion"]],
            "skills": [code], "title_vi": route["title_vi"], "title_en": route["title_en"],
            "topic_en": route.get("topic_en", ""), "target_vi": unit.get("learning_target_vi") or route.get("skill_target_vi", ""),
            "tasks": tasks,
        })
        private_units[unit_id] = {
            "teach": teach,
            "prompts": prompts,
            # Released after the first spoken attempt: a weak answer, a better one and why.
            "after_first": {"coaching": coaching} if coaching else {},
            "after_task": {},
            "after_all": {},
        }

    questions_by_lesson = {}
    for q in data["topic_questions"]["questions"]:
        questions_by_lesson.setdefault(q["lesson_id"], []).append(q)
    tips = {g["prompt_id"]: g for g in data["topic_guidance"]["guides"] if "prompt_id" in g}
    cards = {g["lesson_id"]: g["content"] for g in data["topic_guidance"]["guides"] if g.get("type") == "bilingual_teaching_card"}
    models = {m["lesson_id"]: m for m in data["topic_models"]["models"]}

    for index, lesson in enumerate(data["topics"]["lessons"], start=1):
        lid = lesson["lesson_id"]
        unit_id = f"topic-{lid.rsplit('-', 1)[-1]}"
        questions = sorted(questions_by_lesson.get(lid, []), key=lambda q: q["prompt_id"])
        if [q["phase"] for q in questions] != lesson["phases"]:
            fail(f"{lid} questions do not follow its phases")
        codes = [short_skill(s) for s in lesson["skills_l48"]]
        if not set(codes) <= skill_codes:
            fail(f"{lid} names unknown skills {codes}")
        tasks, prompts, after_task = [], {}, {}
        for number, question in enumerate(questions, start=1):
            task_id = f"T{number}"
            label, hint = PHASES[question["phase"]]
            tasks.append({
                "id": task_id, "phase": question["phase"], "label": label, "hint": hint, "part": question["part"],
                "mode": question["mode"], "prep_seconds": question.get("prep_seconds", 0),
                "expected_seconds": question.get("expected_seconds") or {"min": 20, "max": 45},
                "gap_days": 3 if question["phase"] == "delayed_retest_cue" else 0,
            })
            prompts[task_id] = clean({"prompt_en": question["prompt_en"], "cue_bullets": question.get("cue_bullets")})
            tip = tips.get(question["prompt_id"])
            if tip:
                after_task[task_id] = clean({k: tip.get(k) for k in ("tip_vi", "tip_en", "focus_collocation_en", "error_to_avoid_en")})
        card = cards.get(lid)
        model = models.get(lid)
        catalog_units.append({
            "id": unit_id, "kind": "topic", "part": lesson["part"], "skills": codes,
            "title_vi": lesson["topic_vi"], "title_en": lesson["topic_en"], "level": lesson.get("stage", ""),
            "order": index, "tasks": tasks,
        })
        private_units[unit_id] = {
            "teach": {"skills": [{"id": code, **guide_by_skill[code]} for code in codes if code in guide_by_skill]},
            "prompts": prompts,
            "after_first": {"card": clean(card)} if card else {},
            "after_task": after_task,
            "after_all": {"model": clean({k: model.get(k) for k in ("model_for_phase", "model_en", "model_purpose_vi", "critical_improvement_en", "critical_improvement_vi", "self_review_questions_vi")})} if model else {},
        }

    levels = [{"id": level["id"], "label": level["label"], "guidance_vi": level["guidance"]} for level in data["onboarding"]["target_levels"]]
    catalog = {
        "source": {"package": "IELTS_Speaking_M10_L80", "milestones": ["L41", "L48", "L65", "L67", "L79"], "note_vi": "Tài liệu luyện tập do đội ngũ biên soạn, chưa được giáo viên duyệt toàn bộ; không quy đổi sang band."},
        "levels": levels,
        "skills": skills,
        "units": catalog_units,
    }
    private = {"version": 1, "units": private_units}

    # The public catalog must never carry question text, tips or models.
    public_text = json.dumps(catalog, ensure_ascii=False)
    for unit in private_units.values():
        for prompt in unit["prompts"].values():
            if prompt["prompt_en"] in public_text:
                fail(f"question text leaked into the catalog: {prompt['prompt_en'][:60]}")
    return catalog, private


def main():
    if len(sys.argv) != 3:
        fail("usage: python -I scripts/import-speaking-lab.py <L80 folder> <private output folder>")
    root = Path(sys.argv[1]).resolve()
    out = Path(sys.argv[2]).resolve()
    if REPO in out.parents or out == REPO:
        fail("the private output folder must be outside the repository")
    catalog, private = build(root)
    CATALOG_OUT.parent.mkdir(parents=True, exist_ok=True)
    CATALOG_OUT.write_text(json.dumps(catalog, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    out.mkdir(parents=True, exist_ok=True)
    (out / "speaking-lab-private.json").write_text(json.dumps(private, ensure_ascii=False), encoding="utf-8")
    kinds = {}
    for unit in catalog["units"]:
        kinds[unit["kind"]] = kinds.get(unit["kind"], 0) + 1
    tasks = sum(len(unit["tasks"]) for unit in catalog["units"])
    print(f"catalog: {len(catalog['skills'])} skills, units {kinds}, {tasks} spoken tasks -> {CATALOG_OUT.relative_to(REPO)}")
    print(f"private: {len(private['units'])} units -> {out / 'speaking-lab-private.json'}")


if __name__ == "__main__":
    main()
