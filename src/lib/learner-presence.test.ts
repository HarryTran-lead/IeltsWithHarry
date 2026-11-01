import { describe, expect, it } from "vitest";
import { activeLearnerCount, onlineLearnerIds } from "./learner-presence";

describe("learner presence", () => {
  it("separates portal activity from an active study-room session across tabs", () => {
    const state = {
      studying: [{ online: true, active: true }],
      browsing: [{ online: true, active: false }],
      hidden: [{ online: false, active: false }],
      multipleTabs: [{ online: false, active: false }, { online: true, active: false }],
      olderClient: [{ active: true }],
    };
    expect([...onlineLearnerIds(state)]).toEqual(["studying", "browsing", "multipleTabs", "olderClient"]);
    expect(activeLearnerCount(state)).toBe(2);
  });
});
