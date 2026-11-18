import "server-only";
/**
 * One server-side adapter over the M20–M26 practice labs.
 *
 * Each lab keeps its own private bank and release gate (`*Live*` functions). This module
 * only lists what the gate allows, projects items to the client-safe shapes in
 * labs-types.ts (no keys, rationales or reference answers) and normalises grades.
 */
import catalogJson from "@/data/grammar-editorial/catalog.json";
import concepts from "@/data/grammar-knowledge/m20/concepts.json";
import microSkills from "@/data/grammar-knowledge/m20/rule_micro_skills.json";
import m25Bank from "@/data/grammar-context-private/m25-bank.json";
import m25bBank from "@/data/grammar-context-private/m25b-bank.json";
import m25cBank from "@/data/grammar-context-private/m25c-bank.json";
import m25dBank from "@/data/grammar-context-private/m25d-bank.json";
import m26Bank from "@/data/grammar-transfer-private/m26-task-bank.json";
import { grammarDraftPreview } from "./preview";
import { grammarLevel } from "./gate";
import type { GrammarLevel } from "./types";
import type {
  ChoiceGrade, ClinicItem, ContextItem, ContrastItem, DiagnosticQuestion, DiagnosticResult, LabConcept, LabGrade,
  LabItem, LabKind, LabSummary, LessonLabs, LevelLabs, OpenGrade, TransferItem, TransformSet,
} from "./labs-types";
import { labKinds } from "./labs-types";
import { m22AllDraftClinics, liveClinic } from "./m22-clinic-server";
import { checkClinicAnswer } from "./m22-clinic";
import { m23DraftUnits, m23LiveUnit } from "./m23-contrast-server";
import { m23CheckChoice } from "./m23-contrast";
import { m24DraftItems, m24LiveItem } from "./m24-transformation-server";
import { m24Grade } from "./m24-transformation";
import { m25LiveCase } from "./m25-context-server";
import { m25GradeChoice, m25GradeTransfer, type M25Case } from "./m25-context";
import { m25bLiveCase } from "./m25b-context-server";
import { m25bGradeChoice, m25bGradeOpen, type M25BCase } from "./m25b-context";
import { m25cLiveCase } from "./m25c-context-server";
import { m25cGradeChoice, m25cGradeOpen, type M25CCase } from "./m25c-context";
import { liveCase as m25dLiveCase } from "./m25d-context-server";
import { gradeChoice as m25dGradeChoice, gradeOpen as m25dGradeOpen, type Case as M25DCase } from "./m25d-context";
import { liveTask } from "./m26-transfer-server";
import { reviewSubmission, type Task as M26Task } from "./m26-transfer";
import { liveDiagnosticBank } from "./m21-server-bank";
import { scoreDiagnostic, selectDiagnostic, type M21Item } from "./m21-diagnostic";

type CatalogLesson = { code: string; level: string; title: string };
const catalog = catalogJson as CatalogLesson[];
const lessonTitle = (code: string) => catalog.find((lesson) => lesson.code === code)?.title ?? code;
const levelOf = (value: string): GrammarLevel => (grammarLevel(value) ? value : "A1");

type ContextSource =
  | { version: "m25"; data: M25Case }
  | { version: "m25b"; data: M25BCase }
  | { version: "m25c"; data: M25CCase }
  | { version: "m25d"; data: M25DCase };

