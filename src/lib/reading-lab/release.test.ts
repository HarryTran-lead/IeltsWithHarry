import { afterEach, describe, expect, it, vi } from "vitest";

describe("Reading Lab release gate", () => {
  afterEach(() => vi.unstubAllEnvs());

  async function locked() {
    vi.resetModules();
    return (await import("../runtime")).lockedLearnerPath;
  }

  it("keeps the Lab and every Reading route closed in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_UNLOCK_DEV_FEATURES", "false");
    const isLocked = await locked();
    expect(isLocked("/app/reading/lab")).toBe(true);
    expect(isLocked("/app/reading/lab/M08_02")).toBe(true);
    expect(isLocked("/app/reading/unreleased")).toBe(true);
  });

  it("opens the published Lab in the unlocked preview", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_UNLOCK_DEV_FEATURES", "true");
    const isLocked = await locked();
    expect(isLocked("/app/reading/lab")).toBe(false);
    expect(isLocked("/app/reading/lab/M08_02")).toBe(false);
  });

  it("can close the Lab with the emergency flag", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_DISABLE_READING_LAB", "true");
    const isLocked = await locked();
    expect(isLocked("/app/reading/lab")).toBe(true);
    expect(isLocked("/app/reading/lab/M08_02")).toBe(true);
  });
});
