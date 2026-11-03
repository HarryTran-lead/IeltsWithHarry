import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Book 2 production rollout", () => {
  it("opens only the 5.0–6.0 Learn stage and Book 2 lessons", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_UNLOCK_DEV_FEATURES", "false");
    vi.resetModules();
    const { learnStageAvailable, lockedLearnerPath } = await import("../src/lib/runtime");

    expect(learnStageAvailable("ielts-builder")).toBe(true);
    for (const stage of ["foundation", "elementary", "pre-ielts", "ielts-starter", "ielts-advanced", "mastery"]) {
      expect(learnStageAvailable(stage)).toBe(false);
      expect(lockedLearnerPath(`/app/learn/${stage}`)).toBe(true);
    }
    expect(lockedLearnerPath("/app/learn")).toBe(false);
    expect(lockedLearnerPath("/app/learn/ielts-builder")).toBe(false);
    expect(lockedLearnerPath("/app/lesson/b2-u01-r-l01")).toBe(false);
    expect(lockedLearnerPath("/app/lesson/mindsetbuilder-u01-r-l01")).toBe(true);
    expect(lockedLearnerPath("/app/check/ielts-builder-final-check")).toBe(true);
  });

  it("keeps the development preview's full route access", async () => {
    vi.stubEnv("NODE_ENV", "development");
    vi.resetModules();
    const { learnStageAvailable, lockedLearnerPath } = await import("../src/lib/runtime");
    expect(learnStageAvailable("ielts-starter")).toBe(true);
    expect(lockedLearnerPath("/app/learn/ielts-starter")).toBe(false);
  });
});