const contextDrafts: Array<{ id: string; level: string; lessonId: string; genre: string; subtitle: string }> = [
  ...(m25Bank.cases as unknown as M25Case[]).map((c) => ({ id: c.id, level: c.level, lessonId: c.lesson_id, genre: c.genre, subtitle: c.focus })),
  ...(m25bBank.cases as unknown as M25BCase[]).map((c) => ({ id: c.id, level: c.level, lessonId: c.lesson_id, genre: c.genre, subtitle: c.genre })),
  ...(m25cBank.cases as unknown as M25CCase[]).map((c) => ({ id: c.id, level: c.level, lessonId: c.lesson_id, genre: c.genre, subtitle: c.lesson_title })),
  ...(m25dBank.cases as unknown as M25DCase[]).map((c) => ({ id: c.id, level: c.level, lessonId: c.lesson_id, genre: c.genre, subtitle: c.lesson_title })),
];
const transferDrafts = m26Bank.tasks as unknown as M26Task[];
const transformFamilies = (() => {
  const families = new Map<string, { id: string; level: string; lessonId: string; cue: string; ids: string[] }>();
  for (const item of m24DraftItems) {
    const family = families.get(item.family_id) ?? { id: item.family_id, level: item.level, lessonId: item.source_lesson_id, cue: item.rewrite_cue, ids: [] };
    family.ids.push(item.id);
    families.set(item.family_id, family);
  }
  return [...families.values()];
})();

function contextSource(id: string): ContextSource | null {
  if (id.startsWith("M25D-")) { const data = m25dLiveCase(id); return data ? { version: "m25d", data } : null; }
  if (id.startsWith("M25C-")) { const data = m25cLiveCase(id); return data ? { version: "m25c", data } : null; }
  if (id.startsWith("M25B-")) { const data = m25bLiveCase(id); return data ? { version: "m25b", data } : null; }
  if (id.startsWith("M25-")) { const data = m25LiveCase(id); return data ? { version: "m25", data } : null; }
  return null;
}

/** Listing stays behind the same gate as fetching: production lists nothing until approved. */
function allSummaries(): LabSummary[] {
  const out: LabSummary[] = [];
  for (const c of m22AllDraftClinics) if (liveClinic(c.id))
    out.push({ lab: "clinic", id: c.id, level: levelOf(c.level), lessonIds: [c.lesson_id], title: c.title, subtitle: c.misconception_vi });
  for (const u of m23DraftUnits) if (m23LiveUnit(u.id))
    out.push({ lab: "contrast", id: u.id, level: levelOf(u.cefr), lessonIds: u.source_lesson_ids, title: u.title, subtitle: u.topic_vi });
  for (const f of transformFamilies) if (f.ids.some((id) => m24LiveItem(id)))
    out.push({ lab: "transform", id: f.id, level: levelOf(f.level), lessonIds: [f.lessonId], title: f.cue, subtitle: `${f.ids.length} câu · ${lessonTitle(f.lessonId)}` });
  for (const c of contextDrafts) if (contextSource(c.id))
    out.push({ lab: "context", id: c.id, level: levelOf(c.level), lessonIds: [c.lessonId], title: `${lessonTitle(c.lessonId)} · ${c.genre}`, subtitle: c.subtitle });
  for (const t of transferDrafts) if (liveTask(t.id))
    out.push({ lab: "transfer", id: t.id, level: levelOf(t.level), lessonIds: [t.lesson_id], title: t.title_vi, subtitle: `${t.mode === "SPEAKING" ? "Nói" : "Viết"} · ${t.stage === "INDEPENDENT_TRANSFER" ? "Tự vận dụng" : "Có hướng dẫn"}` });
  return out;
}
let cache: LabSummary[] | null = null;
const summaries = () => (cache ??= allSummaries());
const grouped = (list: LabSummary[]) => Object.fromEntries(labKinds.map((lab) => [lab, list.filter((x) => x.lab === lab)])) as Record<LabKind, LabSummary[]>;

export function conceptForLesson(code: string): LabConcept | null {
  const concept = (concepts as Array<{ id: string; source_lesson_id: string; title: string; proposed_family: string; micro_skill_ids: string[]; prerequisite_links: string[] }>)
    .find((entry) => entry.source_lesson_id === code);
  if (!concept) return null;
  const skills = (microSkills as Array<{ id: string; title: string; formula: string }>).filter((skill) => concept.micro_skill_ids.includes(skill.id));
  return {
    id: concept.id, lessonId: code, title: concept.title,
    family: concept.proposed_family.replaceAll("_", " ").toLowerCase(),
    skills: skills.map((skill) => ({ id: skill.id, title: skill.title, formula: skill.formula })),
    prerequisites: concept.prerequisite_links,
  };
}

