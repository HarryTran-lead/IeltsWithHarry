import { describe, expect, it } from "vitest";
import { gradeLab, labItem, labsForLevel } from "../src/lib/grammar/labs-server";
import { labKinds, type ChoiceQuestion, type LabItem } from "../src/lib/grammar/labs-types";
import { grammarLevels } from "../src/lib/grammar/types";

// What the UI lets a learner submit for each open task (see OpenCheck minLength in grammar-labs.tsx).
const OPEN_MIN = { transform: 6, context: 16, transfer: 15 } as const;
const longAnswer = "I think this sentence is my own careful attempt at the task.";

function choices(item: LabItem): ChoiceQuestion[] {
  return item.lab === "clinic" || item.lab === "contrast" ? item.practice : item.lab === "context" ? item.questions : [];
}

describe("Grammar labs content audit", () => {
  it("every choice question has exactly one matching option and open tasks accept the UI minimum", { timeout: 120_000 }, () => {
    const problems: string[] = [];
    for (const level of grammarLevels) {
      for (const lab of labKinds) {
        for (const summary of labsForLevel(level).labs[lab]) {
          const item = labItem(lab, summary.id)!;
          const questions = choices(item);
          for (const q of questions) {
            const right = q.optionsEn.map((_, i) => gradeLab(lab, item.id, q.id, i)).filter((g) => g?.kind === "choice" && g.correct);
            if (right.length !== 1) problems.push(`${item.id} ${q.id}: ${right.length} correct`);
            if (new Set(q.optionsEn.map((o) => o.trim().toLowerCase())).size !== q.optionsEn.length) problems.push(`${q.id}: duplicate options`);
          }
          if (item.lab === "context") {
            for (const task of item.open) {
              if (!gradeLab(lab, item.id, task.id, "x".repeat(OPEN_MIN.context))) problems.push(`${task.id}: rejects ${OPEN_MIN.context} chars`);
            }
          }
          if (item.lab === "transform") {
            for (const sub of item.items) if (!gradeLab(lab, item.id, sub.id, "x".repeat(OPEN_MIN.transform))) problems.push(`${sub.id}: rejects short answer`);
          }
          if (item.lab === "transfer" && !gradeLab(lab, item.id, item.id, longAnswer.slice(0, Math.max(OPEN_MIN.transfer, 15)))) problems.push(`${item.id}: rejects UI minimum`);
        }
      }
    }
    expect(problems).toEqual([]);
  });
});
