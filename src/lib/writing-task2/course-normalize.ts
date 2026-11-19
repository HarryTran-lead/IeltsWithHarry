/*
 * Maps the R01–R16 source files onto the course shapes (course-types.ts). The milestones were authored in
 * rounds and name the same idea differently (units / lessons / types, task_vi / instruction_vi, …), so this
 * reads them by role, with a generic fallback that keeps any field it does not know as a labelled row.
 * It never copies a server_only file into the module; those only feed `answers`, which the reveal route serves.
 */
import { criteria, type Criterion, type FinalBundle, type FinalModel, type FinalPrompt, type FinalReview, type MistakeCode } from "./final-types";
import { questionTypeLabels } from "./types";
import {
  courseLayers, courseStageLabels,
  type CourseAnswer, type CourseExample, type CourseField, type CourseModule, type CoursePractice, type CourseSection, type CourseUnit,
} from "./course-types";

export type CourseSourceFile = { path: string; visibility: string; data: unknown };
type Obj = Record<string, unknown>;

const isObj = (value: unknown): value is Obj => Boolean(value) && typeof value === "object" && !Array.isArray(value);
const str = (value: unknown) => (typeof value === "string" && value.trim() ? value.trim() : undefined);
const strList = (value: unknown) => Array.isArray(value) ? value.map((item) => typeof item === "string" ? item.trim() : isObj(item) ? summarise(item) : "").filter(Boolean) : typeof value === "string" && value.trim() ? [value.trim()] : [];
const first = (o: Obj, keys: string[]) => { for (const key of keys) { const value = str(o[key]); if (value) return { key, value }; } return undefined; };

/** Fields that describe the record rather than teach anything. */
const META = new Set([
  "id", "milestone", "count", "schema_version", "version", "source_ref", "source_sha256", "source_kind", "source_layer", "source", "status", "answer_access", "answer_release",
  "answer_locked", "model_answer_locked", "model_answer_access", "requires_semantic_review", "requires_learner_self_review", "needs_semantic_feedback",
  "manual_or_semantic_review_needed", "human_or_semantic_review_needed", "reference_hash", "auto_grading", "prompt_sha256", "prompt_payload_sha256",
  "assigned_band", "released_only_after_submission", "practice_id", "case_id", "private", "server_only", "visible_before_practice",
  "teaching_example_not_practice_answer", "model_status", "score_claim", "requires_teacher_band_claim", "original_content", "lesson_ref", "lesson_id",
  "source_component_refs", "r05_intro_ref", "r06_ref", "r07_ref", "r06_model_ref", "prompt_ref", "topic_id", "same_prompt_across_stages_intentional",
  "spiral_practice", "no_band_estimation", "novel_argument_added", "error_code_hidden_until_submit", "model_answer_is_one_valid_approach",
  "translation_type", "marking_criteria_used", "evidence_start", "evidence_end", "supersedes", "historical_first_six_source_sha256", "supplement_source",
  "import_policy", "answer_policy", "private_answer_policy", "official_references", "automatic_band", "grading_policy", "scoring_method", "logic_chain_labels",
  "weakness_focus_code", "error_code", "reveal_policy", "prompt_state", "assessment_fields", "requires_human", "nonunique_answer_notice_vi", "practices_count",
  "unique_base_prompts", "timed_prompt_count", "total_practices", "question_types", "question_type", "stage", "response_type", "response_mode", "type",
  "practice_source_separation_vi", "word_count_en", "linked_lessons", "related_rubric", "linked_rubric", "skill_code",
  "student_output", "feedback_policy", "worked_example_ids", "source_hash_scheme", "visibility",
]);