export function labsForLesson(code: string): LessonLabs {
  return { concept: conceptForLesson(code), labs: grouped(summaries().filter((x) => x.lessonIds.includes(code))), draftPreview: grammarDraftPreview };
}

export function labsForLevel(level: GrammarLevel): LevelLabs {
  return {
    level, labs: grouped(summaries().filter((x) => x.level === level)),
    diagnosticItems: liveDiagnosticBank(level).items.length, draftPreview: grammarDraftPreview,
  };
}

export function labLevel(lab: LabKind, id: string): GrammarLevel | null {
  return summaries().find((x) => x.lab === lab && x.id === id)?.level ?? null;
}

export function labItem(lab: LabKind, id: string): LabItem | null {
  if (lab === "clinic") {
    const c = liveClinic(id); if (!c) return null;
    const item: ClinicItem = {
      lab, id: c.id, level: levelOf(c.level), lessonId: c.lesson_id, title: c.title,
      misconceptionVi: c.misconception_vi, contextVi: c.context_vi, decisionRuleVi: c.decision_rule_vi,
      steps: c.guided_steps.map((s) => ({ kind: s.kind, instructionVi: s.instruction_vi, contentVi: s.content_vi, problematicEn: s.problematic_en, recommendedEn: s.recommended_en, explanationVi: s.explanation_vi })),
      practice: c.practice.map((q) => ({ id: q.id, promptVi: q.prompt_vi, optionsEn: q.options_en, type: q.target })),
      independentTask: { promptVi: c.independent_task.prompt_vi, rubricVi: c.independent_task.rubric_vi },
    };
    return item;
  }
  if (lab === "contrast") {
    const u = m23LiveUnit(id); if (!u) return null;
    const item: ContrastItem = {
      lab, id: u.id, level: levelOf(u.cefr), lessonIds: u.source_lesson_ids, title: u.title, topicVi: u.topic_vi,
      // The two in-unit checks are rendered from `practice`; their step carries only the prompt link.
      steps: u.steps.map((s) => ({ kind: s.kind, instructionVi: s.instruction_vi, contentVi: s.content_vi, examplesEn: s.examples_en, aMeaningVi: s.a_meaning_vi, bMeaningVi: s.b_meaning_vi, contextVi: s.context_vi, aEn: s.a_en, bEn: s.b_en, explanationVi: s.check_id ? undefined : s.explanation_vi, checkId: s.check_id, selfReviewVi: s.self_review_vi })),
      practice: u.practice.map((q) => ({ id: q.id, promptVi: q.prompt_vi, optionsEn: q.options_en })),
    };
    return item;
  }
  if (lab === "transform") {
    const family = transformFamilies.find((f) => f.id === id); if (!family) return null;
    const items = family.ids.map((itemId) => m24LiveItem(itemId)).filter((x) => x !== null);
    if (!items.length) return null;
    const set: TransformSet = {
      lab, id, level: levelOf(family.level), lessonId: family.lessonId, title: family.cue,
      items: items.map((x) => ({ lab, id: x.id, level: levelOf(x.level), lessonId: x.source_lesson_id, cue: x.rewrite_cue, instructionVi: x.instruction_vi, sourceSentenceEn: x.source_sentence_en })),
    };
    return set;
  }
  if (lab === "context") {
    const source = contextSource(id); if (!source) return null;
    const c = source.data;
    const questions = c.questions.map((q) => ({ id: q.id, type: q.type, promptVi: q.prompt_vi, optionsEn: [...q.options_en] }));
    const open: ContextItem["open"] = source.version === "m25"
      ? [{ id: source.data.transfer.id, kind: "transfer", promptVi: source.data.transfer.instruction_vi }]
      : source.version === "m25d"
        ? [
          { id: source.data.editing.id, kind: "edit", promptVi: source.data.editing.prompt_vi, draftEn: source.data.editing.draft_en ?? null },
          { id: source.data.diagnosis.id, kind: "diagnose", promptVi: source.data.diagnosis.prompt_vi },
          { id: source.data.transfer.id, kind: "transfer", promptVi: source.data.transfer.prompt_vi },
        ]
        : [
          { id: source.data.editing.id, kind: "edit", promptVi: source.data.editing.prompt_vi ?? "", draftEn: source.data.editing.draft_en ?? null },
          { id: source.data.transfer.id, kind: "transfer", promptVi: source.data.transfer.prompt_vi ?? "" },
        ];
    const item: ContextItem = { lab, id: c.id, level: levelOf(c.level), lessonId: c.lesson_id, title: lessonTitle(c.lesson_id), genre: c.genre, passageEn: c.passage_en, questions, open };
    return item;
  }
  const t = liveTask(id); if (!t) return null;
  const item: TransferItem = {
    lab: "transfer", id: t.id, level: levelOf(t.level), lessonId: t.lesson_id, mode: t.mode, stage: t.stage,
    titleVi: t.title_vi, promptVi: t.prompt_vi, sourceContextEn: t.source_context_en, preparationStepsVi: t.preparation_steps_vi,
    targetVi: t.target_vi, timeLengthVi: t.time_length_vi, rubric: t.rubric,
  };
  return item;
}

