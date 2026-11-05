import { afterEach, describe, expect, it, vi } from "vitest";

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

describe("Four-stage production rollout", () => {
  it("shows the four Mindset band ranges and retains the Book 2 catalog", async () => {
    const { stages } = await import("../src/lib/demo-data");
    const { default: book2 } = await import("../src/data/book2/catalog.json");
    expect(stages.map(({ name, range }) => [name, range])).toEqual([
      ["Foundation", "Dưới 4.0 → 4.0–4.5"],
      ["Level 1", "4.0–4.5 → 5.0–5.5"],
      ["Level 2", "5.5 → 6.0–6.5"],
      ["Level 3", "6.5 → 7.0–7.5"],
    ]);
    expect(book2.stage_id).toBe("ielts-builder");
    expect(book2.units.flatMap((unit) => unit.lessons)).toHaveLength(144);
  });

  it("opens only Level 2 in production", async () => {
    vi.stubEnv("NODE_ENV", "production");
    vi.stubEnv("NEXT_PUBLIC_UNLOCK_DEV_FEATURES", "false");
    vi.resetModules();
    const { learnStageAvailable, lockedLearnerPath } = await import("../src/lib/runtime");

    expect(learnStageAvailable("ielts-builder")).toBe(true);
    expect(lockedLearnerPath("/app/learn/ielts-builder")).toBe(false);
    for (const stage of ["foundation", "ielts-starter", "ielts-advanced", "elementary", "pre-ielts", "mastery"]) {
      expect(learnStageAvailable(stage)).toBe(false);
      expect(lockedLearnerPath(`/app/learn/${stage}`)).toBe(true);
    }
    expect(lockedLearnerPath("/app/learn")).toBe(false);
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