const LABELS: Record<string, string> = {
  task_vi: "Nhiệm vụ", instruction_vi: "Hướng dẫn", instructions_vi: "Hướng dẫn", prompt_en: "Đề", prompt_vi: "Dịch đề", scope_vi: "Phạm vi đề", scope_en: "Phạm vi đề",
  off_topic_trap_vi: "Bẫy lạc đề", required_answers_vi: "Đề yêu cầu trả lời", required_views_en: "Hai quan điểm cần bàn", question_command_en: "Câu lệnh của đề",
  expected_output_vi: "Kết quả cần viết", target_length_vi: "Độ dài", length_target_vi: "Độ dài", theme: "Chủ đề", topic_en: "Chủ đề", topic: "Chủ đề", topic_vi: "Chủ đề",
  criterion: "Tiêu chí", error_family: "Nhóm lỗi", learning_objective: "Mục tiêu", vocabulary_hints_en: "Từ vựng gợi ý", suggested_stance_for_practice: "Lập trường gợi ý",
  independent_choice_allowed: "Được tự chọn lập trường", body1_summary_en: "Tóm tắt Body 1", weak_body2_en: "Body 2 chưa tốt", weak_introduction_en: "Mở bài chưa tốt",
  draft_en: "Bản nháp cần sửa", source_en: "Câu gốc", stimulus_en: "Ngữ liệu", time_limit_minutes: "Thời gian (phút)", time_minutes: "Thời gian (phút)", min_words: "Số từ tối thiểu",
  recommended_plan_minutes: "Thời gian lập dàn ý (phút)", word_count: "Số từ",
  // Answers
  model_thesis_en: "Thesis mẫu", model_thesis_vi: "Dịch thesis", body1_focus_vi: "Body 1 nên tập trung", body2_focus_vi: "Body 2 nên tập trung", reason_vi: "Vì sao", why_vi: "Vì sao",
  grading_note_vi: "Lưu ý khi tự chấm", correct_type: "Dạng đề đúng", explanation_vi: "Giải thích", reference_answer_en: "Đáp án tham khảo", model_answer_en: "Câu mẫu",
  model_translation_vi: "Dịch", acceptance_vi: "Đạt khi", model_idea_en: "Ý chính", model_mechanism_en: "Cơ chế (vì sao)", model_result_en: "Kết quả", model_example_en: "Ví dụ",
  model_response_en: "Câu trả lời mẫu", model_response_vi: "Dịch câu trả lời", answer_vi: "Giải thích bằng tiếng Việt", model_word_count: "Số từ của mẫu",
  claim_en: "Luận điểm", mechanism_en: "Cơ chế", immediate_result_en: "Kết quả trực tiếp", illustrative_case_en: "Tình huống minh hoạ", question_type_pitfall_vi: "Lưu ý theo dạng đề",
  evidence_note_vi: "Ghi chú bằng chứng", why_weak_vi: "Vì sao bản cũ yếu", model_introduction_en: "Mở bài mẫu", model_introduction_vi: "Dịch mở bài", checks_vi: "Kiểm tra",
  weakness_code: "Mã lỗi", model_topic_sentence_en: "Câu chủ đề mẫu", rationale_vi: "Vì sao", model_development_plan_vi: "Cách phát triển đoạn",
  model_body2_contrast_reference_en: "Gợi ý ý cho Body 2", stage_acceptance_vi: "Đạt ở chặng này khi", better_body2_topic_sentence_en: "Câu chủ đề Body 2 tốt hơn",
  why_better_vi: "Vì sao tốt hơn", acceptable_variations_vi: "Cách viết khác cũng đúng", revision_steps_vi: "Các bước sửa", key_points_vi: "Ý cần có",
  type_specific_red_flag_vi: "Dấu hiệu sai dạng đề", scoring_vi: "Cách tự đánh giá", example_stance: "Lập trường ví dụ", body1_direction_en: "Hướng Body 1",
  body2_direction_en: "Hướng Body 2", counter_argument_en: "Ý phản biện", rubric_vi: "Tiêu chí", checking_method_vi: "Cách kiểm tra", distractor_vi: "Lựa chọn dễ nhầm",
  view_a_en: "Quan điểm A", view_a_reason_en: "Lý do A", view_b_en: "Quan điểm B", view_b_reason_en: "Lý do B", body1_topic_en: "Câu chủ đề Body 1", body1_support_en: "Phát triển Body 1",
  body2_topic_en: "Câu chủ đề Body 2", body2_support_en: "Phát triển Body 2", model_opinion_en: "Ý kiến mẫu", model_opinion_vi: "Dịch ý kiến", benefit_en: "Lợi ích", drawback_en: "Bất lợi",
  evaluative_judgement_en: "Nhận định cân nhắc", evaluative_judgement_vi: "Dịch nhận định", weighing_dimensions_vi: "Tiêu chí cân nhắc", mitigation_example_en: "Ví dụ giảm thiểu",
  answer_q1_en: "Trả lời câu hỏi 1", answer_q1_vi: "Dịch câu 1", answer_q2_en: "Trả lời câu hỏi 2", answer_q2_vi: "Dịch câu 2", reasoning_chain_en: "Chuỗi lập luận",
  model_support_en: "Phần phát triển mẫu", possible_alternative_vi: "Cách khác", evidence_quote_en: "Đoạn chứa lỗi", error_name_vi: "Tên lỗi", diagnosis_vi: "Chẩn đoán",
  revised_en: "Bản sửa", why_fix_works_vi: "Vì sao cách sửa hiệu quả", coach_steps_vi: "Các bước tự sửa", acceptable_alternatives_vi: "Cách sửa khác",
  corrected_en: "Bản sửa", corrected_vi: "Dịch bản sửa", feedback_steps_vi: "Các bước", alternative_answers_policy_vi: "Về đáp án khác", idea_bank_en: "Kho ý",
  sample_argument_en: "Lập luận mẫu", argument_translation_vi: "Dịch lập luận", why_this_works_vi: "Vì sao hiệu quả", opposing_consideration_en: "Ý ngược lại",
  stage_feedback_vi: "Nhận xét theo chặng", scoring_policy_vi: "Cách tự đánh giá", requirement_vi: "Yêu cầu", sample_idea1_en: "Ý mẫu 1", sample_idea2_en: "Ý mẫu 2",
  sample_development_en: "Phát triển mẫu", development_note_vi: "Ghi chú", how_to_adapt_vi: "Cách áp dụng cho bài bạn", feedback_vi: "Nhận xét",
  suggested_revision_en: "Bản sửa gợi ý", acceptable_variants_vi: "Cách sửa khác", outline_en: "Dàn ý", type_specific_vi: "Lưu ý theo dạng đề", risk_vi: "Rủi ro",
  reference_not_single_correct_answer: "Lưu ý",
  // Teaching and reference
  overview_vi: "Tổng quan", definition_vi: "Định nghĩa", common_signal_en: "Dấu hiệu nhận biết", obligations_vi: "Bắt buộc phải làm", position_rule_vi: "Quy tắc lập trường",
  confusion_warning_vi: "Dễ nhầm với", reference_prompt_en: "Đề ví dụ", good_thesis_en: "Thesis tốt", bad_thesis_en: "Thesis chưa tốt", why_good_vi: "Vì sao tốt",
  paragraph_guide_vi: "Cách chia đoạn", stage_teaching_vi: "Theo chặng", stage_guidance: "Theo chặng", guidance_by_stage: "Theo chặng", function_vi: "Chức năng",
  usage_vi: "Cách dùng", good_en: "Câu tốt", bad_en: "Câu chưa tốt", weak_en: "Câu chưa tốt", original_en: "Câu gốc", better_en: "Câu tốt hơn", warning_vi: "Lưu ý",
  example_en: "Ví dụ", example_vi: "Dịch ví dụ", explain_vi: "Giải thích", vi: "Nghĩa", must_vi: "Phải", avoid_vi: "Tránh", fix_vi: "Cách sửa", check_vi: "Kiểm tra",
  instruction: "Hướng dẫn", must_have_vi: "Phải có", must_avoid_vi: "Tránh", introduction_blueprint_vi: "Khung mở bài", purpose_vi: "Mục đích", form_en: "Cấu trúc",
  worked_good_en: "Câu mẫu", corrected_en_: "Câu đã sửa", pitfall_vi: "Bẫy", logic_vi: "Logic", layout: "Bố cục", note_vi: "Ghi chú", ask_vi: "Tự hỏi",
  symptom_vi: "Dấu hiệu", repair_strategy_vi: "Cách sửa", evidence_to_record_vi: "Ghi lại gì", review_days: "Ôn lại sau (ngày)", case_count: "Số bài luyện",
  name_vi: "Tên", focus_vi: "Trọng tâm", not_equivalent_to_vi: "Không đồng nghĩa với", self_check_vi: "Tự kiểm tra", academic_collocations_en: "Cụm từ học thuật",
  teaching_point_vi: "Điểm cần học", minutes: "Số phút", analysis_vi: "Phân tích", job_vi: "Nhiệm vụ", starter_en: "Mở câu", question_vi: "Câu hỏi", body1_vi: "Body 1",
  body2_vi: "Body 2", en: "Tiếng Anh", output_vi: "Kết quả", worked_example_en: "Ví dụ", stance_vi: "Lập trường", improved_thesis_en: "Thesis tốt hơn",
  weak_thesis_en: "Thesis chưa tốt", model_opinion: "Ý kiến", weighing_result_vi: "Kết quả cân nhắc", question1_answer_en: "Trả lời câu 1", question2_answer_en: "Trả lời câu 2",
  structure_explanation_vi: "Cấu trúc bài", teaching_note_vi: "Ghi chú giảng dạy", notes_vi: "Ghi chú", coaching_vi: "Hướng dẫn", teaching_notes_vi: "Ghi chú",
  pedagogy_vi: "Ghi chú giảng dạy", structure_vi: "Cấu trúc", teaching_warning_vi: "Lưu ý", translation_note_vi: "Về bản dịch", body_role_vi: "Vai trò đoạn",
  role_vi: "Vai trò đoạn", discourse_relation: "Quan hệ giữa hai đoạn", body1_main_idea_en: "Ý chính Body 1", body2_main_idea_en: "Ý chính Body 2",
  body1_core_en: "Ý chính Body 1", body2_core_en: "Ý chính Body 2", type_specific_check_vi: "Kiểm tra theo dạng đề", guided_questions_vi: "Câu hỏi gợi ý",
  label_vi: "Nhãn", stance: "Lập trường", paragraphs_vi_summary: "Tóm tắt đoạn", view_a: "Quan điểm A", view_b: "Quan điểm B",
  pair: "Cặp dễ nhầm", rule: "Quy tắc", rule_vi: "Quy tắc", outline: "Dàn ý", outline_vi: "Dàn ý", scope_reference: "Phạm vi đề", length_by_stage: "Độ dài theo chặng",
  frames: "Khung câu", frames_en: "Khung câu", goal: "Mục tiêu", must_do: "Phải làm", must_do_vi: "Phải làm", target: "Mục tiêu", target_vi: "Mục tiêu",
  expected: "Kết quả cần có", expected_vi: "Kết quả cần có", relation: "Quan hệ ý", relation_vi: "Quan hệ ý", pair_coherence_check: "Kiểm tra liên kết hai đoạn",
  pair_coherence_check_vi: "Kiểm tra liên kết hai đoạn", example_evidence: "Bằng chứng của ví dụ", example_evidence_vi: "Bằng chứng của ví dụ", logic: "Logic",
  model_body1_en: "Body 1 mẫu", model_body2_en: "Body 2 mẫu", common_trap: "Bẫy hay gặp", common_trap_vi: "Bẫy hay gặp", introduction: "Mở bài", introduction_vi: "Mở bài",
  conclusion: "Kết luận", conclusion_vi: "Kết luận", command: "Câu lệnh", command_en: "Câu lệnh", required: "Bắt buộc", required_vi: "Bắt buộc",
  not_required: "Không bắt buộc", not_required_vi: "Không bắt buộc", subtype: "Dạng nhỏ", revised_vi_explanation: "Giải thích bản sửa", outcome: "Kết quả",
  hints: "Gợi ý", recommended_minutes: "Thời gian gợi ý (phút)", product: "Sản phẩm", learning_instruction: "Cách học", body_1: "Body 1", body_2: "Body 2",
};

