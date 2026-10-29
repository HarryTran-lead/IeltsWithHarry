export type CollocationEntry = {
  id: string;
  source_order: number;
  level: "A1" | "A2" | "B1" | "B2" | "C1" | "C2";
  phrase: string;
  meaning_vi: string;
  example_en: string;
  example_vi: string;
  note: string;
  qa_flags: string[];
};

export type CollocationProgress = {
  collocation_id: string;
  first_seen_at: string;
  last_reviewed_at: string;
  due_at: string;
  interval_days: number;
  repetitions: number;
  correct_count: number;
  wrong_count: number;
  last_grade: "again" | "hard" | "good" | "easy";
};

export type CollocationSuggestion = { entry: CollocationEntry; reason: "due" | "new" };

/** Due cards lead, followed by unseen cards in stable source order. */
export function recommendCollocations(
  entries: CollocationEntry[],
  progress: CollocationProgress[],
  level: string,
  limit: number,
  now = new Date(),
  excluded = new Set<string>(),
): CollocationSuggestion[] {
  const byId = new Map(progress.map((item) => [item.collocation_id, item]));
  const eligible = entries.filter((entry) => (level === "all" || entry.level === level) && !excluded.has(entry.id));
  const due = eligible.filter((entry) => {
    const row = byId.get(entry.id);
    return row && new Date(row.due_at).getTime() <= now.getTime();
  }).sort((a, b) => {
    const left = byId.get(a.id)!;
    const right = byId.get(b.id)!;
    return new Date(left.due_at).getTime() - new Date(right.due_at).getTime()
      || right.wrong_count - left.wrong_count || a.source_order - b.source_order;
  }).map((entry): CollocationSuggestion => ({ entry, reason: "due" }));
  const fresh = eligible.filter((entry) => !byId.has(entry.id))
    .sort((a, b) => a.source_order - b.source_order)
    .map((entry): CollocationSuggestion => ({ entry, reason: "new" }));
  return [...due, ...fresh].slice(0, limit);
}

export function nextCollocationProgress(
  entryId: string,
  previous: CollocationProgress | undefined,
  grade: "again" | "hard" | "good" | "easy",
  now = new Date(),
): CollocationProgress {
  const interval = grade === "again" ? 0 : grade === "hard" ? 1
    : grade === "good" ? Math.max(2, Math.round((previous?.interval_days || 1) * 2.2))
      : Math.max(4, Math.round((previous?.interval_days || 1) * 3.5));
  const due = new Date(now.getTime() + (interval || 1 / 24) * 86_400_000);
  return {
    collocation_id: entryId,
    first_seen_at: previous?.first_seen_at ?? now.toISOString(),
    last_reviewed_at: now.toISOString(),
    due_at: due.toISOString(),
    interval_days: interval,
    repetitions: (previous?.repetitions ?? 0) + 1,
    correct_count: (previous?.correct_count ?? 0) + (grade === "again" ? 0 : 1),
    wrong_count: (previous?.wrong_count ?? 0) + (grade === "again" ? 1 : 0),
    last_grade: grade,
  };
}
