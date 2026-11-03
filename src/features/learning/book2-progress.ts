export type Book2ScoredItem = {
  question_id: string;
  answer: { kind: string; accepted?: string[] };
};

const normalize = (value: string) => value.trim().toLocaleLowerCase().replace(/[.,!?]+$/g, "").replace(/\s+/g, " ");

export function book2AnswerCorrect(item: Book2ScoredItem, value: string) {
  return (item.answer.accepted ?? []).some((key) => normalize(key) === normalize(value));
}

export function requiredBook2WritingWords(itemType: string, prompt: string, lessonSlug: string) {
  if (itemType !== "open_writing") return 0;
  if (/\b250\b/.test(prompt) || /^b2-u(?:05|06|08)-w-l04$/.test(lessonSlug)) return 250;
  if (/\b150\b/.test(prompt) || /summaris[ez] (?:the (?:main features|information)|.*(?:main features|make comparisons))/i.test(prompt)) return 150;
  return 0;
}

export function evaluateBook2Progress<T extends Book2ScoredItem>(
  questions: T[],
  answers: Record<string, string>,
  checked: Record<string, boolean>,
  ratings: Record<string, number>,
) {
  const objective = questions.filter((item) => item.answer.kind === "objective");
  const open = questions.filter((item) => item.answer.kind !== "objective");
  const objectiveChecked = objective.filter((item) => checked[item.question_id]);
  const objectiveCorrect = objectiveChecked.filter((item) => book2AnswerCorrect(item, answers[item.question_id] ?? ""));
  const openReviewed = open.filter((item) => checked[item.question_id] && (ratings[item.question_id] ?? 0) > 0);
  const openReady = open.filter((item) => checked[item.question_id] && (ratings[item.question_id] ?? 0) >= 3);
  const completedCount = objectiveChecked.length + openReviewed.length;
  const mastered = questions.length > 0 && completedCount === questions.length
    && objectiveCorrect.length === objective.length && openReady.length === open.length;
  const needsReview = objectiveChecked.some((item) => !book2AnswerCorrect(item, answers[item.question_id] ?? ""))
    || openReviewed.some((item) => (ratings[item.question_id] ?? 0) < 3);
  const problems = questions.filter((item) => !checked[item.question_id]
    || (item.answer.kind === "objective"
      ? !book2AnswerCorrect(item, answers[item.question_id] ?? "")
      : (ratings[item.question_id] ?? 0) < 3));
  return { objective, open, objectiveCorrect, openReviewed, openReady, completedCount, mastered, needsReview, problems };
}