const humanise = (key: string) => {
  const base = key.replace(/_(en|vi)$/, "").replace(/_/g, " ");
  return base.charAt(0).toUpperCase() + base.slice(1);
};
export const labelOf = (key: string) => LABELS[key] ?? (questionTypeLabels[key] || courseStageLabels[key] || humanise(key));

function summarise(o: Obj): string {
  return Object.entries(o).filter(([key, value]) => !META.has(key) && (typeof value === "string" || typeof value === "number") && String(value).trim())
    .map(([key, value]) => (/^(id|code)$/.test(key) ? String(value) : `${labelOf(key)}: ${value}`)).join(" · ");
}

/** Every teaching field of a record as labelled rows, except the keys already shown elsewhere. */
export function fieldsOf(o: Obj, used: Iterable<string> = []): CourseField[] {
  const skip = new Set(used);
  const out: CourseField[] = [];
  for (const [key, value] of Object.entries(o)) {
    if (skip.has(key) || META.has(key) || value === null || value === undefined || typeof value === "boolean") continue;
    const label = labelOf(key);
    if (typeof value === "string") { if (value.trim()) out.push(key.endsWith("_en") ? { label, en: value.trim() } : { label, vi: value.trim() }); }
    else if (typeof value === "number") { if (/word_count|minutes|min_words|review_days|case_count/.test(key)) out.push({ label, vi: String(value) }); }
    else if (Array.isArray(value)) { const list = strList(value); if (list.length) out.push({ label, list }); }
    else if (isObj(value)) {
      const list = Object.entries(value).map(([inner, text]) => {
        const shown = typeof text === "string" ? text : Array.isArray(text) ? strList(text).join("; ") : isObj(text) ? summarise(text) : "";
        return shown ? `${labelOf(inner)}: ${shown}` : "";
      }).filter(Boolean);
      if (list.length) out.push({ label, list });
    }
  }
  return out;
}

