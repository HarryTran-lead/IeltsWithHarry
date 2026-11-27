import "server-only";
import { withTeaching } from "./teaching";
import type { GrammarLevel } from "./types";
import { normalizeGuide, normalizeItem, wrongFeedback, type SourceLesson, type SourceQuestion } from "./normalize";

const loaders = {
  A1: () => import("@/data/grammar-editorial/A1.json"),
  A2: () => import("@/data/grammar-editorial/A2.json"),
  B1: () => import("@/data/grammar-editorial/B1.json"),
  B2: () => import("@/data/grammar-editorial/B2.json"),
  C1: () => import("@/data/grammar-editorial/C1.json"),
  C2: () => import("@/data/grammar-editorial/C2.json"),
};

function codeLevel(code: string): GrammarLevel | null {
  const match = /^(A1|A2|B1|B2|C1|C2)-\d{2}$/.exec(code);
  return match ? match[1] as GrammarLevel : null;
}

export async function loadEditorialLesson(code: string) {
  const level = codeLevel(code);
  if (!level) return null;
  const levelData = (await loaders[level]()).default as unknown as Record<string, { lesson: SourceLesson; questions: SourceQuestion[] }>;
  return levelData[code] ?? null;
}

export function publicEditorialLesson(source: NonNullable<Awaited<ReturnType<typeof loadEditorialLesson>>>) {
  return { guide: withTeaching(normalizeGuide(source.lesson)), items: source.questions.map(normalizeItem) };
}

function normalizeAnswer(value: string, grading: Record<string, unknown> = {}) {
  let result = value.trim().replace(/\s+/g, " ");
  result = result.replace(/\s*—\s*/g, "—");
  if (grading.normalize_apostrophes !== false && grading.normalise_apostrophes !== false) {
    result = result.replace(/[‘’ʼ`]/g, "'");
  }
  if (grading.ignore_final_punctuation !== false && grading.ignore_terminal_punctuation !== false) {
    result = result.replace(/[.!?。]+$/u, "").trim();
  }
  if (grading.case_insensitive !== false && grading.ignore_case !== false) result = result.toLocaleLowerCase("en");
  return result;
}

const CONTRACTION_PAIRS: readonly [string, string][] = [
  ["is not", "isn't"],
  ["are not", "aren't"],
  ["was not", "wasn't"],
  ["were not", "weren't"],
  ["do not", "don't"],
  ["does not", "doesn't"],
  ["did not", "didn't"],
  ["have not", "haven't"],
  ["has not", "hasn't"],
  ["had not", "hadn't"],
  ["will not", "won't"],
  ["would not", "wouldn't"],
  ["cannot", "can't"],
  ["can not", "can't"],
  ["could not", "couldn't"],
  ["should not", "shouldn't"],
  ["must not", "mustn't"],
  ["i am", "i'm"],
  ["you are", "you're"],
  ["he is", "he's"],
  ["she is", "she's"],
  ["it is", "it's"],
  ["we are", "we're"],
  ["they are", "they're"],
];

const CLOSED_GRAMMAR_WORDS = new Set([
  "i", "you", "he", "she", "it", "we", "they", "me", "him", "her", "us", "them",
  "my", "your", "his", "its", "our", "their", "mine", "yours", "hers", "ours", "theirs",
  "myself", "yourself", "himself", "herself", "itself", "ourselves", "yourselves", "themselves",
  "this", "that", "these", "those", "there", "not", "no", "none",
  "a", "an", "the", "some", "any", "much", "many", "few", "little", "each", "every", "both", "either", "neither",
  "am", "is", "are", "was", "were", "be", "been", "being",
  "do", "does", "did", "done", "doing", "have", "has", "had", "having",
  "will", "would", "can", "cannot", "could", "shall", "should", "may", "might", "must",
  "who", "whom", "whose", "which", "where", "when", "why", "what", "how",
  "in", "on", "at", "to", "for", "from", "with", "by", "about", "into", "onto", "under", "over",
  "between", "among", "since", "during", "until", "till", "before", "after", "while", "as",
  "although", "though", "because", "so", "but", "and", "or", "if", "unless", "whether", "despite", "however", "therefore", "moreover", "whereas",
]);

const OPEN_TIME_NOUNS = new Set(["night", "evening", "morning", "afternoon", "week", "month", "year", "day", "weekend", "summer", "winter", "spring", "autumn"]);

const IRREGULAR_GROUPS = [
  ["buy", "bought"], ["eat", "ate", "eaten"], ["go", "went", "gone"], ["take", "took", "taken"],
  ["see", "saw", "seen"], ["write", "wrote", "written"], ["make", "made"], ["break", "broke", "broken"],
  ["know", "knew", "known"], ["give", "gave", "given"], ["speak", "spoke", "spoken"], ["bring", "brought"],
  ["think", "thought"], ["catch", "caught"], ["teach", "taught"], ["find", "found"], ["send", "sent"],
  ["build", "built"], ["spend", "spent"], ["leave", "left"], ["keep", "kept"], ["meet", "met"],
  ["choose", "chose", "chosen"], ["drive", "drove", "driven"], ["fall", "fell", "fallen"],
  ["forget", "forgot", "forgotten"], ["get", "got", "gotten"], ["grow", "grew", "grown"], ["hear", "heard"],
  ["lose", "lost"], ["pay", "paid"], ["run", "ran"], ["sell", "sold"], ["sing", "sang", "sung"],
  ["sit", "sat"], ["sleep", "slept"], ["stand", "stood"], ["swim", "swam", "swum"], ["tell", "told"],
  ["understand", "understood"], ["wear", "wore", "worn"], ["win", "won"], ["come", "came"], ["begin", "began", "begun"],
  ["drink", "drank", "drunk"], ["fly", "flew", "flown"], ["hold", "held"], ["put", "put"], ["read", "read"],
];
const IRREGULAR_MAP = new Map<string, string>();
for (const group of IRREGULAR_GROUPS) {
  for (const form of group) IRREGULAR_MAP.set(form, group[0]);
}

function expandContractions(candidates: string[]): string[] {
  const expanded = new Set(candidates);
  for (const candidate of candidates) {
    let lower = candidate.toLocaleLowerCase("en").replace(/[‘’ʼ`]/g, "'");
    for (const [full, short] of CONTRACTION_PAIRS) {
      const reFull = new RegExp(`\\b${full}\\b`, "gi");
      const reShort = new RegExp(`\\b${short.replace("'", "'")}\\b`, "gi");
      if (reFull.test(lower)) expanded.add(lower.replace(reFull, short));
      if (reShort.test(lower)) expanded.add(lower.replace(reShort, full));
    }
    lower = "";
  }
  return [...expanded];
}

