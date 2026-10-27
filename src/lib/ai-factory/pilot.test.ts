import { describe, expect, it } from "vitest";
import { pilotContent, pilotPayload, pilotTurns } from "./pilot";
import { contentSchema, scoreAnswers, validateExam } from "../ielts-bank/schema";

describe("Listening Part 3 factory pilot", () => {
  it("has distinct stable voices, 10 scored questions and valid evidence references", () => {
    expect(new Set(pilotTurns.map((turn) => turn.speaker)).size).toBe(3);
    for (const speaker of new Set(pilotTurns.map((turn) => turn.speaker))) {
      expect(new Set(pilotTurns.filter((turn) => turn.speaker === speaker).map((turn) => turn.voice)).size).toBe(1);
    }
    const content = contentSchema.parse(pilotContent);
    const questions = content.sections[0].questions;
    expect(questions).toHaveLength(10);
    expect(new Set(questions.map((item) => item.id)).size).toBe(10);
    expect(new Set(questions.map((item) => item.type)).size).toBeGreaterThan(1);
    for (const item of questions) {
      expect(item.answers.length).toBeGreaterThan(0);
      expect(pilotPayload.evidence[item.id as keyof typeof pilotPayload.evidence].every((index) => index >= 0 && index < pilotTurns.length)).toBe(true);
    }
    const answers = Object.fromEntries(questions.map((item) => [item.id, item.answers[0]]));
    expect(scoreAnswers(content, answers).score).toBe(10);
    const warnings = validateExam({ externalId: "pilot", skill: "Listening", format: "Academic", mode: "practice", title: "Pilot", durationMinutes: 12, sourceUrl: "https://example.com", attribution: "Original", license: "Original", licenseUrl: "https://example.com", aiGenerated: true, upstreamVersion: "v1", content });
    expect(warnings).toEqual(["audio_missing"]);
  });
});