const choice = (questionId: string, correct: boolean, feedbackVi: string, extra: Partial<ChoiceGrade> = {}): ChoiceGrade => ({ kind: "choice", questionId, correct, feedbackVi, ...extra });

/** Returns null for a malformed answer or an item the gate does not release. */
export function gradeLab(lab: LabKind, id: string, questionId: string, answer: unknown): LabGrade | null {
  if (lab === "clinic") {
    const c = liveClinic(id); if (!c || typeof answer !== "number") return null;
    const r = checkClinicAnswer(c, questionId, answer); if (!r) return null;
    return choice(questionId, r.correct, r.feedbackVi, { correctOption: c.practice.find((q) => q.id === questionId)?.options_en[r.correctIndex] });
  }
  if (lab === "contrast") {
    const u = m23LiveUnit(id); if (!u || typeof answer !== "number") return null;
    const r = m23CheckChoice(u, questionId, answer); if (!r) return null;
    const q = u.practice.find((x) => x.id === questionId)!;
    return choice(questionId, r.matchTarget, r.feedbackVi, {
      correctOption: q.options_en[q.correct_index],
      noteVi: "Phương án còn lại có thể vẫn đúng ngữ pháp; ở đây chọn cách khớp nhất với ý người nói.",
    });
  }
  if (lab === "transform") {
    const item = m24LiveItem(questionId);
    if (!item || item.family_id !== id) return null;
    const r = m24Grade(item, answer); if (!r) return null;
    const grade: OpenGrade = { kind: "open", questionId, matchedReference: r.status === "MATCHED_REFERENCE", feedbackVi: r.messageVi, referenceEn: r.referenceAnswerEn, noteVi: r.explanationVi };
    return grade;
  }
  if (lab === "context") {
    const source = contextSource(id); if (!source) return null;
    const isChoice = source.data.questions.some((q) => q.id === questionId);
    if (isChoice) {
      if (source.version === "m25d") {
        const r = m25dGradeChoice(source.data, questionId, answer); if (!r) return null;
        return choice(questionId, r.status === "MATCHED_TARGET", r.selectedRationaleVi, { correctOption: r.referenceChoice, explanationVi: r.correctRationaleVi });
      }
      const r = source.version === "m25" ? m25GradeChoice(source.data, questionId, answer)
        : source.version === "m25b" ? m25bGradeChoice(source.data, questionId, answer)
          : m25cGradeChoice(source.data, questionId, answer);
      if (!r) return null;
      return choice(questionId, r.status === "MATCHED_TARGET", r.rationaleVi, { correctOption: r.correctOption, explanationVi: r.explanationForCorrectVi });
    }
    if (source.version === "m25") {
      const r = m25GradeTransfer(source.data, questionId, answer); if (!r) return null;
      return { kind: "open", questionId, matchedReference: false, feedbackVi: r.feedbackVi, rubricVi: r.rubricVi, referenceEn: null };
    }
    if (source.version === "m25d") {
      const r = m25dGradeOpen(source.data, questionId, answer); if (!r) return null;
      const slots = r.teacherErrorSlots.map((s) => `${s.wrong} → ${s.correct}: ${s.explanation_vi}`);
      return { kind: "open", questionId, matchedReference: r.matchedReferenceFormatting, feedbackVi: r.feedbackVi, rubricVi: [...r.rubricVi, ...slots], referenceEn: r.referenceEn };
    }
    const r = source.version === "m25b" ? m25bGradeOpen(source.data, questionId, answer) : m25cGradeOpen(source.data, questionId, answer);
    if (!r) return null;
    return { kind: "open", questionId, matchedReference: r.matchedReferenceFormatting, feedbackVi: r.feedbackVi, rubricVi: r.rubricVi, referenceEn: r.referenceEn, noteVi: r.noteVi };
  }
  const t = liveTask(id); if (!t || questionId !== t.id) return null;
  const r = reviewSubmission(t, answer); if (!r) return null;
  return { kind: "open", questionId, matchedReference: r.matchedReferenceText, feedbackVi: r.messageVi, referenceEn: r.referenceModelEn, rubricVi: r.rubric.map((x) => x.vi), noteVi: r.referenceCautionVi };
}

