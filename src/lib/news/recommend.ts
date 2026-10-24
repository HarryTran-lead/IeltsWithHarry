export const NEWS_STAGE_ORDER = ["foundation", "elementary", "pre-ielts", "ielts-starter", "ielts-builder", "ielts-advanced", "mastery"] as const;

type Reading = { id: string; stage_id: string; category: string; created_at: string };
type Progress = { article_id: string; completed_at: string | null };
type Attempt = { article_id: string; score: number; total: number };
type Vocabulary = { article_id: string; word: string };

export function recommendReadings<T extends Reading>(
  readings: T[],
  preference: { stage_id: string | null; topics: string[] },
  progress: Progress[],
  latestAttempt: Attempt | null,
  vocabulary: Vocabulary[],
  savedWords: string[],
): T[] {
  const completed = new Set(progress.filter((item) => item.completed_at).map((item) => item.article_id));
  const recentReading = readings.find((item) => item.id === latestAttempt?.article_id);
  const recentIndex = NEWS_STAGE_ORDER.findIndex((stage) => stage === recentReading?.stage_id);
  const inferredStage = recentIndex < 0 ? null : NEWS_STAGE_ORDER[Math.max(0, Math.min(NEWS_STAGE_ORDER.length - 1, recentIndex + (latestAttempt!.score / Math.max(1, latestAttempt!.total) >= 0.8 ? 1 : latestAttempt!.score / Math.max(1, latestAttempt!.total) < 0.5 ? -1 : 0)))];
  const target = preference.stage_id ?? inferredStage;
  const knownWords = new Set(savedWords.map((word) => word.toLowerCase()));
  const relevantVocabulary = new Set(vocabulary.filter((item) => knownWords.has(item.word.toLowerCase())).map((item) => item.article_id));
  return [...readings].sort((a, b) => {
    const score = (item: T) =>
      (target && item.stage_id === target ? 8 : 0) +
      (preference.topics.includes(item.category) ? 5 : 0) +
      (!completed.has(item.id) ? 4 : 0) +
      (relevantVocabulary.has(item.id) ? 2 : 0) +
      (item.id === latestAttempt?.article_id && latestAttempt.score < latestAttempt.total ? 1 : 0);
    return score(b) - score(a) || Date.parse(b.created_at) - Date.parse(a.created_at);
  });
}
