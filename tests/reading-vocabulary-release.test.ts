import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("production learner routes", () => {
  it("opens the published Reading vocabulary without unlocking other Reading pages", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_UNLOCK_DEV_FEATURES", "false");
    vi.resetModules();

    const { lockedLearnerPath } = await import("../src/lib/runtime");
    expect(lockedLearnerPath("/app/reading/vocabulary")).toBe(false);
    expect(lockedLearnerPath("/app/reading")).toBe(true);
    expect(lockedLearnerPath("/app/reading/mock")).toBe(true);
  });
});
