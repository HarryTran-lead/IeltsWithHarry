import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

const lockedInProduction = [
  // Tự học IELTS
  "/app/self-study",
  "/app/self-study/writing-task-1",
  "/app/self-study/writing-task-2/T2-M113-01",
  "/app/self-study/speaking/skill-FC01",
  "/app/reading/lab",
  "/app/reading/lab/M08_02",
  "/app/self-study/listening",
  // Luyện đề
  "/app/reading",
  "/app/reading/live",
  "/app/listening",
  "/app/listening/vocabulary",
  "/app/writing",
  "/app/writing/task-1",
  "/app/writing/task-2",
  "/app/speaking",
  "/app/speaking/live",
  "/app/speaking/part-3",
  "/app/question-bank",
  "/app/question-bank/exam/reading-id",
  "/app/question-bank/attempt/reading-id",
  "/app/question-bank/result/reading-id",
  "/app/speaking/mock",
];

describe("production learner routes", () => {
  it("locks every self-study lab and every exam practice route", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_UNLOCK_DEV_FEATURES", "false");
    vi.resetModules();

    const { learnerSkillAvailable, lockedLearnerPath } = await import("../src/lib/runtime");
    for (const path of lockedInProduction) expect(lockedLearnerPath(path), path).toBe(true);
    for (const skill of ["Reading", "reading", "Listening", "Writing", "writing", "Speaking", "speaking", null]) expect(learnerSkillAvailable(skill), String(skill)).toBe(false);
  });

  it("keeps Reading vocabulary and the supporting practice open", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_UNLOCK_DEV_FEATURES", "false");
    vi.resetModules();

    const { lockedLearnerPath } = await import("../src/lib/runtime");
    for (const path of ["/app/reading/vocabulary", "/app/vocabulary", "/app/grammar", "/app/dictation", "/app/news", "/app/notebook"]) expect(lockedLearnerPath(path), path).toBe(false);
  });

  it("leaves the released labs reachable in the unlocked preview", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_UNLOCK_DEV_FEATURES", "true");
    vi.resetModules();

    const { lockedLearnerPath } = await import("../src/lib/runtime");
    for (const path of ["/app/self-study/writing-task-1", "/app/self-study/speaking", "/app/reading/lab", "/app/reading", "/app/writing", "/app/speaking/mock"]) expect(lockedLearnerPath(path), path).toBe(false);
    expect(lockedLearnerPath("/app/self-study")).toBe(true);
  });
});