/* ───────────── Teaching units ───────────── */

const UNIT_TITLE = ["name_vi", "title_vi", "name", "term", "term_en", "expression", "code", "type", "phase"];
const UNIT_GOAL = ["learning_goal_vi", "goal_vi", "outcome_vi", "purpose_vi", "definition_vi", "job_vi", "instruction_vi", "focus_vi"];
const UNIT_STEPS = ["teacher_steps_vi", "teaching_steps_vi", "teach_steps_vi", "steps_vi", "teaching_sequence_vi", "obligations_vi", "must_have_vi"];
const UNIT_BAD = ["bad_en", "weak_en", "bad_thesis_en"];
const UNIT_GOOD = ["good_en", "worked_good_en", "corrected_en", "good_thesis_en"];
const UNIT_EXAMPLE = ["example_en", "worked_example_en", "form_en", "reference_prompt_en", "guided_prompt_en"];
const UNIT_NEXT = ["next_action_vi", "micro_drill_vi", "micro_assignment_vi", "pitfall_vi", "first_hint_vi"];

export function unitOf(o: Obj, index: number): CourseUnit {
  const used = new Set<string>();
  const take = (keys: string[]) => { const hit = first(o, keys); if (hit) used.add(hit.key); return hit?.value; };
  const titleKey = UNIT_TITLE.find((key) => str(o[key]));
  if (titleKey) used.add(titleKey);
  const nameEn = str(o.name_en);
  if (nameEn) used.add("name_en");
  const stepsKey = UNIT_STEPS.find((key) => strList(o[key]).length);
  if (stepsKey) used.add(stepsKey);
  const unit: CourseUnit = {
    id: str(o.id) ?? `U${index + 1}`,
    title: [titleKey ? str(o[titleKey]) : undefined, nameEn && nameEn !== str(o[titleKey ?? ""]) ? nameEn : undefined].filter(Boolean).join(" · ") || `Phần ${index + 1}`,
    goal: take(UNIT_GOAL), steps: stepsKey ? strList(o[stepsKey]) : [],
    principle_en: take(["principle_en"]), principle_vi: take(["principle_vi"]),
    bad_en: take(UNIT_BAD), good_en: take(UNIT_GOOD), why: take(["why_vi", "why_good_vi", "explain_vi"]),
    example_en: take(UNIT_EXAMPLE), example_vi: take(["example_vi"]), next: take(UNIT_NEXT), fields: [],
  };
  unit.fields = fieldsOf(o, used);
  return unit;
}

/* ───────────── Worked examples ───────────── */

const MAIN_EN = ["essay_en", "full_example_en", "paragraph_en", "introduction_en", "conclusion_en", "improved_thesis_en", "model_thesis_en", "corrected_en", "good_en", "better_en"];
const STEP_LABELS: Record<string, string> = { topic: "Câu chủ đề", explain: "Giải thích", result: "Kết quả", example: "Ví dụ", link: "Câu chốt", contrast: "Đối chiếu", concession: "Nhượng bộ", conclusion: "Kết luận" };

export function exampleOf(o: Obj, index: number): CourseExample {
  const used = new Set<string>(["prompt_en", "prompt_vi", "steps", "paragraphs_en", "paragraphs_vi", "word_count", "word_count_en"]);
  const main = first(o, MAIN_EN);
  if (main) used.add(main.key);
  const viKey = main ? main.key.replace(/_en$/, "_vi") : "";
  const mainVi = viKey && str(o[viKey]) ? (used.add(viKey), str(o[viKey])) : undefined;
  const paragraphs = strList(o.paragraphs_en), paragraphsVi = strList(o.paragraphs_vi);
  const titleHit = first(o, ["title_vi", "label_vi", "topic_en", "topic", "stance_vi", "topic_vi"]);
  if (titleHit) used.add(titleHit.key);
  const steps = Array.isArray(o.steps) ? o.steps.filter(isObj).map((step) => ({ label: STEP_LABELS[String(step.id)] ?? humanise(String(step.id ?? "")), en: str(step.text_en) ?? "", note: str(step.coaching_vi) })).filter((step) => step.en) : [];
  return {
    id: str(o.id) ?? `E${index + 1}`, title: titleHit?.value ?? `Ví dụ ${index + 1}`, stage: str(o.stage), question_type: str(o.question_type),
    prompt_en: str(o.prompt_en), prompt_vi: str(o.prompt_vi),
    main_en: main?.value ?? (paragraphs.length ? paragraphs.join("\n\n") : undefined),
    main_vi: mainVi ?? (paragraphsVi.length ? paragraphsVi.join("\n\n") : undefined),
    word_count: typeof o.word_count === "number" ? o.word_count : typeof o.word_count_en === "number" ? o.word_count_en : undefined,
    steps, fields: fieldsOf(o, used),
  };
}

