import source from "./catalog.json";

export type VocabularyTerm = {
  id: string;
  word: string;
  ipa: string;
  pos: string;
  meaning: string;
  level: string;
  topic: string;
  collocations: string[];
  synonyms: string;
  example: string;
  vi: string;
};

export const catalog: VocabularyTerm[] = source;
export const topics = ["Education", "Technology", "Environment", "Business", "Health", "Daily Life"] as const;

export function normalizeWord(word: string) {
  return word.trim().replace(/\s+/g, " ").toLocaleLowerCase("en");
}

export function findTerm(word: string): VocabularyTerm | undefined {
  return catalog.find((term) => normalizeWord(term.word) === normalizeWord(word));
}

export function filterTerms(terms: VocabularyTerm[], level: string, topic: string) {
  return terms.filter((term) => (level === "all" || term.level === level) && (topic === "all" || term.topic === topic));
}

export type VocabularyQuestion = {
  word: string;
  prompt: string;
  options: string[];
  answer: number;
  explanation: string;
};

function shuffle<T>(values: T[], random: () => number): T[] {
  const result = [...values];
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

export function makeQuiz(terms: VocabularyTerm[], random: () => number = Math.random): VocabularyQuestion[] {
  const unique = [...new Map(terms.map((term) => [normalizeWord(term.word), term])).values()];
  if (unique.length < 4) return [];
  const usable = unique.filter((term) => unique.filter((other) => other.meaning !== term.meaning).length >= 3);
  return shuffle(usable, random).slice(0, 5).map((term, index) => {
    const kind = index % 3;
    const isCollocation = kind === 2 && term.collocations.length > 0 && unique.filter((other) => other.id !== term.id && other.collocations.length > 0).length >= 3;
    const answerText = isCollocation ? term.collocations[0] : kind === 1 ? term.word : term.meaning;
    const candidates = unique.filter((other) => other.id !== term.id).map((other) => isCollocation ? other.collocations[0] : kind === 1 ? other.word : other.meaning);
    const options = shuffle([answerText, ...shuffle([...new Set(candidates.filter(Boolean).filter((value) => value !== answerText))], random).slice(0, 3)], random);
    return {
      word: term.word,
      prompt: isCollocation ? `Cụm từ nào đi với “${term.word}”?` : kind === 1 ? `Từ tiếng Anh của “${term.meaning}” là gì?` : `“${term.word}” có nghĩa là gì?`,
      options,
      answer: options.indexOf(answerText),
      explanation: isCollocation ? `Cụm từ trong bộ từ: ${answerText}.` : `${term.word}: ${term.meaning}. ${term.example}`,
    };
  }).filter((question) => question.options.length === 4);
}

export function quizScore(questions: VocabularyQuestion[], answers: number[]) {
  return questions.reduce((score, question, index) => score + Number(answers[index] === question.answer), 0);
}
