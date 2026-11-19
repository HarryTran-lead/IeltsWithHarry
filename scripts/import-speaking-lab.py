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
    # Phase 2: Part 3 series (L57–L60) and pronunciation (L39 + L40 transfer).
    "l57_lessons": "milestones/L57/data/public/lesson_catalog.json",
    "l57_moves": "milestones/L57/data/public/learning_moves_EN_VI.json",
    "l57_questions": "milestones/L57/data/server/questions_SERVER_ONLY.json",
    "l57_coaching": "milestones/L57/data/server/coaching_AFTER_ATTEMPT_EN_VI.json",
    "l57_models": "milestones/L57/data/server/models_AFTER_ATTEMPT_ONLY.json",
    "l58_lessons": "milestones/L58/data/public/lesson_catalog.json",
    "l58_moves": "milestones/L58/data/public/learning_moves_EN_VI.json",
    "l58_questions": "milestones/L58/data/server/questions_SERVER_ONLY.json",
    "l58_coaching": "milestones/L58/data/server/coaching_AFTER_ATTEMPT_EN_VI.json",
    "l58_models": "milestones/L58/data/server/models_AFTER_COMPLETION_ONLY.json",
    "l58_labs": "milestones/L58/data/server/fallacy_labs_AFTER_COMPLETION_ONLY.json",
    "l59_lessons": "milestones/L59/data/public/lesson_catalog.json",
    "l59_phases": "milestones/L59/data/public/phase_guide_EN_VI.json",
    "l59_questions": "milestones/L59/data/server/questions_SERVER_ONLY.json",
    "l59_hints": "milestones/L59/data/server/hints_AFTER_CURRENT_ATTEMPT_ONLY.json",
    "l59_models": "milestones/L59/data/server/models_AFTER_COMPLETION_ONLY.json",
    "l60_lessons": "milestones/L60/data/public/learner_catalog.json",
    "l60_phases": "milestones/L60/data/public/phase_guide_EN_VI.json",
    "l60_strategies": "milestones/L60/data/public/eight_repair_strategies_EN_VI.json",
    "l60_questions": "milestones/L60/data/server/questions_SERVER_ONLY.json",
    "l60_guidance": "milestones/L60/data/server/guidance_AFTER_ATTEMPT.json",
    "l60_models": "milestones/L60/data/server/models_AFTER_COMPLETION.json",
    "pron_modules": "milestones/L39/data/public/modules.json",
    "pron_lessons": "milestones/L39/data/public/lessons.json",
    "pron_items": "milestones/L39/data/public/listening_items.json",
    "pron_key": "milestones/L39/data/internal/listening_answer_key.json",
    "pron_transfers": "milestones/L40/data/public/pronunciation_transfer.json",
    # Phase 3: eight full mock tests (L61 M01–M04, L63 M01–M04).
    "l61_catalog": "milestones/L61/data/public/learner_catalog.json",
    "l61_prompts": "milestones/L61/data/server/prompts_SERVER_ONLY.json",
    "l61_debriefs": "milestones/L61/data/server/debrief_AFTER_COMPLETION.json",
    "l61_samples": "milestones/L61/data/server/mock_sample_excerpts_AFTER_COMPLETION.json",
    "l63_catalog": "milestones/L63/data/public/catalog.json",
    "l63_questions": "milestones/L63/data/server/new_mock_questions_SERVER_ONLY.json",
    "l63_coaching": "milestones/L63/data/server/after_attempt_coaching_SERVER_ONLY.json",
}

L61_MOCK_TITLES_VI = {
    "SPK-M10L61-M01": "Không gian chung và thay đổi ở khu phố",
    "SPK-M10L61-M02": "Cách học và công nghệ hữu ích",
    "SPK-M10L61-M03": "Giao thông và thói quen thay đổi",
    "SPK-M10L61-M04": "Hợp tác và những quyết định khó",
}

