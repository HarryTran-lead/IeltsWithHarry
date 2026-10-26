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
};

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

export function catalogHref(skill: CatalogSkill, type?: string) {
  const query = new URLSearchParams({ skill });
  if (type) query.set("type", type);
  return `/app/question-bank?${query}`;
}