/* ───────────── Practice ───────────── */

const PRACTICE_GROUPS: [RegExp, string][] = [
  [/ERROR_DIAGNOSIS/, "Chẩn đoán lỗi"], [/DIAGNOSTIC/, "Chẩn đoán và sửa"], [/SPIRAL/, "Luyện theo chủ đề"], [/TIMED/, "Viết có giờ"],
  [/SELF_REVISION/, "Tự sửa bài"], [/INDEPENDENT/, "Luyện độc lập"], [/PRACTICE/, "Luyện tập"],
];
export const isPracticeFile = (path: string) => /(PRACTICE|DIAGNOSIS|DIAGNOSTIC|TIMED_ESSAY|SELF_REVISION|INDEPENDENT)/.test(path) && !/METADATA/.test(path);
export const isExampleFile = (path: string) => /(WORKED|ESSAYS|ASSEMBLED)/.test(path);
const STIMULUS = ["draft_en", "weak_introduction_en", "weak_body2_en", "body1_summary_en", "source_en", "stimulus_en"];

export function practiceOf(o: Obj, group: string, peek: boolean): CoursePractice {
  const used = new Set<string>(["prompt_en", "prompt_vi", "options", "available_types", "hints_vi", "hint_vi", "scaffold_vi", "self_check_vi", "self_review_vi", "time_limit_minutes", "time_minutes", "min_words"]);
  const task = first(o, ["task_vi", "instruction_vi", "instructions_vi"]);
  if (task) used.add(task.key);
  const length = first(o, ["target_length_vi", "length_target_vi", "expected_output_vi"]);
  if (length) used.add(length.key);
  const stimulus: CourseField[] = STIMULUS.filter((key) => str(o[key])).map((key) => { used.add(key); return { label: labelOf(key), en: str(o[key]) }; });
  const options = Array.isArray(o.options) ? o.options.filter(isObj).map((option, i) => ({ id: str(option.id) ?? String.fromCharCode(65 + i), text: str(option.text_en) ?? str(option.text_vi) ?? str(option.text) ?? "" })).filter((option) => option.text)
    : Array.isArray(o.available_types) ? o.available_types.filter((type): type is string => typeof type === "string").map((type) => ({ id: type, text: questionTypeLabels[type] ?? type })) : undefined;
  const minutes = Number(o.time_limit_minutes ?? o.time_minutes) || undefined;
  return {
    id: String(o.id), group, stage: str(o.stage), question_type: str(o.question_type),
    prompt_en: str(o.prompt_en), prompt_vi: str(o.prompt_vi), task: task?.value ?? "Viết câu trả lời theo yêu cầu.", stimulus, length: length?.value,
    hints: [...strList(o.hints_vi), ...strList(o.hint_vi), ...strList(o.scaffold_vi)], self_check: [...strList(o.self_check_vi), ...strList(o.self_review_vi)],
    options: options?.length ? options : undefined, time_limit: minutes, min_words: Number(o.min_words) || undefined, fields: fieldsOf(o, used), peek, reference: false,
  };
}

/* ───────────── Answers ───────────── */

const MODEL_EN = ["model_response_en", "model_answer_en", "model_introduction_en", "revised_en", "corrected_en", "suggested_revision_en", "reference_answer_en",
  "model_thesis_en", "model_topic_sentence_en", "better_body2_topic_sentence_en", "sample_argument_en", "answer_q1_en", "sample_development_en"];
const MODEL_VI: Record<string, string[]> = {
  model_response_en: ["model_response_vi"], model_answer_en: ["model_translation_vi"], model_introduction_en: ["model_introduction_vi"], corrected_en: ["corrected_vi"],
  model_thesis_en: ["model_thesis_vi"], sample_argument_en: ["argument_translation_vi"], answer_q1_en: ["answer_q1_vi"],
};
const ANSWER_SKIP = ["prompt_en", "prompt_vi", "question_type", "stage", "topic_id", "milestone", "practice_id", "case_id", "source_ref"];

export function answerOf(records: Obj[]): CourseAnswer {
  const merged: Obj = Object.assign({}, ...records);
  const used = new Set<string>(ANSWER_SKIP);
  const model = first(merged, MODEL_EN);
  if (model) used.add(model.key);
  const vi = model ? first(merged, MODEL_VI[model.key] ?? []) : undefined;
  if (vi) used.add(vi.key);
  const correct = str(merged.correct_option_id) ?? str(merged.correct_type);
  used.add("correct_option_id");
  return { correct, model_en: model?.value, model_vi: vi?.value, fields: fieldsOf(merged, used) };
}

/* ───────────── Module ───────────── */

