export type ListeningWord = {
  id: string;
  source_order: number;
  topic_id: number;
  topic_en: string;
  topic_vi: string;
  subtopic: string;
  word: string;
  meaning_vi: string;
  ipa_us_approx: string;
  example_en: string;
  example_vi: string;
  listening_paraphrase: string;
  listening_note: string;
  source_type: "Trong ảnh" | "Bổ sung";
  level_label: "Core" | "IELTS Listening";
};

export type ListeningProgress = {
  entry_id: string;
  first_seen_at: string;
  last_reviewed_at: string;
  due_at: string;
  interval_days: number;
  repetitions: number;
  correct_count: number;
  wrong_count: number;
  last_grade: "again" | "hard" | "good" | "easy";
};

export type ListeningSuggestion = { entry: ListeningWord; reason: "due" | "new" };

export function suggestListeningWords(
  words: ListeningWord[], progress: ListeningProgress[], topicId: number | null,
  level: string, limit: number, now: Date, excluded = new Set<string>(),
): ListeningSuggestion[] {
  const byId = new Map(progress.map((row) => [row.entry_id, row]));
  const scope = words.filter((row) => (topicId === null || row.topic_id === topicId)
    && (level === "all" || row.level_label === level) && !excluded.has(row.id));
  const due = scope.filter((row) => {
    const state = byId.get(row.id);
    return state && new Date(state.due_at).getTime() <= now.getTime();
  }).sort((a, b) => new Date(byId.get(a.id)!.due_at).getTime() - new Date(byId.get(b.id)!.due_at).getTime()
    || byId.get(b.id)!.wrong_count - byId.get(a.id)!.wrong_count || a.source_order - b.source_order);
  const fresh = scope.filter((row) => !byId.has(row.id)).sort((a, b) => a.source_order - b.source_order);
  return [...due.map((entry): ListeningSuggestion => ({ entry, reason: "due" })),
    ...fresh.map((entry): ListeningSuggestion => ({ entry, reason: "new" }))].slice(0, limit);
}

export function nextListeningProgress(
  entryId: string, previous: ListeningProgress | undefined,
  grade: ListeningProgress["last_grade"], now = new Date(),
): ListeningProgress {
  const interval = grade === "again" ? 0 : grade === "hard" ? 1
    : grade === "good" ? Math.max(2, Math.round((previous?.interval_days || 1) * 2.2))
      : Math.max(4, Math.round((previous?.interval_days || 1) * 3.5));
  return {
    entry_id: entryId,
    first_seen_at: previous?.first_seen_at ?? now.toISOString(),
    last_reviewed_at: now.toISOString(),
    due_at: new Date(now.getTime() + (interval || 1 / 24) * 86_400_000).toISOString(),
    interval_days: interval,
    repetitions: (previous?.repetitions ?? 0) + 1,
    correct_count: (previous?.correct_count ?? 0) + (grade === "again" ? 0 : 1),
    wrong_count: (previous?.wrong_count ?? 0) + (grade === "again" ? 1 : 0),
    last_grade: grade,
  };
}

function hash(text: string): number {
  let value = 2166136261;
  for (const character of text) value = Math.imul(value ^ character.charCodeAt(0), 16777619);
  return value >>> 0;
}

/** Stable distractors, favouring the same topic and never repeating a meaning. */
export function listeningChoices(word: ListeningWord, all: ListeningWord[]): ListeningWord[] {
  const chosen = [word];
  const meanings = new Set([word.meaning_vi.trim().toLocaleLowerCase()]);
  const candidates = all.filter((row) => row.id !== word.id)
    .sort((a, b) => Number(b.topic_id === word.topic_id) - Number(a.topic_id === word.topic_id)
      || hash(`${word.id}:${a.id}`) - hash(`${word.id}:${b.id}`));
  for (const candidate of candidates) {
    const key = candidate.meaning_vi.trim().toLocaleLowerCase();
    if (meanings.has(key)) continue;
    chosen.push(candidate); meanings.add(key);
    if (chosen.length === 4) break;
  }
  return chosen.sort((a, b) => hash(`${word.id}:${a.id}:position`) - hash(`${word.id}:${b.id}:position`));
}

export function normalizeListeningAnswer(value: string): string {
  return value.normalize("NFKC").toLocaleLowerCase().replace(/[.,!?;:]/g, "").trim().replace(/\s+/g, " ");
}
