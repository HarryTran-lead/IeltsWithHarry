export const catalogSkills = ["Reading", "Listening", "Writing", "Speaking"] as const;
export type CatalogSkill = (typeof catalogSkills)[number];

export const catalogGroups: Record<CatalogSkill, { id: string; label: string; detail: string }[]> = {
  Reading: [
    { id: "passage", label: "Bài đọc lẻ", detail: "Luyện từng bài đọc và xem đáp án" },
    { id: "full_test", label: "Bộ Reading đầy đủ", detail: "Ba bài đọc trong một lượt làm" },
  ],
  Listening: [
    { id: "part", label: "Luyện từng phần", detail: "Nghe và trả lời theo từng phần" },
    { id: "full_test", label: "Bộ Listening đầy đủ", detail: "Bốn phần nghe có âm thanh" },
  ],
  Writing: [
    { id: "task1_academic", label: "Task 1 · Academic", detail: "Biểu đồ, bảng, quy trình và bản đồ" },
    { id: "task1_general", label: "Task 1 · General Training", detail: "Viết thư theo tình huống" },
    { id: "task2", label: "Task 2 · Essay", detail: "Viết luận và trình bày quan điểm" },
  ],
  Speaking: [
    { id: "part1", label: "Part 1", detail: "Câu hỏi về bản thân và cuộc sống" },
    { id: "part2", label: "Part 2", detail: "Cue card và chuẩn bị ý" },
    { id: "part3", label: "Part 3", detail: "Thảo luận mở rộng" },
  ],
};

export type CatalogExam = {
  id: string;
  title: string;
  skill: CatalogSkill;
  practice_type: string;
  format: string;
  duration_minutes: number;
  attribution: string;
  license: string;
  ai_generated: boolean;
  created_at: string;
  topic?: string | null;
  difficulty?: string | null;
  source_id?: string;
  published_version_id?: string;
  /** Card details from ielts_catalog_summary; absent when the summary is unavailable. */
  question_types?: string[];
  question_count?: number;
  task_type?: string | null;
  visual_kind?: string | null;
  visual?: Record<string, unknown> | null;
  image_url?: string | null;
  prompt_preview?: string | null;
  question_preview?: string[];
  attempt_count?: number;
  /** Published full test sections, without passage text or answer keys. */
  sections?: { title: string; question_types: string[]; question_count: number }[];
};

type CatalogSummary = Pick<CatalogExam, "question_types" | "question_count" | "task_type" | "visual_kind" | "visual" | "image_url" | "prompt_preview" | "question_preview" | "attempt_count"> & { exam_id: string };

/** Adds the card details to each exam that has a summary row. */
export function withSummaries(exams: CatalogExam[], summaries: CatalogSummary[]) {
  const byId = new Map(summaries.map(({ exam_id, ...summary }) => [exam_id, summary]));
  return exams.map((exam) => ({ ...exam, ...byId.get(exam.id) }));
}

export type CatalogSectionEntry = { exam: CatalogExam; part?: number; splitFromFull?: boolean; title: string; questionTypes: string[]; questionCount: number };

export const catalogQuestionTypes = [
  { id: "headings", label: "Matching Headings", test: /matching[_-]headings/ },
  { id: "tfng", label: "True - False - Not Given", test: /true[_-]false/ },
  { id: "ynng", label: "Yes - No - Not Given", test: /yes[_-]no/ },
  { id: "mc_one", label: "Multiple Choice (One Answer)", test: /^multiple[_-]choice(?:[_-]single[_-]answer)?$/ },
  { id: "information", label: "Matching Information", test: /matching[_-]information/ },
  { id: "features", label: "Matching Features", test: /matching[_-]features/ },
  { id: "mc_many", label: "Multiple Choice (Many Answers)", test: /multiple.*answers/ },
  { id: "labels", label: "Map, Diagram Label", test: /(map|plan|diagram)[_-]labelling/ },
  { id: "gaps", label: "Gap Filling", test: /(sentence|summary|note|table|flow[_-]?chart|flowchart|form)[_-]completion|short[_-]answer/ },
  { id: "matching", label: "Matching", test: /^matching$|matching[_-]sentence[_-]endings/ },
] as const;

export function catalogQuestionTypeIds(types: string[]): string[] {
  return [...new Set(types.map((type) => catalogQuestionTypes.find((group) => group.test.test(type))?.id ?? "other"))];
}

/** Expose only card metadata; answer keys and passage text stay on the exam endpoint. */
export function sectionSummaries(content: { sections?: { title?: string; questions?: ({ type?: string } & Record<string, unknown>)[] }[] }): NonNullable<CatalogExam["sections"]> {
  return (content.sections ?? []).map((section) => ({
    title: section.title ?? "",
    question_types: [...new Set((section.questions ?? []).map((question) => question.type).filter((type): type is string => Boolean(type)))],
    question_count: section.questions?.length ?? 0,
  }));
}

export function catalogSectionEntries(exams: CatalogExam[], skill: "Reading" | "Listening"): CatalogSectionEntry[] {
  const singleType = skill === "Reading" ? "passage" : "part";
  const limit = skill === "Reading" ? 3 : 4;
  return exams.flatMap((exam) => {
    if (exam.practice_type === singleType) {
      const match = exam.title.match(/\b(?:passage|section|part)\s*([1-4])\b/i);
      return [{ exam, part: match ? Number(match[1]) : undefined, title: exam.title, questionTypes: exam.question_types ?? [], questionCount: exam.question_count ?? 0 }];
    }
    if (exam.practice_type !== "full_test") return [];
    return (exam.sections ?? []).slice(0, limit).flatMap((section, index) => section.question_count ? [{
      exam, part: index + 1, splitFromFull: true,
      title: /^(?:reading\s+)?passage\s*\d+\s*$|^(?:listening\s+)?(?:section|part)\s*\d+\s*$/i.test(section.title) ? exam.title : section.title,
      questionTypes: section.question_types,
      questionCount: section.question_count,
    }] : []);
  });
}

export function catalogEntriesForSelection(exams: CatalogExam[], skill: "Reading" | "Listening", full: boolean, part: number): CatalogSectionEntry[] {
  if (!full) return catalogSectionEntries(exams, skill).filter((entry) => !part || entry.part === part);
  return exams.filter((exam) => exam.practice_type === "full_test").map((exam) => ({
    exam,
    title: exam.title,
    questionTypes: exam.question_types?.length ? exam.question_types : [...new Set((exam.sections ?? []).flatMap((section) => section.question_types))],
    questionCount: exam.question_count ?? (exam.sections ?? []).reduce((sum, section) => sum + section.question_count, 0),
  }));
}

export function balancedCatalog<T extends { practice_type: string }>(items: T[], groupIds: readonly string[]): T[] {
  const buckets = groupIds.map((id) => items.filter((item) => item.practice_type === id));
  const other = items.filter((item) => !groupIds.includes(item.practice_type));
  if (other.length) buckets.push(other);
  const result: T[] = [];
  for (let row = 0; result.length < items.length; row++) {
    for (const bucket of buckets) if (row < bucket.length) result.push(bucket[row]);
  }
  return result;
}

/** The skill page holds that skill's question-bank library; `type` preselects a practice type. */
export function catalogHref(skill: CatalogSkill, type?: string) {
  return `/app/${skill.toLowerCase()}${type ? `?type=${encodeURIComponent(type)}` : ""}`;
}