const TITLE_FALLBACK: Record<string, string> = { R02: "Cấu trúc bài và mô hình đoạn văn" };
const META_LISTS = new Set(["prerequisites", "self_check_vi", "checklist_vi", "self_review_vi"]);
const NOTE_KEYS = ["notice_vi", "band_note_vi", "rubric_vi", "assessment_note_vi", "learner_band_notice_vi", "grading_disclaimer_vi", "completion_rule_vi", "mastery_rule_vi",
  "mastery_check_vi", "independent_mastery_check_vi", "learner_assessment_vi", "assessment_policy_vi", "repetition_contract_vi", "why_7_types_vi", "exam_pass_policy_vi", "holdback_protocol_vi"];
const STAGE_KEYS = ["stage_targets_vi", "stage_targets", "stages", "length_by_stage"];
const UNIT_KEYS = ["units", "lessons", "types", "type_guides", "steps", "parts"];
const EXAMPLE_KEYS = ["worked_examples", "worked_analysis"];
const cleanTitle = (title: string) => title.replace(/^(Lớp [^:—-]+[:—-]\s*)/, "").trim();

function stageTargets(value: unknown) {
  if (!isObj(value)) return [];
  return Object.entries(value).map(([stage, text]) => ({ stage: courseStageLabels[stage] ?? stage, text: typeof text === "string" ? text : Array.isArray(text) ? strList(text).join("; ") : isObj(text) ? summarise(text) : "" })).filter((row) => row.text);
}

function sectionOf(key: string, value: unknown, parentTitle?: string): CourseSection | null {
  const title = parentTitle ? (key === "items" ? parentTitle : `${parentTitle} · ${SECTION_TITLES[key] ?? labelOf(key)}`) : SECTION_TITLES[key] ?? labelOf(key);
  if (Array.isArray(value)) {
    if (value.every((item) => typeof item === "string")) return value.length ? { id: key, title, list: strList(value), cards: [] } : null;
    const cards = value.filter(isObj).map((item) => {
      const titleKey = UNIT_TITLE.concat(["pair", "level", "en"]).find((name) => str(item[name]) || typeof item[name] === "number");
      return { title: titleKey ? String(item[titleKey]) : undefined, fields: fieldsOf(item, titleKey ? [titleKey] : []) };
    });
    return cards.length ? { id: key, title, cards } : null;
  }
  if (isObj(value)) {
    const cards = Object.entries(value).map(([inner, text]) => ({
      title: labelOf(inner),
      fields: typeof text === "string" ? [{ label: "", vi: text }] : Array.isArray(text) ? [{ label: "", list: strList(text) }] : isObj(text) ? fieldsOf(text) : [],
    })).filter((card) => card.fields.length);
    return cards.length ? { id: key, title, cards } : null;
  }
  return null;
}

const FILE_TITLES: [RegExp, string][] = [
  [/CASE_INDEX/, "Kho đề và phạm vi đề"], [/TOPIC_PROMPTS/, "Đề theo chủ đề"], [/MISTAKE_BANK/, "Ngân hàng lỗi"], [/FINAL_ASSESSMENT_METADATA/, "Bài đánh giá cuối khoá"],
  [/FINAL_ASSESSMENT_RUBRIC/, "Tiêu chí tự đánh giá cuối khoá"], [/PARAPHRASE/, "Cách paraphrase"], [/CONNECTORS/, "Từ nối trong ngữ cảnh"],
];

const SECTION_TITLES: Record<string, string> = {
  glossary: "Thuật ngữ", common_errors: "Lỗi hay gặp", common_error_bank: "Lỗi hay gặp", cohesion_devices: "Phương tiện liên kết", question_type_obligations: "Yêu cầu theo dạng đề",
  type_obligations: "Yêu cầu theo dạng đề", question_type_roles: "Vai trò Body 2 theo dạng đề", question_type_rules: "Kết luận theo dạng đề", valid_stances: "Các lập trường hợp lệ",
  weighing_criteria: "Tiêu chí cân nhắc lợi–hại", distinctions_vi: "Phân biệt các dạng", essay_patterns: "Bố cục bài", error_taxonomy: "Bảng phân loại lỗi", criteria: "Tiêu chí",
  topics: "Chủ đề", four_criterion_review: "Rà bài theo 4 tiêu chí", forty_minute_plan: "Kế hoạch 40 phút", rewrite_cycle_vi: "Chu trình viết lại", scaffold_steps: "Khung đoạn văn",
  idea_selection_checklist_vi: "Kiểm tra trước khi chọn ý", teaching_path_vi: "Lộ trình học", step_by_step_vi: "Từng bước", common_rewrite_errors_vi: "Lỗi hay gặp khi viết lại",
  principles_vi: "Nguyên tắc", cross_paragraph_check_vi: "Kiểm tra giữa hai đoạn", contrast: "So sánh hai dạng", guided_revision_5_steps_vi: "Sửa bài theo 5 bước",
  critical_distinctions_vi: "Phân biệt quan trọng", progressive_cycle_vi: "Chu trình luyện", guidance_reduction_vi: "Giảm dần gợi ý theo chặng", dimensions: "Các tiêu chí",
  levels: "Các mức", items: "Danh sách",
};

