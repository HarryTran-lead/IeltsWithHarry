export type Book2ScoredItem = {
  question_id: string;
  answer: { kind: string; accepted?: string[] };
};

/** Ignores case, accents, curly quotes, currency signs and "per cent" spelling, which IELTS markers do not penalise. */
const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase()
  .replace(/[‘’`]/g, "'").replace(/[“”]/g, "\"").replace(/&/g, " and ").replace(/\s*per ?cent\b/g, "%").replace(/\s+%/g, "%")
  .replace(/[£$€]/g, "").replace(/\s+/g, " ").trim().replace(/[.,!?;:]+$/g, "").trim();
/** A leading article does not change a short answer, so "the old harbour" matches "old harbour". */
const withoutArticle = (value: string) => normalize(value).replace(/^(?:a|an|the) /, "");

export function book2AnswerCorrect(item: Book2ScoredItem, value: string) {
  if (!value.trim()) return false;
  return (item.answer.accepted ?? []).some((key) => normalize(key) === normalize(value) || withoutArticle(key) === withoutArticle(value));
}

// Options whose order carries meaning: TRUE/FALSE/NOT GIVEN, paragraph or map letters, numbers, heading lists.
const fixedOrder = (options: string[]) => options.length < 3
  || options.every((option) => /^(?:[A-H]|[ivx]+|\d+|true|false|not given|yes|no|fact|opinion)$/i.test(option.trim()))
  || options.every((option) => /^[ivx]+\.\s/i.test(option.trim()));
// "Either", "Both" and similar always read as the last choice.
const lastChoice = /^(?:either|neither|both|all of the above|none of the above|they were equal)\b/i;

/**
 * The source puts four in five correct answers first or second, so ordinary multiple choice is shown
 * in a stable order shuffled by the question ID. Ordered sets keep the source order.
 */
export function book2OptionOrder(questionId: string, itemType: string, options: string[]) {
  if (itemType !== "multiple_choice" || fixedOrder(options)) return options;
  let seed = 2166136261;
  for (const char of questionId) seed = Math.imul(seed ^ char.charCodeAt(0), 16777619) >>> 0;
  const random = () => {
    seed = Math.imul(seed ^ (seed >>> 15), 2246822507) >>> 0;
    seed = Math.imul(seed ^ (seed >>> 13), 3266489909) >>> 0;
    return ((seed ^ (seed >>> 16)) >>> 0) / 4294967296;
  };
  const movable = options.filter((option) => !lastChoice.test(option));
  for (let index = movable.length - 1; index > 0; index--) {
    const swap = Math.floor(random() * (index + 1));
    [movable[index], movable[swap]] = [movable[swap], movable[index]];
  }
  return [...movable, ...options.filter((option) => lastChoice.test(option))];
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
