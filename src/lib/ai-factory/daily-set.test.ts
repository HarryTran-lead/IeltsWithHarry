import { describe, expect, it } from "vitest";
import { checkFormat } from "../ielts-bank/format-rules";
import type { ExamQuestion, NormalizedExam } from "../ielts-bank/schema";
import { chooseDailySet, composeFullDraft, dailyPieceKinds, dailySetId, nextMissingPiece, type DailyPiece, type DailyPieces } from "./daily-set";

const meta = { externalId: "piece", format: "Academic", mode: "practice", title: "A new practice item", topic: "Research",
  durationMinutes: 20, sourceUrl: "https://example.org", attribution: "Original", license: "Original", licenseUrl: "https://example.org",
  aiGenerated: true, upstreamVersion: "test" };
const question = (number: number, type: string, options: string[] = [], group?: string): ExamQuestion => ({
  id: `q${number}`, number, type, prompt: group ? `Choose two for group ${group}` : `Question ${number}: what is the answer?${type.includes("completion") ? " __________" : ""}`,
  instructions: type.includes("completion") ? "Write ONE WORD ONLY." : "Choose the correct answer.", options,
  answers: [type === "true_false_not_given" ? "TRUE" : "A"], explanation: "Evidence", ...(type.includes("completion") ? { answers: ["word"], wordLimit: "ONE WORD ONLY" } : {}),
  ...(group ? { group } : {}),
});
const mcq = ["A — One", "B — Two", "C — Three", "D — Four"];
const matching = ["A — One", "B — Two", "C — Three", "D — Four", "E — Five"];
const speech = Array.from({ length: 760 }, (_, index) => `word${index}`).join(" ");
const readingText = Array.from({ length: 820 }, (_, index) => `word${index}`).join(" ");

function piece(skill: "Listening" | "Reading", part: number): DailyPiece {
  const start = skill === "Reading" ? [1, 14, 27][part - 1] : (part - 1) * 10 + 1;
  const count = skill === "Reading" ? part === 3 ? 14 : 13 : 10;
  let questions: ExamQuestion[];
  if (skill === "Reading") questions = Array.from({ length: count }, (_, index) => {
    const n = start + index;
    return index < 5 ? question(n, "true_false_not_given") : question(n, "multiple_choice", mcq);
  });
  else if (part === 1 || part === 4) questions = Array.from({ length: count }, (_, index) => question(start + index, "note_completion"));
  else if (part === 2) questions = Array.from({ length: count }, (_, index) => index < 5 ? question(start + index, "multiple_choice", mcq.slice(0, 3)) : question(start + index, "matching", matching));
  else questions = Array.from({ length: count }, (_, index) => index < 4 ? question(start + index, "multiple_answers", matching, index < 2 ? "g21" : "g23") : question(start + index, "multiple_choice", mcq.slice(0, 3)));
  if (part === 3 && skill === "Listening") {
    questions[1].answers = ["B"]; questions[3].answers = ["B"];
  }
  const exam: NormalizedExam = { ...meta, skill, content: { prompt: "", sections: [{ id: skill === "Reading" ? `passage-${part}` : `part-${part}`,
    title: `${skill} ${part}`, passage: skill === "Reading" ? readingText : "Questions", transcript: skill === "Listening" ? speech : "", questions }] } };
  return { kind: skill === "Reading" ? `reading_passage${part}` : `listening_part${part}`, exam, warnings: [], evidence: {},
    audioPayload: skill === "Listening" ? { sectionId: `part-${part}`, setting: "a student talking to a tutor", turns: [{ ordinal: 0, speaker: "Teacher", voice: "bf_emma", text: speech }], evidence: {}, answerPhrases: [] } : null,
    model: "test", usage: { inputTokens: 0, outputTokens: 0 } } as unknown as DailyPiece;
}

describe("AI Factory daily set", () => {
  it("resumes from the first missing piece and uses one ID per UTC day", () => {
    const pieces: DailyPieces = { listening_part1: piece("Listening", 1), listening_part2: piece("Listening", 2) };
    expect(nextMissingPiece(pieces)).toBe("writing_task1_academic");
    for (const kind of dailyPieceKinds.slice(7)) pieces[kind] = piece("Reading", 1);
    expect(nextMissingPiece(pieces)).toBe("listening_part3");
    for (const kind of dailyPieceKinds) pieces[kind] = piece("Reading", 1);
    expect(nextMissingPiece(pieces)).toBeNull();
    expect(dailySetId(new Date("2026-10-28T08:27:00Z"))).toBe("set-2026-10-28");
  });

  it("resumes an older incomplete set after quota exhaustion and never opens a second set today", () => {
    const pieces: DailyPieces = { listening_part1: piece("Listening", 1), listening_part2: piece("Listening", 2), listening_part3: piece("Listening", 3), listening_part4: piece("Listening", 4), reading_passage1: piece("Reading", 1),
      writing_task1_academic: piece("Reading", 1), writing_task2: piece("Reading", 1), speaking_part1: piece("Reading", 1), speaking_part2: piece("Reading", 1) };
    const old: { payload: { setId: string; pieces: DailyPieces; completedAt?: string } } = { payload: { setId: "set-2026-10-27", pieces } };
    expect(chooseDailySet(null, old)).toBe(old);
    expect(nextMissingPiece(old.payload.pieces)).toBe("reading_passage2");
    expect(chooseDailySet({ payload: { setId: "set-2026-10-28", completedAt: "2026-10-28T10:00:00Z", pieces } }, old)).toBe("complete");
  });

  it("combines three Reading passages into a 40-question full test", () => {
    const pieces: DailyPieces = { reading_passage1: piece("Reading", 1), reading_passage2: piece("Reading", 2), reading_passage3: piece("Reading", 3) };
    const { exam } = composeFullDraft("Reading", "set-2026-10-28", pieces);
    expect(exam.content.sections.map((section) => section.questions.length)).toEqual([13, 13, 14]);
    expect(exam.content.sections.flatMap((section) => section.questions).map((item) => item.number)).toEqual(Array.from({ length: 40 }, (_, index) => index + 1));
    expect(checkFormat("Reading", exam.content, "full")).toEqual([]);
  });

  it("combines four Listening parts; only missing audio remains until human review", () => {
    const pieces: DailyPieces = { listening_part1: piece("Listening", 1), listening_part2: piece("Listening", 2), listening_part3: piece("Listening", 3), listening_part4: piece("Listening", 4) };
    const { exam, audioSections } = composeFullDraft("Listening", "set-2026-10-28", pieces);
    expect(exam.content.sections).toHaveLength(4);
    expect(audioSections.map((section) => section.sectionId)).toEqual(["part-1", "part-2", "part-3", "part-4"]);
    expect(audioSections.map((section) => section.setting)).toEqual(Array(4).fill("a student talking to a tutor"));
    expect(checkFormat("Listening", exam.content, "full").map((finding) => finding.code)).toEqual(["L2", "L2", "L2", "L2"]);
  });
});