// ------------------------------------------------------------------ M21 diagnostic
export function diagnosticQuestions(level: GrammarLevel): DiagnosticQuestion[] {
  const bank = liveDiagnosticBank(level);
  if (!bank.ready) return [];
  const concepts = new Set(bank.items.map((x) => x.concept_id)).size;
  return selectDiagnostic(bank.items, level, Math.min(6, concepts)).map((x) => ({ id: x.id, conceptId: x.concept_id, prompt: x.prompt, options: x.options }));
}

export function gradeDiagnostic(level: GrammarLevel, answers: Record<string, unknown>, openLevels: readonly GrammarLevel[]): DiagnosticResult | null {
  const bank = liveDiagnosticBank(level);
  const byId = new Map(bank.items.map((x) => [x.id, x]));
  const ids = Object.keys(answers);
  if (!bank.ready || !ids.length || ids.length > 24 || ids.some((id) => !byId.has(id))) return null;
  if (Object.values(answers).some((x) => typeof x !== "number" || !Number.isInteger(x) || x < 0 || x > 2)) return null;
  const items = ids.map((id) => byId.get(id)!) as M21Item[];
  const result = scoreDiagnostic(items, answers as Record<string, number>, level);
  // suggestedReviewLessonIds holds only REVIEW_PRIORITY / MIXED concepts, so each may get its clinic.
  const clinicFor = (lessonId: string) => {
    const clinic = m22AllDraftClinics.find((c) => c.lesson_id === lessonId);
    const open = clinic && (clinic.level === "A1" || openLevels.includes(levelOf(clinic.level)));
    return clinic && open && liveClinic(clinic.id) ? clinic.id : null;
  };
  return {
    level, points: result.points, total: result.total, summaryVi: result.summary_vi,
    concepts: result.conceptResults.map((x) => ({ ...x, lessonId: x.conceptId.replace(/^GC-/, ""), title: lessonTitle(x.conceptId.replace(/^GC-/, "")) })),
    review: result.suggestedReviewLessonIds.map((lessonId) => ({
      lessonId, title: lessonTitle(lessonId),
      clinicId: clinicFor(lessonId),
    })),
    answers: items.map((x) => ({ id: x.id, correct: answers[x.id] === x.correct_index, correctOption: x.options[x.correct_index], rationaleVi: x.rationales_vi[answers[x.id] as number] ?? "" })),
  };
}
