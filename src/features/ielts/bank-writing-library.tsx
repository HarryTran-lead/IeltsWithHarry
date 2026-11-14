import type { CatalogExam } from "@/lib/ielts-bank/catalog";
import { displayExamTitle } from "@/lib/ielts-bank/display-title";
import type { StickerName } from "@/components/stickers/stickers";
import type { Attempt } from "./bank-library";

/**
 * What a Writing task is, for the library filters and cards: the task, its kind
 * (chart type, letter tone or essay type) and, for Task 2, its theme. The bank
 * stores none of these, so they are read from the title and question wording.
 */
type Option = { id: string; label: string; test: RegExp };

export const writingKinds: Record<string, string> = {
  line: "Line Graph", bar: "Bar Chart", pie: "Pie Chart", table: "Table", process: "Process", map: "Map", mixed: "Mixed Graph", chart: "Chưa rõ dạng biểu đồ", letter: "Letter", essay: "Essay",
};

export function writingKind(exam: Pick<CatalogExam, "practice_type" | "visual" | "visual_kind" | "task_type"> & Partial<Pick<CatalogExam, "title" | "prompt_preview">>) {
  if (exam.practice_type === "task2") return "essay";
  if (exam.practice_type === "task1_general") return "letter";
  const explicit = visualKind(String(exam.visual?.kind ?? exam.visual_kind ?? exam.task_type ?? ""));
  return explicit === "chart" ? visualKind(`${exam.title ?? ""} ${exam.prompt_preview ?? ""}`) : explicit;
}

export function visualKind(value: string) {
  const kind = value.toLowerCase().replace(/[_-]/g, " ");
  if (/\bmixed\b|\bcombined\b|\bmultiple\s+(?:charts|graphs)\b|\bpanel\b/.test(kind)) return "mixed";
  if (/\bline\s*(?:graph|chart)|\bline\b/.test(kind)) return "line";
  if (/\bbar\s*(?:graph|chart)|\bcolumn\s*(?:graph|chart)|\bbar\b/.test(kind)) return "bar";
  if (/\bpie\s*(?:graph|chart)|\bpie\b/.test(kind)) return "pie";
  if (/\btable\b/.test(kind)) return "table";
  if (/\bprocess\b|\bflow\s*chart\b|\bdiagram\b/.test(kind)) return "process";
  if (/\bmap\b|\bplan\b/.test(kind)) return "map";
  return "chart";
}


export const writingTasks = [
  { id: "task1_academic", label: "Task 1 · Academic", badge: "Task 1", minimum: 150 },
  { id: "task2", label: "Task 2 · Essay", badge: "Task 2", minimum: 250 },
] as const;

/** Task 2 question types, matched first on the title prefix and then on the prompt wording. */
const essayTypes: Option[] = [
  { id: "positive", label: "Positive or Negative Development", test: /positive\s+(?:or\s+)?negative/i },
  { id: "discussion", label: "Discussion", test: /\bdiscussion\b|discuss both/i },
  { id: "advantages", label: "Advantages and Disadvantages", test: /advantages?\s+(?:and\s+)?disadvantages?|adv\s+disadv|outweigh|drawbacks?/i },
  { id: "problem", label: "Causes, Problems and Solutions", test: /problems?\s+(?:and\s+)?solutions?|\bcauses?\b|measures? (?:could|should|can)|solve (?:this|these)/i },
  { id: "opinion", label: "Agree or Disagree", test: /agree|disagree|\bopinion\b|to what extent/i },
  { id: "two_part", label: "Two-Part Question", test: /two\s*part|direct\s+question/i },
];

const letterTones: Option[] = [
  { id: "semi", label: "Thư Semi-formal", test: /semi[\s-]?formal/i },
  { id: "informal", label: "Thư Informal", test: /\binformal\b|dear (?:mum|dad|[A-Z][a-z]+,)/i },
  { id: "formal", label: "Thư Formal", test: /\bformal\b|dear sir|dear madam|to whom it may concern/i },
];

