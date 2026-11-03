export type Book2ScoredItem = {
  question_id: string;
  answer: { kind: string; accepted?: string[] };
};

const numberWords: Record<string, number> = {
  zero: 0, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10, eleven: 11, twelve: 12,
  thirteen: 13, fourteen: 14, fifteen: 15, sixteen: 16, seventeen: 17, eighteen: 18, nineteen: 19,
  twenty: 20, thirty: 30, forty: 40, fifty: 50, sixty: 60, seventy: 70, eighty: 80, ninety: 90,
};
const numberWord = `(?:${Object.keys(numberWords).join("|")}|hundred|thousand)`;
const numberPhrase = new RegExp(`\\b${numberWord}(?:[\\s-]+(?:${numberWord}|and(?=[\\s-]+${numberWord})))*\\b`, "g");

/**
 * Spoken numbers become digits: "forty-three" is 43, "three hundred and forty-five thousand" is 345000,
 * and "ten fifteen" stays two numbers, 10 15, so it matches the time 10:15.
 */
function spokenNumbers(phrase: string) {
  const numbers: number[] = [];
  let total = 0;
  let current: number | null = null;
  let last = "";
  for (const word of phrase.split(/[\s-]+/).filter((item) => item !== "and")) {
    if (word === "hundred") { current = (current ?? 1) * 100; last = "hundred"; continue; }
    if (word === "thousand") { total += (current ?? 1) * 1000; current = 0; last = "thousand"; continue; }
    const value = numberWords[word];
    const kind = value >= 20 && value % 10 === 0 ? "tens" : value >= 10 ? "teen" : "unit";
    const joins = current !== null && ((last === "tens" && kind === "unit") || last === "hundred" || last === "thousand");
    if (current !== null && !joins) { numbers.push(total + current); total = 0; current = null; }
    current = (current ?? 0) + value;
    last = kind;
  }
  if (current !== null || total) numbers.push(total + (current ?? 0));
  return numbers.join(" ");
}

/**
 * Ignores what IELTS markers do not penalise: case, accents, curly quotes, contractions, currency signs,
 * "per cent", a.m./p.m. spelling, numbers written as words, and Vietnamese-style 2,4 or 345.000.
 */
const normalize = (value: string) => value.normalize("NFD").replace(/[̀-ͯ]/g, "").toLocaleLowerCase()
  .replace(/[‘’`]/g, "'").replace(/[“”]/g, "\"")
  .replace(/\bwon't\b/g, "will not").replace(/\bcan't\b/g, "cannot").replace(/\bcan not\b/g, "cannot").replace(/n't\b/g, " not")
  .replace(/&/g, " and ").replace(/\s*per ?cent\b/g, "%").replace(/\s+%/g, "%").replace(/\b([ap])\.\s?m\b\.?/g, "$1m")
  .replace(/[£$€]/g, "").replace(numberPhrase, spokenNumbers)
  .replace(/(\d)[.,](?=\d{3}\b)/g, "$1").replace(/(\d)[.,:](?=\d)/g, "$1 ")
  .replace(/[;,]/g, " ").replace(/\s+/g, " ").trim().replace(/[.!?:]+$/g, "").trim();
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
