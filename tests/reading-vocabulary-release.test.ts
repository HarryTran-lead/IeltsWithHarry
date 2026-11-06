import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("production learner routes", () => {
  it("opens Reading practice and keeps the other IELTS skills closed", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_UNLOCK_DEV_FEATURES", "false");
    vi.resetModules();

    const { learnerSkillAvailable, lockedLearnerPath } = await import("../src/lib/runtime");
    expect(lockedLearnerPath("/app/reading/vocabulary")).toBe(false);
    expect(lockedLearnerPath("/app/reading")).toBe(false);
    expect(lockedLearnerPath("/app/reading/live")).toBe(false);
    expect(lockedLearnerPath("/app/question-bank/exam/reading-id")).toBe(false);
    expect(lockedLearnerPath("/app/question-bank/attempt/reading-id")).toBe(false);
    expect(lockedLearnerPath("/app/question-bank/result/reading-id")).toBe(false);
    expect(lockedLearnerPath("/app/reading/mock")).toBe(true);
    expect(lockedLearnerPath("/app/listening")).toBe(true);
    expect(lockedLearnerPath("/app/question-bank")).toBe(true);
    expect(learnerSkillAvailable("Reading")).toBe(true);
    expect(learnerSkillAvailable("reading")).toBe(true);
    expect(learnerSkillAvailable("Listening")).toBe(false);
    expect(learnerSkillAvailable(null)).toBe(false);
  });
});
