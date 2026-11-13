import { describe, expect, it } from "vitest";
import { queueEstimate } from "../src/lib/writing-grading/queue-estimate";

describe("Writing queue estimate", () => {
  it("shows a bounded estimate for the current essay", () => {
    expect(queueEstimate(0)).toEqual({ ahead: 0, minMinutes: 1, maxMinutes: 3 });
    expect(queueEstimate(5)).toEqual({ ahead: 5, minMinutes: 3, maxMinutes: 9 });
    expect(queueEstimate(-2)).toEqual({ ahead: 0, minMinutes: 1, maxMinutes: 3 });
  });
});