SERIES = [
    {"id": "L57", "title_vi": "Lập luận Part 3", "about_vi": "Quan điểm có giới hạn, chuỗi nguyên nhân, cân nhắc, phản biện."},
    {"id": "L58", "title_vi": "Tư duy phản biện", "about_vi": "Bằng chứng, giả định ẩn, nhân quả, hiểu đúng ý đối lập, mức độ chắc chắn."},
    {"id": "L59", "title_vi": "Diễn đạt chính xác", "about_vi": "Đúng nghĩa, diễn đạt lại, kết hợp từ, câu phức, quan điểm có giới hạn."},
    {"id": "L60", "title_vi": "Sửa lỗi khi đang nói", "about_vi": "Bí từ thì diễn giải, sửa một lỗi rồi đi tiếp, xử lý câu hỏi đổi hướng."},
]

# Vietnamese names for phases whose source only names them in English.
PHASE_VI = {
    "evidence_quality": "Chất lượng bằng chứng", "hidden_assumption": "Giả định ẩn", "causality": "Nguyên nhân – kết quả",
    "steelman": "Hiểu đúng ý đối lập", "tradeoff": "Cân nhắc được – mất", "uncertainty": "Mức độ chắc chắn",
    "meaning_precision": "Nghĩa chính xác", "faithful_paraphrase": "Diễn đạt lại đúng ý", "collocation_register": "Kết hợp từ & văn phong",
    "complex_clause_control": "Câu phức có kiểm soát", "stance_qualification": "Quan điểm có giới hạn",
    "baseline": "Nói lần đầu", "lexical_rescue": "Cứu từ khi bí", "grammar_repair": "Sửa ngữ pháp một lần", "followup": "Câu hỏi đổi hướng",
    "unseen_transfer": "Tình huống mới",
}

# The Part 1/2 lessons of L60 have English titles only.
L60_TITLES_VI = {
    "Daily independence": "Tự lập hằng ngày", "Neighbours and routines": "Hàng xóm và nếp sinh hoạt", "Study space": "Góc học tập",
    "Shopping choices": "Lựa chọn khi mua sắm", "Working with others": "Làm việc cùng người khác", "Online news habits": "Thói quen đọc tin online",
    "Public buildings": "Công trình công cộng", "Everyday green choices": "Lựa chọn xanh hằng ngày", "A family decision": "Một quyết định trong gia đình",
    "Helping in a difficult situation": "Giúp đỡ trong tình huống khó", "Learning a hands-on skill": "Học một kỹ năng thực hành",
    "A service problem": "Một lần gặp sự cố dịch vụ", "A group achievement": "Thành công của cả nhóm", "A surprising viewpoint": "Một quan điểm bất ngờ",
    "A local transport change": "Thay đổi giao thông ở địa phương", "Changing a travel habit": "Thay đổi thói quen đi lại",
}

PRON_STAGES = {"guided": "Có hướng dẫn", "independent": "Tự luyện", "mastery": "Vận dụng"}
# Which listening items (L39 LS01–LS24) belong to which pronunciation module, split across its three stages.
PRON_ITEMS = {"VOW": range(1, 9), "CON": range(9, 17), "FIN": range(17, 25)}

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


def load_bundle_hashes(root):
    path = root / "manifest" / "bundle_sha256_manifest.json"
    if not path.is_file():
        fail(f"missing {path}")
    return json.loads(path.read_text(encoding="utf-8"))["files"]


def read_audio(root, bundle, rel):
    path = root / rel
    if not path.is_file():
        fail(f"missing audio {rel}")
    raw = path.read_bytes()
    if bundle.get(rel) != hashlib.sha256(raw).hexdigest():
        fail(f"{rel} does not match its bundle SHA-256")
    return raw


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

    part3_units, part3_private = build_part3(data, skill_codes)
    catalog_units += part3_units
    private_units.update(part3_private)
    pron_units, pron_private, audio = build_pron(data)
    catalog_units += pron_units
    private_units.update(pron_private)
    mock_units, mock_private = build_mocks(data)
    catalog_units += mock_units
    private_units.update(mock_private)

    levels = [{"id": level["id"], "label": level["label"], "guidance_vi": level["guidance"]} for level in data["onboarding"]["target_levels"]]
    catalog = {
        "source": {"package": "IELTS_Speaking_M10_L80", "milestones": ["L39", "L40", "L41", "L48", "L57", "L58", "L59", "L60", "L61", "L63", "L65", "L67", "L79"], "note_vi": "Tài liệu luyện tập do đội ngũ biên soạn, chưa được giáo viên duyệt toàn bộ; không quy đổi sang band."},
        "levels": levels,
        "skills": skills,
        "series": SERIES,
        "modules": [{"code": m["code"], "title_vi": m["title_vi"], "title_en": m["title"], "contrast": m["contrast"]} for m in data["pron_modules"]["modules"]],
        "units": catalog_units,
    }
    private = {"version": 1, "units": private_units}

    # The public catalog must never carry question text, tips or models.
    public_text = json.dumps(catalog, ensure_ascii=False)
    for unit in private_units.values():
        for prompt in unit["prompts"].values():
            if prompt["prompt_en"] in public_text:
                fail(f"question text leaked into the catalog: {prompt['prompt_en'][:60]}")
    return catalog, private, audio


