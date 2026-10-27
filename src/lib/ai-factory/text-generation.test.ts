import { afterEach, describe, expect, it, vi } from "vitest";
import { generateTextPractice } from "./text-generation";

afterEach(() => vi.unstubAllEnvs());

function modelResponse(value: unknown): typeof fetch {
  return vi.fn(async () => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(value) }] } }], usageMetadata: { promptTokenCount: 128, candidatesTokenCount: 256 } })) as typeof fetch;
}

function enableConfirmedFreeTier() {
  vi.stubEnv("AI_FACTORY_FREE_TIER_ONLY", "true");
  vi.stubEnv("AI_FACTORY_FREE_TIER_CONFIRMED", "true");
}

describe("AI Factory text drafting", () => {
  it("never calls a model before free-tier billing is confirmed", async () => {
    vi.stubEnv("AI_FACTORY_GEMINI_API_KEY", "test-only");
    vi.stubEnv("AI_FACTORY_FREE_TIER_ONLY", "true");
    vi.stubEnv("AI_FACTORY_FREE_TIER_CONFIRMED", "");
    const fetcher = vi.fn() as unknown as typeof fetch;
    await expect(generateTextPractice("Writing", "Public transport choices", fetcher)).rejects.toThrow("free-tier project");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("never calls a model with no separate factory key", async () => {
    enableConfirmedFreeTier();
    vi.stubEnv("AI_FACTORY_GEMINI_API_KEY", "");
    const fetcher = vi.fn() as unknown as typeof fetch;
    await expect(generateTextPractice("Writing", "Public transport choices", fetcher)).rejects.toThrow("Separate AI Factory");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("keeps a valid Writing Task 2 as a reviewable practice draft", async () => {
    enableConfirmedFreeTier();
    vi.stubEnv("AI_FACTORY_GEMINI_API_KEY", "test-only");
    const prompt = "Some cities plan to replace short car journeys with improved public transport. To what extent do you agree that this should be a priority for local governments? Give reasons for your answer and include relevant examples from your own knowledge or experience.";
    const draft = await generateTextPractice("Writing", "Public transport choices", modelResponse({ title: "Prioritising public transport", topic: "Public transport choices", prompt }));
    expect(draft.warnings).toEqual([]);
    expect(draft.exam.mode).toBe("practice");
    expect(draft.exam.content.minimumWords).toBe(250);
    expect(draft.usage).toEqual({ inputTokens: 128, outputTokens: 256 });
  });

  it("queues Listening only when each answer is spoken in its cited turn", async () => {
    enableConfirmedFreeTier();
    vi.stubEnv("AI_FACTORY_GEMINI_API_KEY", "test-only");
    const turns = Array.from({ length: 20 }, (_, index) => ({
      speaker: index % 2 ? "Agent" : "Caller",
      text: `For item ${index + 1}, the booking detail is code${index + 1}. Please confirm the schedule and repeat that detail carefully so the caller can write it on the form without any confusion later today.`,
    }));
    const questions = Array.from({ length: 10 }, (_, index) => ({ prompt: `Complete booking field ${index + 1}: ______`, answer: `code${index + 1}`, evidenceTurn: index, explanation: `The speaker states code${index + 1} while confirming booking field ${index + 1}.` }));
    const valid = await generateTextPractice("Listening", "Booking an evening course", modelResponse({ title: "An evening course booking", topic: "Booking an evening course", turns, questions }));
    expect(valid.warnings).toEqual([]);
    expect(valid.audioPayload?.sectionId).toBe("part-1");
    questions[0].answer = "unspoken";
    await expect(generateTextPractice("Listening", "Booking an evening course", modelResponse({ title: "An evening course booking", topic: "Booking an evening course", turns, questions }))).rejects.toThrow("does not align");
  });
});