function readGuide(path: string, data: Obj, module: { units: CourseUnit[]; sections: CourseSection[]; examples: CourseExample[]; prerequisites: string[]; stage_targets: { stage: string; text: string }[]; self_check: string[]; notes: string[] }, meta: { title?: string; overview?: string }) {
  const title = str(data.title_vi) ?? str(data.name_vi);
  if (title && !meta.title && str(data.title_vi)) meta.title = cleanTitle(title);
  if (!meta.overview && str(data.overview_vi)) meta.overview = str(data.overview_vi);
  const fileTitle = title ? cleanTitle(title) : FILE_TITLES.find(([pattern]) => pattern.test(path))?.[1];
  for (const [key, value] of Object.entries(data)) {
    if (META.has(key) || ["title_vi", "name_vi", "overview_vi", "stage_labels", "evaluation_kind", "scoring_policy"].includes(key)) continue;
    if (key === "prerequisites") { module.prerequisites.push(...strList(value)); continue; }
    if (META_LISTS.has(key)) { module.self_check.push(...strList(value)); continue; }
    if (NOTE_KEYS.includes(key)) { module.notes.push(...strList(value)); continue; }
    if (STAGE_KEYS.includes(key) && isObj(value) && Object.keys(value).some((stage) => stage in courseStageLabels)) { if (!module.stage_targets.length) module.stage_targets.push(...stageTargets(value)); continue; }
    if (UNIT_KEYS.includes(key) && Array.isArray(value) && value.some(isObj)) {
      // A guide's own "steps" (e.g. the requirement parser) are units; worked-example step lists are not here.
      module.units.push(...value.filter(isObj).map((item, i) => unitOf(item, module.units.length + i)));
      continue;
    }
    if (EXAMPLE_KEYS.includes(key)) {
      const list = Array.isArray(value) ? value.filter(isObj) : isObj(value) ? [value] : [];
      module.examples.push(...list.map((item, i) => exampleOf(item, module.examples.length + i)));
      continue;
    }
    if (isObj(value) && Object.values(value).some((inner) => Array.isArray(inner) && inner.some(isObj))) {
      // Nested blocks such as essay_structure { overview_vi, parts[] } or requirement_parser { steps[], … }.
      const nestedTitle = str(value.name_vi) ?? labelOf(key);
      const intro = str(value.overview_vi);
      for (const [inner, innerValue] of Object.entries(value)) {
        if (UNIT_KEYS.includes(inner) && Array.isArray(innerValue)) module.units.push(...innerValue.filter(isObj).map((item, i) => unitOf(item, module.units.length + i)));
        else if (/full_example_en/.test(inner) && typeof innerValue === "string") module.examples.push({ id: `${key}-example`, title: nestedTitle, main_en: innerValue, main_vi: str(value.full_example_vi), steps: [], fields: [] });
        else if (inner === "self_check_vi") module.self_check.push(...strList(innerValue));
        else if (!["overview_vi", "name_vi", "id", "full_example_vi"].includes(inner)) { const section = sectionOf(inner, innerValue, nestedTitle); if (section) module.sections.push(section); }
      }
      if (intro) module.notes.unshift(intro);
      continue;
    }
    const section = sectionOf(key, value, key === "items" ? fileTitle : undefined);
    if (section) module.sections.push(section);
  }
}

/**
 * Builds one milestone from its files. Learner-guided files become the module; server-only files become the
 * answers keyed by practice id. The final milestone's locked prompts and model essays stay out of both.
 */
export function buildCourseModule(id: string, files: CourseSourceFile[]): { module: CourseModule; answers: Record<string, CourseAnswer> } {
  const layer = courseLayers.find((item) => item.modules.includes(id))?.id ?? "";
  const body = { units: [] as CourseUnit[], sections: [] as CourseSection[], examples: [] as CourseExample[], prerequisites: [] as string[], stage_targets: [] as { stage: string; text: string }[], self_check: [] as string[], notes: [] as string[] };
  const meta: { title?: string; overview?: string } = {};
  const practice: CoursePractice[] = [];
  const answerParts = new Map<string, Obj[]>();
  const peek = id !== "R16";
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));

  for (const file of sorted) {
    if (file.visibility !== "learner_guided" || !isObj(file.data) || /FINAL_ASSESSMENT|MISTAKE_BANK/.test(file.path)) continue;
    const data = file.data;
    const name = file.path.split("/").pop() ?? file.path;
    const list = (["items", "activities"] as const).map((key) => data[key]).find(Array.isArray) as unknown[] | undefined;
    if (list && isPracticeFile(name)) {
      const group = PRACTICE_GROUPS.find(([pattern]) => pattern.test(name))?.[1] ?? "Luyện tập";
      practice.push(...list.filter(isObj).filter((item) => str(item.id)).map((item) => practiceOf(item, group, peek)));
    } else if (list && isExampleFile(name)) {
      body.examples.push(...list.filter(isObj).map((item, i) => exampleOf(item, body.examples.length + i)));
    } else {
      readGuide(file.path, data, body, meta);
    }
  }
  for (const file of sorted) {
    if (file.visibility !== "server_only" || !isObj(file.data) || /FINAL_LOCKED|WORKED_FULL_ESSAYS/.test(file.path)) continue;
    const list = (["items", "answers"] as const).map((key) => (file.data as Obj)[key]).find(Array.isArray) as unknown[] | undefined;
    for (const item of (list ?? []).filter(isObj)) {
      const key = str(item.practice_id) ?? str(item.case_id) ?? str(item.id);
      if (key) answerParts.set(key, [...(answerParts.get(key) ?? []), item]);
    }
  }
  const answers: Record<string, CourseAnswer> = {};
  for (const item of practice) { const parts = answerParts.get(item.id); if (parts) { answers[item.id] = answerOf(parts); item.reference = true; } }

  // Some milestones publish the same worked example or reference block in two files.
  const seenExamples = new Set<string>(), seenSections = new Set<string>();
  body.examples = body.examples.filter((example) => !seenExamples.has(example.id) && Boolean(seenExamples.add(example.id)));
  body.sections = body.sections.filter((section) => { const key = JSON.stringify([section.list, section.cards]); return !seenSections.has(key) && Boolean(seenSections.add(key)); });

  const milestone: CourseModule = {
    id, layer, title: meta.title ?? TITLE_FALLBACK[id] ?? id, overview: meta.overview ?? body.notes[0] ?? "",
    counts: { units: body.units.length, examples: body.examples.length, practice: practice.length },
    prerequisites: [...new Set(body.prerequisites)], stage_targets: body.stage_targets, units: body.units, sections: body.sections, examples: body.examples, practice,
    self_check: [...new Set(body.self_check)], notes: [...new Set(body.notes)].filter((note) => note !== meta.overview),
  };
  return { module: milestone, answers };
}