def task_entry(task_id, phase, label, hint, part, mode="short_spoken_answer", prep=0, seconds=None):
    return {
        "id": task_id, "phase": phase, "label": label, "hint": hint, "part": part, "mode": mode, "prep_seconds": prep,
        "expected_seconds": seconds or {1: {"min": 20, "max": 45}, 2: {"min": 85, "max": 120}, 3: {"min": 30, "max": 60}}[part], "gap_days": 0,
    }


def by(items, key):
    out = {}
    for item in items:
        out.setdefault(item[key], []).append(item)
    return out


def build_part3(data, skill_codes):
    """L57–L60: phase-by-phase discussion lessons. Teaching moves are public; questions, tips and models are not."""
    units, private = [], {}
    l57 = {l["lesson_id"]: l for l in data["l57_lessons"]["lessons"]}
    l58 = {l["lesson_id"]: l for l in data["l58_lessons"]["lessons"]}
    l59 = {l["lesson_id"]: l for l in data["l59_lessons"]["lessons"]}

    def topic_vi(lesson):
        # Only L57 has Vietnamese titles; later series point back to it. L57 pairs each topic as variants A and B.
        if lesson.get("topic_vi"):
            return f"{lesson['topic_vi']} ({lesson['variant']})" if lesson.get("variant") else lesson["topic_vi"]
        for key, table in (("source_l57_lesson_id", l57), ("source_l58_lesson_id", l58), ("source_l59_lesson_id", l59)):
            if lesson.get(key) in table:
                return topic_vi(table[lesson[key]])
        return None

    moves57 = {m["phase"]: m for m in data["l57_moves"]["moves"]}
    moves58 = {m["phase"]: m for m in data["l58_moves"]["moves"]}
    phases59 = {m["phase"]: m for m in data["l59_phases"]["phases"]}
    phases60 = {m["code"]: m for m in data["l60_phases"]["phases"]}
    phase_info = {
        "L57": lambda p: (moves57[p]["name_vi"], moves57[p]["instruction_vi"], moves57[p].get("phrases", [])),
        "L58": lambda p: (PHASE_VI[p], moves58[p]["target_vi"], moves58[p].get("starter_phrases", [])),
        "L59": lambda p: (PHASE_VI[p], phases59[p]["objective_vi"], [phases59[p]["general_example_en"]] if phases59[p].get("general_example_en") else []),
        "L60": lambda p: (PHASE_VI[p], phases60[p]["goal_vi"], []),
    }
    strategies = [clean({"title_vi": x.get("title_vi"), "title_en": x.get("title_en"), "guidance_vi": x.get("guidance_vi"), "example_en": x.get("micro_example_en")})
                  for x in data["l60_strategies"]["strategies"]]

    questions = {
        "L57": by([{"id": q["prompt_id"], "lesson": q["lesson_id"], "phase": q["phase"], "text": q["question_en"]} for q in data["l57_questions"]["questions"]], "lesson"),
        "L58": by([{"id": q["prompt_id"], "lesson": q["lesson_id"], "phase": q["phase"], "text": q["question_en"]} for q in data["l58_questions"]["questions"]], "lesson"),
        "L59": by([{"id": q["question_id"], "lesson": q["lesson_id"], "phase": q["phase"], "text": q["question_en"]} for q in data["l59_questions"]["questions"]], "lesson"),
        "L60": by([{"id": q["question_id"], "lesson": q["lesson_id"], "phase": q["phase"], "text": q["prompt_en"], "part": q.get("part"),
                    "cue": (q.get("cue_card") or {}).get("you_should_say")} for q in data["l60_questions"]["questions"]], "lesson"),
    }
    coaching57 = {c["lesson_id"]: c for c in data["l57_coaching"]["lessons"]}
    coaching58 = {c["lesson_id"]: c for c in data["l58_coaching"]["lessons"]}
    hints59 = {h["question_id"]: h for h in data["l59_hints"]["guides"]}
    guidance60 = {g["question_id"]: g for g in data["l60_guidance"]["guides"]}
    models = {series: {m["lesson_id"]: m for m in data[f"{series.lower()}_models"]["models"]} for series in ("L57", "L58", "L59", "L60")}
    labs58 = {c["lesson_id"]: c for c in data["l58_labs"]["cases"]}

    def extras(rows):
        return [row for row in rows if row["text"]]

    def model_for(series, lid):
        m = models[series].get(lid)
        if not m:
            return None
        if series == "L57":
            return clean({"weak_en": m.get("weak_sample"), "improved_en": m.get("revised_sample"), "analysis_vi": m.get("teacher_note_vi")})
        if series == "L58":
            lab = labs58.get(lid, {})
            return clean({"weak_en": m.get("flawed_claim"), "improved_en": m.get("revised_model"), "analysis_vi": m.get("why_flawed_vi"), "extra": extras([
                {"label": "Bằng chứng nên tìm", "text": m.get("evidence_to_seek"), "en": True},
                {"label": "Cách giải thích khác", "text": m.get("competing_explanation"), "en": True},
                {"label": "Phạm vi", "text": m.get("scope_note"), "en": True},
                {"label": "Câu tự hỏi", "text": lab.get("checking_question"), "en": True},
                {"label": "Ghi chú", "text": m.get("teacher_note_vi")},
            ])})
        if series == "L59":
            return clean({"weak_en": m.get("weak_answer"), "improved_en": m.get("improved_answer"), "analysis_vi": m.get("analysis_vi"), "extra": extras([
                {"label": "Phân biệt nghĩa", "text": m.get("lexical_contrast"), "en": True},
                {"label": "Kết hợp từ nên dùng", "text": ", ".join(m.get("recommended_collocations") or []), "en": True},
                {"label": "Lỗi hay gặp", "text": m.get("common_error"), "en": True},
                {"label": "Cách sửa", "text": m.get("repair"), "en": True},
            ])})
        gap = f"{m['word_gap']} → {m['simple_paraphrase_en']}" if m.get("word_gap") and m.get("simple_paraphrase_en") else None
        grammar = f"{m['micro_grammar_before']} → {m['micro_grammar_after']}" if m.get("micro_grammar_before") and m.get("micro_grammar_after") else None
        return clean({"weak_en": m.get("weak_example_en"), "improved_en": m.get("repaired_example_en"), "analysis_vi": m.get("explanation_vi"), "extra": extras([
            {"label": "Khi bí từ", "text": gap, "en": True},
            {"label": "Sửa ngữ pháp", "text": grammar, "en": True},
            {"label": "Luyện thêm", "text": m.get("post_completion_question_en"), "en": True},
        ])})

    lessons = [(series, lesson) for series in ("L57", "L58", "L59", "L60") for lesson in data[f"{series.lower()}_lessons"]["lessons"]]
    order = {}
    for series, lesson in lessons:
        lid = lesson["lesson_id"]
        order[series] = order.get(series, 0) + 1
        unit_id = f"p3-{series}-{lid.rsplit('-', 1)[-1]}"
        qs = sorted(questions[series].get(lid, []), key=lambda q: q["id"])
        if not qs:
            fail(f"{lid} has no questions")
        codes = [c for c in (short_skill(s) for s in (lesson.get("skill_ids") or lesson.get("source_l48_skill_ids") or [])) if c in skill_codes]
        tasks, prompts, after_task, moves = [], {}, {}, []
        for number, q in enumerate(qs, start=1):
            task_id = f"T{number}"
            label, hint, phrases = phase_info[series](q["phase"])
            part = q.get("part") or lesson.get("part") or 3
            cue = q.get("cue") if series == "L60" and part == 2 else None
            tasks.append(task_entry(task_id, q["phase"], label, hint, part, "full_cue" if cue else "short_spoken_answer", 60 if cue else 0,
                                    None if cue or part != 2 else {"min": 30, "max": 60}))
            prompts[task_id] = clean({"prompt_en": q["text"], "cue_bullets": cue})
            moves.append(clean({"phase": q["phase"], "title_vi": label, "instruction_vi": hint, "phrases": phrases}))
            if series == "L58":
                step = next((g for g in coaching58.get(lid, {}).get("stage_guide", []) if g["phase"] == q["phase"]), None)
                if step:
                    after_task[task_id] = clean({"tip_vi": step.get("focus_specific_tip_vi"), "phrases": step.get("phrase_starters")})
            elif series == "L59" and q["id"] in hints59:
                h = hints59[q["id"]]
                after_task[task_id] = clean({"tip_vi": h.get("guidance_vi"), "tip_en": h.get("guidance_en"),
                                             "focus_collocation_en": ", ".join(h.get("reference_collocations") or []) or None, "contrast_en": h.get("contrasted_meaning")})
            elif series == "L60" and q["id"] in guidance60:
                g = guidance60[q["id"]]
                after_task[task_id] = clean({"tip_vi": g.get("guide_vi"), "tip_en": g.get("guide_en"), "error_to_avoid_en": g.get("avoid_en")})
        coaching = None
        if series == "L57" and lid in coaching57:
            c = coaching57[lid]
            coaching = clean({"focus_vi": c.get("target_vi"), "mistakes_vi": c.get("mistakes_to_check_vi"), "self_review_vi": c.get("self_review_questions_vi")})
        elif series == "L58" and lid in coaching58:
            c = coaching58[lid]
            coaching = clean({"focus_vi": c.get("target_vi"), "steps_vi": c.get("step_by_step_vi")})
        title_en = lesson["topic_en"]
        title_vi = L60_TITLES_VI.get(title_en) if series == "L60" else None
        model = model_for(series, lid)
        units.append({
            "id": unit_id, "kind": "part3", "series": series, "part": lesson.get("part", 3), "skills": codes,
            "title_vi": title_vi or topic_vi(lesson) or title_en, "title_en": title_en.replace(" — extended discussion", ""),
            "level": lesson.get("practice_level") or "", "order": order[series], "tasks": tasks,
        })
        private[unit_id] = {
            "teach": clean({"moves": list({m["phase"]: m for m in moves}.values()), "strategies": strategies if series == "L60" else None}),
            "prompts": prompts, "after_task": after_task,
            "after_first": {"coaching": coaching} if coaching else {},
            "after_all": {"model": model} if model else {},
        }
    return units, private


