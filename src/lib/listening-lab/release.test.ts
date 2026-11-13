import { afterEach, describe, expect, it } from "vitest";
import { lockedLearnerPath } from "../runtime";

describe("Listening Lab release gate", () => {
  afterEach(() => { delete process.env.NEXT_PUBLIC_DISABLE_LISTENING_LAB; });

  it("opens the Listening Lab route while other self-study labs stay locked", () => {
    delete process.env.NEXT_PUBLIC_DISABLE_LISTENING_LAB;
    expect(lockedLearnerPath("/app/self-study/listening")).toBe(false);
    expect(lockedLearnerPath("/app/self-study/listening/module/01")).toBe(false);
    expect(lockedLearnerPath("/app/self-study/reading")).toBe(true);
    expect(lockedLearnerPath("/app/self-study/writing-task-1")).toBe(true);
  });

  it("can close the Listening Lab route with the emergency flag", () => {
    process.env.NEXT_PUBLIC_DISABLE_LISTENING_LAB = "true";
    expect(lockedLearnerPath("/app/self-study/listening")).toBe(true);
  });
});