/** Broad Task 2 themes, the way learners search for essay topics. */
const essayTopics: Option[] = [
  { id: "education", label: "Education", test: /educat|school|\bexams?\b|universit|student|teacher|\blearn|\bstud(?:y|ies)\b|curricul|homework/i },
  { id: "environment", label: "Environment", test: /environment|climate|pollut|\benergy|recycl|\bwaste|wildlife|plastic|carbon|global warming|natur/i },
  { id: "work", label: "Work and Careers", test: /\bwork|\bjobs?\b|career|employ|office|salar|workplace|retire/i },
  { id: "government", label: "Government & Crime", test: /government|crime|criminal|prison|\blaws?\b|police|\btax|politic|punish/i },
  { id: "technology", label: "Science and Technology", test: /technolog|internet|website|computer|scien|robot|phone|online|digital|artificial|social media/i },
  { id: "health", label: "Health", test: /health|medic|disease|obes|\bdiet|\bfood|exercise|\bsports?\b|hospital|doctor|fitness/i },
  { id: "media", label: "Media & Entertainment", test: /\bmedia|advert|television|\btv\b|\bfilms?\b|\bmusic|\barts?\b|\bnews|entertain|celebrit|\bgames?\b|museum/i },
  { id: "society", label: "Society and Culture", test: /societ|cultur|famil|child|parent|elderly|tradition|communit|\bcit(?:y|ies)\b|urban|housing|language|generation/i },
  { id: "economy", label: "Economics", test: /econom|money|globali|\btrade|consum|shopping|wealth|poverty|\bincome|business/i },
  { id: "travel", label: "Travel and Transportation", test: /travel|transport|traffic|\bcars?\b|touris|flight|commut|vehicle|\broads?\b|abroad/i },
];
const otherTopic = { id: "other", label: "Chủ đề khác" };

/** Every kind chip in display order: Task 1 visuals, letter tones, then essay types. */
export const writingKindOptions: { id: string; label: string }[] = [
  ...Object.entries(writingKinds).filter(([id]) => !["letter", "essay"].includes(id)).map(([id, label]) => ({ id, label })),
  ...essayTypes.map(({ id, label }) => ({ id, label })),
  { id: "other", label: "Dạng khác" },
];
export const writingTopicOptions: { id: string; label: string }[] = [...essayTopics, otherTopic].map(({ id, label }) => ({ id, label }));

const firstMatch = (options: Option[], ...texts: (string | null | undefined)[]) => {
  for (const text of texts) {
    if (!text) continue;
    const found = options.find((option) => option.test.test(text));
    if (found) return found;
  }
  return undefined;
};

/** The title without "Writing Task 2:" and the type words the card already shows. */
export function writingCardTitle(exam: Pick<CatalogExam, "title">) {
  const title = displayExamTitle(exam.title)
    .replace(/^IELTS\s+/i, "")
    .replace(/^(?:Academic\s+|General\s+(?:Training\s+)?)?Writing\s+Task\s*[12]\s*(?:·\s*\w+\s*)?[:–-]\s*/i, "")
    .replace(/^(?:Advantages\s+Disadvantages|Adv\s+Disadv|Two\s+Part|Opinion|Discussion|Problem\s+Solution|Positive\s+Negative|Direct\s+Question|Agree\s+Disagree)\s+(?=\S)/i, "")
    .replace(/^(?:Semi[\s-]?Formal|Informal|Formal)\s+(?=\S)/i, "")
    .replace(/^(?:Line(?:\s+Graph)?|Bar(?:\s+Chart)?|Pie(?:\s+Chart)?|Table|Mixed|Map|Process|Diagram)\s+(?=\S+\s+\S)/i, "")
    .trim();
  return title || displayExamTitle(exam.title);
}

/** The fields a Writing task is classified by; the exam page passes the same from its content. */
export type WritingFacetInput = Pick<CatalogExam, "title" | "practice_type" | "topic" | "prompt_preview" | "visual" | "visual_kind" | "task_type">;