def build_mocks(data):
    """Eight full mock tests, one question at a time; the debrief (and L61's sample excerpts) only after the last."""
    units, private = [], {}
    debriefs = {d["entry_id"]: d for d in data["l61_debriefs"]["debriefs"]}
    samples = {e["id"]: e for e in data["l61_samples"]["examples"]}
    debriefs63 = {d["mock_id"]: d for d in data["l63_coaching"]["mock_debriefs"]}
    mocks = []
    for entry in data["l61_catalog"]["entries"]:
        if entry["kind"] != "full_mock":
            continue
        qs = [{"seq": q["sequence"], "part": q["part"], "text": q["prompt_en"], "cue": q.get("cue_card"), "kind": q.get("phase", "")}
              for q in data["l61_prompts"]["prompts"] if q["entry_id"] == entry["id"]]
        d, ex = debriefs.get(entry["id"], {}), samples.get(entry["id"], {})
        model = clean({"analysis_vi": d.get("debrief_vi"), "extra": [row for row in [
            {"label": "Part 1", "text": d.get("part1_review_vi")}, {"label": "Part 2", "text": d.get("part2_review_vi")},
            {"label": "Part 3", "text": d.get("part3_review_vi")},
            {"label": "Đoạn mẫu Part 1", "text": ex.get("part1"), "en": True}, {"label": "Đoạn mẫu Part 2", "text": ex.get("part2"), "en": True},
            {"label": "Đoạn mẫu Part 3", "text": ex.get("part3"), "en": True},
        ] if row["text"]], "model_purpose_vi": "Đoạn mẫu minh hoạ cách triển khai ý, không phải bài được giám khảo chấm."})
        mocks.append((entry["id"], L61_MOCK_TITLES_VI[entry["id"]], entry["topic_en"], qs, model))
    for item in data["l63_catalog"]["new_mock_sets"]:
        qs = [{"seq": q["sequence"], "part": q["part"], "text": q["question_en"], "cue": q.get("cue_bullets_en"), "kind": q.get("kind", "")}
              for q in data["l63_questions"]["questions"] if q["mock_id"] == item["id"]]
        model = clean({"analysis_vi": debriefs63.get(item["id"], {}).get("debrief_vi")})
        mocks.append((item["id"], item["title_vi"], item["title_en"], qs, model))
    for order, (mock_id, title_vi, title_en, qs, model) in enumerate(mocks, start=1):
        qs.sort(key=lambda q: q["seq"])
        if len(qs) != 16 or [q["part"] for q in qs] != sorted(q["part"] for q in qs):
            fail(f"{mock_id} should have 16 questions in Part 1 → 3 order")
        unit_id = f"mock-{mock_id.split('-')[1][-3:]}-{mock_id.rsplit('-', 1)[-1]}"
        tasks, prompts, count = [], {}, {}
        for number, q in enumerate(qs, start=1):
            count[q["part"]] = count.get(q["part"], 0) + 1
            cue = q["part"] == 2 and bool(q["cue"])
            label = "Cue card" if cue else "Câu hỏi thêm" if q["part"] == 2 else f"Câu {count[q['part']]}"
            tasks.append(task_entry(f"T{number}", f"part{q['part']}", label, "", q["part"], "full_cue" if cue else "short_spoken_answer", 60 if cue else 0,
                                    None if cue or q["part"] != 2 else {"min": 10, "max": 30}))
            prompts[f"T{number}"] = clean({"prompt_en": q["text"], "cue_bullets": q["cue"] if cue else None})
        units.append({"id": unit_id, "kind": "mock", "part": 3, "skills": [], "title_vi": title_vi, "title_en": title_en,
                      "level": "11–14 phút", "order": order, "tasks": tasks})
        private[unit_id] = {"teach": {}, "prompts": prompts, "after_task": {}, "after_first": {}, "after_all": {"model": model} if model else {}}
    return units, private


