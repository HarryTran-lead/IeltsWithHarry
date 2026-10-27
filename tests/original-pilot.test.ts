import { describe, expect, it } from "vitest";
import { normalizeOriginalPilot } from "../src/lib/ielts-bank/original-pilot";
import { publicContent, scoreAnswers } from "../src/lib/ielts-bank/schema";

const item = (number: number) => ({ number, type: "gap", prompt: `Question ${number}: ____`, answer: "shade", evidence: "shade", explanation: "The passage states shade." });
const reading = {
  id: "ESL-R-01", skill: "reading", title: "Original Reading Test 01", minutes: 60,
  parts: [
    { label: "Passage 1", title: "A", paragraphs: ["Trees provide shade."], questions: Array.from({ length: 13 }, (_, n) => item(n + 1)) },
    { label: "Passage 2", title: "B", paragraphs: ["Trees provide shade."], questions: Array.from({ length: 13 }, (_, n) => item(n + 14)) },
    { label: "Passage 3", title: "C", paragraphs: ["Trees provide shade."], questions: Array.from({ length: 14 }, (_, n) => item(n + 27)) },
  ],
};

describe("owner-supplied original pilot import", () => {
  it("maps all 40 Reading keys for server-side scoring and hides them from learners", () => {
    const { exam, warnings } = normalizeOriginalPilot(reading);
    expect(exam.content.sections).toHaveLength(3);
    expect(exam.content.sections.flatMap((section) => section.questions)).toHaveLength(40);
    expect(scoreAnswers(exam.content, { "ESL-R-01-Q01": "shade" })).toMatchObject({ score: 1, total: 40 });
    expect(publicContent(exam.content).sections[0].questions[0].answers).toEqual([]);
    expect(warnings).toContain("editorial_review_required");
  });

  it("keeps Listening private until a human recording exists", () => {
    const listening = {
      id: "ESL-L-01", skill: "listening", title: "Original Listening Test 01", minutes: 30,
      parts: Array.from({ length: 4 }, (_, part) => ({
        label: `Part ${part + 1}`, title: "Conversation", audio: null,
        script: [{ speaker: "Speaker", text: "The answer is shade." }],
        questions: Array.from({ length: 10 }, (_, n) => item(part * 10 + n + 1)),
      })),
    };
    const { exam, warnings } = normalizeOriginalPilot(listening);
    expect(exam.content.sections[0].audioUrl).toBeUndefined();
    expect(warnings).toContain("audio_missing");
    expect(warnings).toContain("human_recording_required");
    expect(() => normalizeOriginalPilot({ ...listening, parts: [{ ...listening.parts[0], audio: "unreviewed.mp3" }, ...listening.parts.slice(1)] })).toThrow("reviewed audio asset");
  });

  it("rejects reordered or missing questions", () => {
    const broken = structuredClone(reading);
    broken.parts[0].questions[0].number = 2;
    expect(() => normalizeOriginalPilot(broken)).toThrow("expected questions 1–40");
  });
});