export function writingFacets(exam: WritingFacetInput) {
  const titleType = exam.title.replace(/^.*?Task\s*[12]\s*[:–-]\s*/i, "").split(/\s+/).slice(0, 3).join(" ");
  if (exam.practice_type === "task2") {
    const type = firstMatch(essayTypes, titleType, exam.prompt_preview) ?? (/\?[^?]+\?/.test(exam.prompt_preview ?? "") ? essayTypes.find((item) => item.id === "two_part") : undefined);
    const topic = firstMatch(essayTopics, (exam.topic ?? "").replace(/^topic_/, "").replace(/_/g, " "), writingCardTitle(exam), exam.prompt_preview);
    return { kind: type?.id ?? "other", kindLabel: type?.label ?? "Dạng khác", topic: topic?.id ?? otherTopic.id, topicLabel: topic?.label ?? otherTopic.label };
  }
  if (exam.practice_type === "task1_general") {
    const tone = firstMatch(letterTones, titleType, exam.prompt_preview);
    return { kind: tone?.id ?? "other", kindLabel: tone?.label ?? "Thư", topic: "", topicLabel: "" };
  }
  const kind = writingKind(exam);
  return { kind, kindLabel: writingKinds[kind], topic: "", topicLabel: "" };
}

/** Band from the AI feedback stored on a submitted attempt, if it was graded. */
export function gradedBand(attempt?: Attempt) {
  const raw = attempt?.notes?.__ai_feedback;
  if (!raw) return null;
  try { const overall = Number(JSON.parse(raw).overall); return Number.isFinite(overall) ? overall : null; } catch { return null; }
}

/** Our stickers stand in for Task 2 cover pictures, one per essay theme. */
const topicStickers: Record<string, { name: StickerName; tone: string }> = {
  education: { name: "cap", tone: "#e8f1ff" }, environment: { name: "tree", tone: "#e6f6ea" }, work: { name: "clipboard", tone: "#fff1dc" },
  government: { name: "scroll", tone: "#f3ecff" }, technology: { name: "rocket", tone: "#e6f4ff" }, health: { name: "heart", tone: "#ffe9ec" },
  media: { name: "newspaper", tone: "#f1f3f6" }, society: { name: "bubble", tone: "#e9f8f6" }, economy: { name: "chart", tone: "#fff6d8" },
  travel: { name: "plane", tone: "#e7f4ff" }, daily: { name: "coffee", tone: "#fdf0e4" }, other: { name: "bulb", tone: "#fff4d6" },
};
export const writingSticker = (topic: string) => topicStickers[topic] ?? topicStickers.other;

/**
 * Speaking reuses the Writing themes, plus everyday-life topics that Part 1 and
 * Part 2 ask about far more than essays do. Like Writing, the bank stores no
 * theme, so it is read from the title and the first questions.
 */
const speakingTopics: Option[] = [
  ...essayTopics,
  { id: "daily", label: "Daily Life & Hobbies", test: /hobb|free time|weekend|daily|routine|weather|shopp|cloth|sleep|colou?r|numbers?|birthday|gift|friend|\bpets?\b|animal|holiday|festival|party|home|hometown|neighbou?r|cook|garden|walk|relax/i },
];
export const speakingTopicOptions: { id: string; label: string }[] = [...speakingTopics, otherTopic].map(({ id, label }) => ({ id, label }));
/** A Speaking topic outside every theme keeps the microphone rather than the essay light bulb. */
export const speakingSticker = (topic: string) => topic in topicStickers && topic !== "other" ? topicStickers[topic] : { name: "mic" as StickerName, tone: "#fbe8f4" };

export const speakingParts = [
  { id: "part1", label: "Part 1 · Interview", badge: "Part 1" },
  { id: "part2", label: "Part 2 · Cue card", badge: "Part 2" },
  { id: "part3", label: "Part 3 · Discussion", badge: "Part 3" },
] as const;

/** The title without "Speaking Part 2:", the way a card shows it. */
export function speakingCardTitle(exam: Pick<CatalogExam, "title">) {
  const title = displayExamTitle(exam.title).replace(/^(?:IELTS\s+)?Speaking\s+Part\s*\d\s*[:–-]\s*/i, "").trim() || displayExamTitle(exam.title);
  return title.charAt(0).toLocaleUpperCase() + title.slice(1);
}

export function speakingFacets(exam: Pick<CatalogExam, "title" | "topic" | "prompt_preview" | "question_preview">) {
  const topic = firstMatch(speakingTopics, (exam.topic ?? "").replace(/^topic_/, "").replace(/_/g, " "), speakingCardTitle(exam), ...(exam.question_preview ?? []).slice(0, 3), exam.prompt_preview);
  return { topic: topic?.id ?? otherTopic.id, topicLabel: topic?.label ?? otherTopic.label };
}