/* ───────────── Final assessment (R16) ───────────── */

const PARA = String.fromCharCode(10, 10);

const asCriterion = (value: unknown): Criterion | undefined => (typeof value === "string" && (criteria as readonly string[]).includes(value) ? value as Criterion : undefined);

/**
 * The R16 final assessment: learner-safe paper slots, rubric and mistake codes, plus the private prompts and
 * models that the start and review routes hand out one paper at a time.
 */
export function buildCourseFinal(files: CourseSourceFile[]): { bundle: FinalBundle; prompts: Record<string, FinalPrompt & { requirement_vi?: string; ideas_en: string[] }>; models: Record<string, FinalModel> } {
  const find = (pattern: RegExp, visibility: string) => files.find((file) => file.visibility === visibility && pattern.test(file.path))?.data;
  const items = (data: unknown) => (isObj(data) && Array.isArray(data.items) ? data.items.filter(isObj) : []);

  const papers = items(find(/FINAL_ASSESSMENT_METADATA/, "learner_guided")).map((item) => ({
    id: String(item.id), question_type: str(item.question_type) ?? "", time_limit: Number(item.time_limit_minutes) || 40, min_words: Number(item.min_words) || 250,
  }));
  const rubricData = find(/FINAL_ASSESSMENT_RUBRIC/, "learner_guided");
  const rubricObj = isObj(rubricData) ? rubricData : {};
  const dimensions = isObj(rubricObj.dimensions) ? Object.entries(rubricObj.dimensions).flatMap(([id, value]) => {
    const criterion = asCriterion(id);
    return criterion && isObj(value) ? [{ id: criterion, question_vi: str(value.question_vi) ?? "", evidence_vi: strList(value.evidence_vi), repair_vi: str(value.repair_vi) ?? "" }] : [];
  }) : [];
  const levels = Array.isArray(rubricObj.levels) ? rubricObj.levels.filter(isObj).map((level) => ({ level: Number(level.level), vi: str(level.vi) ?? "" })) : [];
  const mistakes: MistakeCode[] = items(find(/MISTAKE_BANK_TAXONOMY/, "learner_guided")).flatMap((item) => {
    const criterion = asCriterion(item.criterion);
    return criterion ? [{
      id: String(item.id), criterion, name_vi: str(item.name_vi) ?? String(item.code ?? item.id), symptom_vi: str(item.symptom_vi) ?? "",
      repair_vi: str(item.repair_strategy_vi) ?? "", evidence_vi: strList(item.evidence_to_record_vi),
      review_days: Array.isArray(item.review_days) ? item.review_days.map(Number).filter((day) => day > 0) : [1, 3, 7, 14],
    }] : [];
  });

  const prompts = Object.fromEntries(items(find(/FINAL_LOCKED_PROMPTS/, "server_only")).map((item) => [String(item.id), {
    prompt_en: str(item.prompt_en) ?? "", prompt_vi: str(item.prompt_vi), requirement_vi: str(item.requirement_vi), ideas_en: strList(item.idea_guidance_after_submit_en),
  }]));
  const models = Object.fromEntries(items(find(/WORKED_FULL_ESSAYS/, "server_only")).map((item) => [str(item.question_type) ?? String(item.id), {
    title: `${questionTypeLabels[str(item.question_type) ?? ""] ?? "Bài mẫu"}`, prompt_en: str(item.prompt_en),
    essay_en: str(item.essay_en) ?? strList(item.paragraphs_en).join(PARA), essay_vi: str(item.essay_vi) ?? (strList(item.paragraphs_vi).join(PARA) || undefined),
    word_count: Number(item.word_count) || undefined, structure_vi: strList(item.structure_vi).join(" ") || undefined, warning_vi: str(item.teaching_warning_vi),
  } satisfies FinalModel]));

  return {
    bundle: { papers, rubric: { dimensions, levels, pass_vi: str(rubricObj.exam_pass_policy_vi), note_vi: str(rubricObj.scoring_policy) ? "Thang 0–3 là bằng chứng tự kiểm nội bộ, không quy đổi sang band IELTS." : undefined }, mistakes },
    prompts, models,
  };
}

/** Guidance for one submitted paper: the requirement, idea hints and the model essay of the same question type. */
export function finalReviewOf(paper: { question_type: string }, prompt: { requirement_vi?: string; ideas_en: string[] } | undefined, models: Record<string, FinalModel>): FinalReview {
  return { requirement_vi: prompt?.requirement_vi, ideas_en: prompt?.ideas_en ?? [], model: models[paper.question_type] };
}
