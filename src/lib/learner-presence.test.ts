import { describe, expect, it } from "vitest";
import { activeLearnerCount, onlineLearnerIds, studyLearners } from "./learner-presence";

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

describe("study room learners", () => {
  it("lists each account once with its goal, the current learner first", () => {
    const state = {
      other: [{ online: true, active: false, name: "Mai", goal: "Writing", since: "2026-11-25T08:00:00Z" }],
      me: [{ online: true, active: true, name: "  Harry  ", goal: " 2 bài   Reading ", since: "2026-11-25T09:00:00Z" }],
      busy: [{ online: false, active: false }, { online: true, active: true, name: "An", since: "2026-11-25T07:00:00Z" }],
      gone: [{ online: false, active: false, name: "Huy" }],
      legacy: [{ active: true }],
    };
    const learners = studyLearners(state, "me");
    expect(learners.map((item) => item.id)).toEqual(["me", "legacy", "busy", "other"]);
    expect(learners[0]).toMatchObject({ name: "Harry", goal: "2 bài Reading", self: true, active: true });
    expect(learners[1]).toMatchObject({ name: "Learner", goal: "", since: null });
  });
});
