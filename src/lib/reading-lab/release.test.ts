import { afterEach, describe, expect, it, vi } from "vitest";

describe("Reading Lab release gate", () => {
  afterEach(() => vi.unstubAllEnvs());

  async function locked() {
    vi.resetModules();
    return (await import("../runtime")).lockedLearnerPath;
  }

  it("opens the published Lab while keeping unreleased Reading routes closed", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_UNLOCK_DEV_FEATURES", "false");
    const isLocked = await locked();
    expect(isLocked("/app/reading/lab")).toBe(false);
    expect(isLocked("/app/reading/unreleased")).toBe(true);
  });

  it("can close the Lab with the emergency flag", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_DISABLE_READING_LAB", "true");
    expect((await locked())("/app/reading/lab")).toBe(true);
  });
});
