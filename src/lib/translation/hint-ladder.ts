import type { PracticeExercise } from "./schema";

export type HintKind = "keyword" | "frame" | "grammar" | "letters";
export type Hint = { kind: HintKind; label: string; text: string; lang: "vi" | "en" };

/**
 * Grammar words stay visible in the sentence frame; content words become blanks.
 * The learner sees the structure (modal, connector, articles, prepositions) and
 * how many words each idea takes, but still has to choose every content word.
 */
const FUNCTION_WORDS = new Set(`
a an the this that these those some any each every no all both either neither another other such
i you he she it we they me him her us them my your his its our their mine yours hers ours theirs
myself yourself himself herself itself ourselves themselves there here one ones what which who whom whose
be am is are was were been being have has had having do does did done not no
can could may might must shall should will would ought need
to of in on at by for from with without about into onto over under between among through during
before after since until than as like per across along around behind beyond toward towards upon within
and or but nor so yet because although though if unless while whereas when where whether however
therefore moreover furthermore nevertheless instead also too only even still just rather than then
more most less least much many few little very quite too enough
don't doesn't didn't isn't aren't wasn't weren't hasn't haven't hadn't can't cannot couldn't won't
wouldn't shouldn't mustn't mightn't needn't it's that's there's i'm you're we're they're let's
`.trim().split(/\s+/));

const TOKEN = /[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu;

/** Lowercase words of the key term, so they stay visible like the hint before them. */
function termWords(term?: string) {
  return new Set((term ?? "").toLowerCase().match(TOKEN) ?? []);
}

function isKept(word: string, term: Set<string>) {
  const key = word.toLowerCase().replace(/’/g, "'");
  return FUNCTION_WORDS.has(key) || term.has(key) || /^\p{N}+$/u.test(word);
}

/** `Good urban planning can shorten commutes.` → `___ urban planning can ___ ___.` */
export function sentenceFrame(answer: string, term?: string) {
  const keep = termWords(term);
  return answer.replace(TOKEN, (word) => (isKept(word, keep) ? word : "___"));
}

/** Content words keep their first letter: `E________ urban planning can s______ …`. */
export function firstLetters(answer: string, term?: string) {
  const keep = termWords(term);
  return answer.replace(TOKEN, (word) => (isKept(word, keep) ? word : word[0] + word.slice(1).replace(/[\p{L}\p{N}]/gu, "_")));
}

function same(a: string, b: string) {
  return a.trim().toLowerCase() === b.trim().toLowerCase();
}

// Sentences of an exercise note that are generic advice or a wrong-translation example,
// not something to help write this sentence.
const GENERIC_NOTE = /^(Tự kiểm tra|Tự soát|Tự đối chiếu|Hãy đối chiếu|Kiểm tra chủ ngữ|Đây là (cụm từ|câu)|Lưu ý chấm|Bản dịch đúng|Các cách dịch|Ví dụ dịch chưa đạt|Giải thích: Sai)/;
const NOTE_LABEL = /^(Phân tích( cấu trúc| nghĩa và kỹ thuật| theo câu)?|Điểm cần nắm|Đối chiếu ý chính):\s*/;
const NOTE_STOPWORDS = new Set(["the", "and", "for", "but", "with", "that", "this", "are", "was", "has", "have"]);

/**
 * The exercise's own grammar note, trimmed to what helps write the sentence. Some
 * ESL notes state the unit's general rule rather than this sentence's, so a note is
 * kept only if it names a word of the model answer (or is a meaning caution for 7.0+).
 */
export function grammarNote(note: string, answer: string) {
  const sentences = note.split(/(?<=[.!?])\s+/).map((sentence) => sentence.trim()).filter(Boolean)
    .filter((sentence) => !GENERIC_NOTE.test(sentence)).map((sentence) => sentence.replace(NOTE_LABEL, ""));
  const text = sentences.slice(0, 2).join(" ");
  if (!text) return "";
  const answerWords = new Set((answer.toLowerCase().match(TOKEN) ?? []).filter((word) => word.length >= 3 && !NOTE_STOPWORDS.has(word)));
  const noteWords = text.toLowerCase().match(TOKEN) ?? [];
  return noteWords.some((word) => answerWords.has(word)) ? text : "";
}

/**
 * Hints in the order they open, from least to most help: key word, sentence frame,
 * the exercise's grammar note, then first letters. Each one is derived from the
 * model answer or the exercise's own note, so it cannot contradict the answer. A
 * hint that would equal the answer, or add nothing over the previous one, is skipped.
 */
export function hintLadder(item: Pick<PracticeExercise, "targetTerm" | "meaningVi" | "referenceAnswers" | "explanationVi" | "type">): Hint[] {
  const answer = item.referenceAnswers[0];
  const hints: Hint[] = [];
  if (item.targetTerm) hints.push({ kind: "keyword", label: "Từ khóa", text: `${item.targetTerm} · ${item.meaningVi ?? ""}`.trim(), lang: "vi" });

  const frame = sentenceFrame(answer, item.targetTerm);
  if (item.type !== "word" && frame.includes("___") && !same(frame, answer)) {
    hints.push({ kind: "frame", label: "Khung câu", text: frame, lang: "en" });
  }

  const note = grammarNote(item.explanationVi, answer);
  if (note && !item.referenceAnswers.some((reference) => note.includes(reference))) {
    hints.push({ kind: "grammar", label: "Điểm ngữ pháp", text: note, lang: "vi" });
  }

  const letters = firstLetters(answer, item.targetTerm);
  if (!same(letters, answer) && !same(letters, frame)) {
    hints.push({ kind: "letters", label: "Chữ cái đầu", text: letters, lang: "en" });
  }
  return hints;
}