def strip_marks(text):
    return (text or "").replace("**", "")


def build_pron(data):
    """L39 pronunciation lessons with L40's transfer question; L39's synthetic previews feed a listening check."""
    units, private, audio = [], {}, []
    modules = {m["code"]: m for m in data["pron_modules"]["modules"]}
    items = {i["item_id"]: i for i in data["pron_items"]["listening_items"]}
    key = {k["item_id"]: k for k in data["pron_key"]["answer_key"]}
    transfers = {t["source_l39_lesson_id"]: t for t in data["pron_transfers"]["transfers"]}
    for index, lesson in enumerate(data["pron_lessons"]["lessons"], start=1):
        lid = lesson["lesson_id"]
        code = lesson["module_code"]
        stage_no = {"guided": 0, "independent": 1, "mastery": 2}[lesson["stage"]]
        unit_id = f"pron-{lid.rsplit('-', 1)[-1]}"
        tasks, prompts, after_task, ids = [], {}, {}, []
        if code in PRON_ITEMS:
            pool = [f"SPK-M10L39-LS{n:02d}" for n in PRON_ITEMS[code]]
            size = -(-len(pool) // 3)
            ids = pool[stage_no * size:(stage_no + 1) * size]
        if ids:
            task = task_entry("T1", "listen", "Nghe và phân biệt", "Hai từ chỉ khác nhau một âm.", lesson["part"], "listen_choice", 0, {"min": 0, "max": 0})
            task["items"] = [{"id": i, "options": items[i]["options"]} for i in ids]
            tasks.append(task)
            prompts["T1"] = {"prompt_en": "Listen and choose the word you hear.", "instructions_vi": items[ids[0]]["task_vi"]}
            answers = {}
            for i in ids:
                match = [o["id"] for o in items[i]["options"] if o["word"] == key[i]["tts_target_text"]]
                if len(match) != 1:
                    fail(f"{i} answer key does not match one option")
                answers[i] = match[0]
            after_task["T1"] = {"answers": answers, "tip_vi": "Âm thanh do máy tạo, chỉ để luyện phân biệt. Sau khi xem đáp án, hãy nói to cả hai từ."}
            audio += ["milestones/L39/" + items[i]["asset_relative_path"] for i in ids]
        drill = f"T{len(tasks) + 1}"
        seconds = lesson.get("suggested_record_seconds") or 20
        tasks.append(task_entry(drill, "drill", "Luyện mẫu", "Nói theo mẫu, chỉ tập trung một điểm.", lesson["part"], "micro_spoken_drill", 0,
                                {"min": max(5, seconds // 2), "max": seconds + 10}))
        model_step = next((st for st in lesson.get("teaching_steps", []) if st.get("label") == "Guided practice"), {})
        prompts[drill] = clean({"prompt_en": strip_marks(lesson.get("practice_instruction_en")), "instructions_vi": strip_marks(lesson.get("practice_instruction_vi")),
                                "model_en": strip_marks(model_step.get("en", "")).replace("Model to rehearse: ", "") or None})
        transfer = transfers.get(lid)
        if transfer:
            t_id = f"T{len(tasks) + 1}"
            tasks.append(task_entry(t_id, "transfer", "Dùng trong câu trả lời", "Trả lời câu hỏi, giữ đúng điểm phát âm vừa luyện.", transfer["part"]))
            prompts[t_id] = {"prompt_en": transfer["question_en"]}
            after_task[t_id] = clean({"tip_vi": transfer.get("coach_vi"), "focus_collocation_en": transfer.get("model_chunk_en"), "note_vi": transfer.get("feedback_vi")})
        module = modules[code]
        units.append({
            "id": unit_id, "kind": "pron", "module": code, "part": lesson["part"], "skills": [],
            "title_vi": module["title_vi"], "title_en": module["title"], "level": PRON_STAGES[lesson["stage"]], "order": index, "tasks": tasks,
        })
        private[unit_id] = {
            "teach": clean({"pron": {
                "goal_vi": lesson.get("goal_vi"), "why_vi": lesson.get("why_vi"), "contrast": lesson.get("contrast_focus"),
                "tip_vi": lesson.get("physical_or_practical_tip_vi"), "mistake_vi": lesson.get("common_mistake_vi"),
                "steps": [clean({"label": st.get("label"), "vi": strip_marks(st.get("vi"))}) for st in lesson.get("teaching_steps", [])],
            }, "self_check_vi": lesson.get("self_check_vi")}),
            "prompts": prompts, "after_task": after_task, "after_first": {}, "after_all": {},
        }
    return units, private, sorted(set(audio))


def main():
    if len(sys.argv) != 3:
        fail("usage: python -I scripts/import-speaking-lab.py <L80 folder> <private output folder>")
    root = Path(sys.argv[1]).resolve()
    out = Path(sys.argv[2]).resolve()
    if REPO in out.parents or out == REPO:
        fail("the private output folder must be outside the repository")
    catalog, private, audio = build(root)
    CATALOG_OUT.parent.mkdir(parents=True, exist_ok=True)
    CATALOG_OUT.write_text(json.dumps(catalog, ensure_ascii=False, indent=1) + "\n", encoding="utf-8")
    out.mkdir(parents=True, exist_ok=True)
    (out / "speaking-lab-private.json").write_text(json.dumps(private, ensure_ascii=False), encoding="utf-8")
    bundle = load_bundle_hashes(root)
    (out / "audio").mkdir(exist_ok=True)
    for rel in audio:
        (out / "audio" / Path(rel).name).write_bytes(read_audio(root, bundle, rel))
    kinds = {}
    for unit in catalog["units"]:
        kinds[unit["kind"]] = kinds.get(unit["kind"], 0) + 1
    tasks = sum(len(unit["tasks"]) for unit in catalog["units"])
    print(f"catalog: {len(catalog['skills'])} skills, units {kinds}, {tasks} spoken tasks -> {CATALOG_OUT.relative_to(REPO)}")
    print(f"private: {len(private['units'])} units -> {out / 'speaking-lab-private.json'}; {len(audio)} audio files -> {out / 'audio'}")


if __name__ == "__main__":
    main()
