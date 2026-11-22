/*
 * Reading Lab on the shared self-study path. The M08 set comes in groups of four: three practice lessons and a
 * short checkpoint, eight times over, then four full tests. Each group is a chặng; its checkpoint is the stage's
 * end check (70% opens the next stage). Inside a lesson, each Passage is one step; a full test is one step.
 * Progress is the learner's best score per Passage, saved as practice results under `reading-lab:v1:<id>:p<n>`.
 */
import type { PathCourse, PathProgress, PathStage } from "@/lib/self-study-path/path";
import type { ReadingLabSummary } from "./types";

export const READING_BASE = "/app/reading/lab";
export const READING_PREFIX = "reading-lab:v1:";

export type PassageResult = { correct: number; checked: number; total: number };

/** The saved result of one Passage (0-based), e.g. reading-lab:v1:M08_02:p1. */
export const passageSlug = (id: string, index: number) => `${READING_PREFIX}${id}:p${index + 1}`;

type StagePlan = { id: string; title: string; about: string; lessons: string[]; check?: string };

const milestones = (from: number, to: number) => Array.from({ length: to - from + 1 }, (_, index) => `M08_${String(from + index).padStart(2, "0")}`);

export const readingStages: StagePlan[] = [
  { id: "r1", title: "Làm quen đề Reading", about: "Đủ các dạng quen thuộc: trắc nghiệm, True/False/Not Given, nối tiêu đề, điền câu.", lessons: milestones(2, 4), check: "M08_05" },
  { id: "r2", title: "Ý kiến và lập luận", about: "Trắc nghiệm, True/False/Not Given và Yes/No/Not Given: tách ý tác giả khỏi ý người khác.", lessons: milestones(6, 8), check: "M08_09" },
  { id: "r3", title: "Nghiên cứu và cách giải thích", about: "Bài về thí nghiệm, khảo sát: đọc kỹ kết luận, giới hạn và cách giải thích khác.", lessons: milestones(10, 12), check: "M08_13" },
  { id: "r4", title: "Hệ thống và hệ quả", about: "Bài về hạ tầng, môi trường: lần theo nguyên nhân – kết quả qua nhiều đoạn.", lessons: milestones(14, 16), check: "M08_17" },
  { id: "r5", title: "Các dạng nối (Matching)", about: "Nối tiêu đề, nối thông tin với đoạn, nối đặc điểm và nối nửa câu.", lessons: milestones(18, 20), check: "M08_21" },
  { id: "r6", title: "Số liệu và cách đo", about: "Bài xoay quanh tỉ lệ, mẫu số, cách đo: bắt đúng con số và điều kiện đi kèm.", lessons: milestones(22, 24), check: "M08_25" },
  { id: "r7", title: "Điền từ và sơ đồ", about: "Note, table, flow-chart, summary completion và diagram labelling.", lessons: milestones(26, 28), check: "M08_29" },
  { id: "r8", title: "Tổng hợp mọi dạng", about: "Trộn các dạng câu hỏi như đề thật, thời gian ngắn dần.", lessons: milestones(30, 32), check: "M08_33" },
  { id: "r9", title: "Full test", about: "Đề hoàn chỉnh 3 Passage · 40 câu · 60 phút, làm liền một mạch như phòng thi.", lessons: milestones(34, 37) },
];

const roles: Record<string, string> = {
  guided: "Làm quen", independent: "Tự làm", mastery: "Nâng cao", practice: "Luyện tập", checkpoint: "Kiểm tra cuối chặng",
};

/** "IELTS Reading M08.03 — independent" → "Tự làm"; "IELTS Reading Full Test B — M08.35" → "Full test B". */
export function lessonName(summary: Pick<ReadingLabSummary, "title" | "fullTest">) {
  const full = summary.title.match(/Full Test\s+([A-Z])/i);
  if (full) return `Full test ${full[1].toUpperCase()}`;
  const role = summary.title.match(/—\s*([a-z]+)\s*$/i)?.[1]?.toLowerCase() ?? "";
  return roles[role] ?? summary.title;
}

export const lessonMeta = (summary: ReadingLabSummary) => `${summary.sections} Passage · ${summary.questions} câu · ${summary.minutes} phút`;

/** How a lesson is worked through: one step per Passage, or the whole full test at once. */
export const lessonSteps = (summary: Pick<ReadingLabSummary, "sections" | "fullTest">) => summary.fullTest ? 1 : summary.sections;

export function stageOf(id: string) {
  const index = readingStages.findIndex((stage) => stage.lessons.includes(id) || stage.check === id);
  return index < 0 ? null : { stage: readingStages[index], index };
}

export function readingCourse(catalog: ReadingLabSummary[]): PathCourse {
  const byId = new Map(catalog.map((item) => [item.id, item]));
  const stages: PathStage[] = [];
  for (const plan of readingStages) {
    const lessons = plan.lessons.flatMap((id) => {
      const summary = byId.get(id);
      return summary ? [{
        id, title: lessonName(summary), meta: lessonMeta(summary), minutes: summary.minutes,
        goal: summary.passages?.length ? summary.passages.join(" · ") : undefined, href: `${READING_BASE}/${id}`,
      }] : [];
    });
    if (!lessons.length) continue;
    const check = plan.check ? byId.get(plan.check) : undefined;
    stages.push({
      id: plan.id, title: plan.title, about: plan.about, lessons,
      checkpoint: check ? { title: `Kiểm tra cuối chặng · ${check.sections} Passage`, href: `${READING_BASE}/${check.id}` } : undefined,
    });
  }
  return {
    lab: "reading", name: "Reading", base: READING_BASE, stepCount: 3, stages,
    steps: [
      "Đọc lướt: nắm ý chính từng đoạn trước khi làm câu hỏi",
      "Làm câu hỏi: tự làm, chưa xem đáp án",
      "Nộp từng Passage để chấm ngay",
      "Xem lời giải 5 bước song ngữ cho từng câu",
      "Đối chiếu dẫn chứng được tô sáng trong bài đọc",
    ],
  };
}

/** Best results of a lesson's Passages, summed; `complete` once every Passage (or the full test) was submitted. */
export function lessonScore(summary: ReadingLabSummary, results: Record<string, PassageResult>) {
  const parts = Array.from({ length: summary.sections }, (_, index) => results[passageSlug(summary.id, index)]).filter((item) => item && item.checked > 0);
  const submitted = parts.length;
  const correct = parts.reduce((sum, item) => sum + item.correct, 0);
  const total = parts.reduce((sum, item) => sum + item.total, 0);
  return { submitted, complete: submitted === summary.sections, correct, total };
}

export function readingProgress(catalog: ReadingLabSummary[], results: Record<string, PassageResult>): PathProgress {
  const progress: PathProgress = { lessons: {}, checkpoints: {} };
  const byId = new Map(catalog.map((item) => [item.id, item]));
  for (const plan of readingStages) {
    for (const id of plan.lessons) {
      const summary = byId.get(id);
      if (!summary) continue;
      const score = lessonScore(summary, results);
      if (!score.submitted) continue;
      const mistakes = score.total - score.correct;
      progress.lessons[id] = score.complete
        ? { done: true, right: score.correct, total: score.total, mistakes }
        : { step: score.submitted, right: score.correct, total: score.total, mistakes, note: `Đã nộp ${score.submitted}/${summary.sections} Passage` };
    }
    const check = plan.check ? byId.get(plan.check) : undefined;
    if (check) {
      const score = lessonScore(check, results);
      if (score.complete && score.total) progress.checkpoints[plan.id] = score.correct / score.total;
    }
  }
  return progress;
}
