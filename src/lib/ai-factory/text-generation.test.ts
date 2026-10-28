import { afterEach, describe, expect, it, vi } from "vitest";
import { generateFactoryDraft, generateTextPractice } from "./text-generation";

afterEach(() => vi.unstubAllEnvs());

function modelResponse(value: unknown): typeof fetch {
  return vi.fn(async () => Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(value) }] } }], usageMetadata: { promptTokenCount: 128, candidatesTokenCount: 256 } })) as typeof fetch;
}

function enableConfirmedFreeTier() {
  vi.stubEnv("AI_FACTORY_FREE_TIER_ONLY", "true");
  vi.stubEnv("AI_FACTORY_FREE_TIER_CONFIRMED", "true");
  vi.stubEnv("AI_FACTORY_GEMINI_API_KEY", "test-only");
}

const essay = (statement: string) => ({ title: "Prioritising public transport", topic: "Public transport choices", statement, question: "To what extent do you agree or disagree?" });
const validStatement = "Some cities plan to replace short car journeys with improved buses and trams. Supporters say this cuts pollution and traffic, but others argue that local governments should spend the money on housing and schools instead.";

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

  it("keeps a valid Writing Task 2 as a reviewable practice draft in the printed exam wording", async () => {
    enableConfirmedFreeTier();
    const draft = await generateTextPractice("Writing", "Public transport choices", modelResponse(essay(validStatement)));
    expect(draft.warnings).toEqual([]);
    expect(draft.kind).toBe("writing_task2");
    expect(draft.exam.mode).toBe("practice");
    expect(draft.exam.content.minimumWords).toBe(250);
    expect(draft.exam.content.prompt).toContain("Write at least 250 words.");
    expect(draft.usage).toEqual({ inputTokens: 128, outputTokens: 256 });
  });

  it("retries one draft that fails the format gate, passing the reasons back", async () => {
    enableConfirmedFreeTier();
    const replies = [essay("Too short a statement for an essay question here."), essay(validStatement)];
    const bodies: string[] = [];
    const fetcher = vi.fn(async (_url: string, init: RequestInit) => {
      bodies.push(String(init.body));
      return Response.json({ candidates: [{ finishReason: "STOP", content: { parts: [{ text: JSON.stringify(replies.shift()) }] } }] });
    }) as unknown as typeof fetch;
    const draft = await generateFactoryDraft("writing_task2", "Public transport choices", { day: 0, avoid: ["An older title"] }, fetcher);
    expect(fetcher).toHaveBeenCalledTimes(2);
    expect(draft.warnings).toEqual([]);
    expect(bodies[0]).toContain("An older title");
    expect(bodies[1]).toContain("statement should be 25-100 words");
  });

  it("counts each attempted request and stops immediately on quota exhaustion", async () => {
    enableConfirmedFreeTier();
    const beforeRequest = vi.fn(async () => {});
    const fetcher = vi.fn(async () => Response.json({ error: { message: "Requests per day exceeded" } }, { status: 429 })) as typeof fetch;
    await expect(generateFactoryDraft("reading_passage1", "How bees navigate", { beforeRequest }, fetcher)).rejects.toThrow("daily quota exhausted");
    expect(beforeRequest).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });

  it("does not spend more requests retrying a timed-out model call", async () => {
    enableConfirmedFreeTier();
    const beforeRequest = vi.fn(async () => {});
    const fetcher = vi.fn(async () => { throw new DOMException("The operation was aborted due to timeout", "TimeoutError"); }) as typeof fetch;
    await expect(generateFactoryDraft("listening_part1", "Joining a sports club", { beforeRequest }, fetcher)).rejects.toThrow("timeout");
    expect(beforeRequest).toHaveBeenCalledTimes(1);
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
});
