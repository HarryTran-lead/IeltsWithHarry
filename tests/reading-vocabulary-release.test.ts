import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("production learner routes", () => {
  it("opens Reading, Listening, and Writing practice while unreleased IELTS skills remain closed", async () => {
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
    expect(lockedLearnerPath("/app/listening")).toBe(false);
    expect(lockedLearnerPath("/app/listening/vocabulary")).toBe(true);
    expect(lockedLearnerPath("/app/writing")).toBe(false);
    expect(lockedLearnerPath("/app/writing/live")).toBe(false);
    expect(lockedLearnerPath("/app/writing/task-1")).toBe(false);
    expect(lockedLearnerPath("/app/writing/task-2")).toBe(false);
    expect(lockedLearnerPath("/app/writing/mode/unreleased")).toBe(true);
    expect(lockedLearnerPath("/app/speaking")).toBe(true);
    expect(lockedLearnerPath("/app/question-bank")).toBe(true);
    expect(learnerSkillAvailable("Reading")).toBe(true);
    expect(learnerSkillAvailable("reading")).toBe(true);
    expect(learnerSkillAvailable("Listening")).toBe(true);
    expect(learnerSkillAvailable("Writing")).toBe(true);
    expect(learnerSkillAvailable("writing")).toBe(true);
    expect(learnerSkillAvailable("Speaking")).toBe(false);
    expect(learnerSkillAvailable(null)).toBe(false);
  });
});