function contentStem(word: string): string {
  const clean = word.toLocaleLowerCase("en").replace(/[‘’ʼ`]/g, "'").replace(/[^a-z']/g, "");
  if (!clean) return "";
  const base = clean.replace(/(?:n't|'m|'re|'s|'ve|'ll|'d)$/, "");
  if (CLOSED_GRAMMAR_WORDS.has(clean) || CLOSED_GRAMMAR_WORDS.has(base) || OPEN_TIME_NOUNS.has(base)) return "";
  if (IRREGULAR_MAP.has(base)) return IRREGULAR_MAP.get(base)!;
  if (base.length > 5 && base.endsWith("ied")) return `${base.slice(0, -3)}y`;
  if (base.length > 5 && base.endsWith("ing")) return base.slice(0, -3).replace(/([b-df-hj-np-tv-z])\1$/, "$1");
  if (base.length > 4 && base.endsWith("ed")) return base.slice(0, -2).replace(/([b-df-hj-np-tv-z])\1$/, "$1");
  if (base.length > 4 && base.endsWith("es")) return base.slice(0, -2);
  if (base.length > 3 && base.endsWith("s") && !base.endsWith("ss")) return base.slice(0, -1);
  return base;
}

function isClosedBlankSlot(question: SourceQuestion): boolean {
  if (/\([^)]+\)/.test(question.prompt_en)) return true;
  const tokens = question.correct_answer.toLocaleLowerCase("en").replace(/[‘’ʼ`]/g, "'").replace(/[.,!?]/g, "").trim().split(/\s+/).filter(Boolean);
  if (!tokens.length || tokens.length > 4) return false;
  return tokens.every((token) => {
    const stripped = token.replace(/(?:n't|'m|'re|'s|'ve|'ll|'d)$/, "");
    return CLOSED_GRAMMAR_WORDS.has(token) || (Boolean(stripped) && CLOSED_GRAMMAR_WORDS.has(stripped));
  });
}

function isSameLemmaGrammarMistake(targetAnswer: string, studentAnswer: string): boolean {
  const targetStems = new Set(targetAnswer.split(/\s+/).map(contentStem).filter((s) => s.length >= 3));
  if (!targetStems.size) return false;
  const studentStems = studentAnswer.split(/\s+/).map(contentStem).filter((s) => s.length >= 3);
  return studentStems.some((stem) => targetStems.has(stem) || [...targetStems].some((t) => (t.startsWith(stem) || stem.startsWith(t)) && Math.abs(t.length - stem.length) <= 1));
}

export function gradeEditorialAnswer(question: SourceQuestion, answer: string) {
  const response = normalizeAnswer(answer, question.grading);
  const baseAccepted = [question.correct_answer, ...(question.accepted_answers ?? [])];
  const fullSentenceCorrections = question.type === "error_correction" && /«[^»]+»/.test(question.prompt_en)
    ? baseAccepted.map((candidate) => question.prompt_en.replace(/«[^»]+»/, candidate))
    : [];
  const freeTextBlank = question.type === "fill_blank" || question.type === "fill";
  const accepted = freeTextBlank
    ? expandContractions([...baseAccepted, ...fullSentenceCorrections])
    : [...baseAccepted, ...fullSentenceCorrections];
  const isChoice = ["mcq", "error_choice"].includes(question.type);
  const validChoice = !isChoice || (question.options ?? []).some((option) => normalizeAnswer(option, question.grading) === response);
  const exactMatch = validChoice && accepted.some((candidate) => normalizeAnswer(candidate, question.grading) === response);
  // Closed grammar slots (pronouns, auxiliaries, prepositions, parenthetical cues) and same-lemma
  // tense/inversion errors are graded automatically; open-ended phrase slots keep self-review.
  const autoRejectBlank = freeTextBlank && !exactMatch && (isClosedBlankSlot(question) || isSameLemmaGrammarMistake(question.correct_answer, response));
  const correct = question.auto_gradable === false || question.auto_gradable == null
    ? null
    : freeTextBlank && !exactMatch && !autoRejectBlank ? null : exactMatch;
  return {
    correct,
    referenceAnswer: question.correct_answer,
    explanation: question.explanation_correct_vi ?? "",
    feedback: freeTextBlank && correct === null && question.auto_gradable === true
      ? "Câu điền cụm từ có thể có cách diễn đạt tương đương. Hãy so sánh câu của bạn với đáp án tham khảo và nghĩa tiếng Việt, rồi tự đánh giá."
      : correct === false ? wrongFeedback(question, answer) : "",
    errorTag: correct === false ? question.error_tag ?? null : null,
    publishable: question.publishable,
  };
}
