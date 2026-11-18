import { grammarLevels, type GrammarLevel } from "./types";

export const GRAMMAR_PASS_PERCENT = 80;
export const GRAMMAR_TEST_SIZE = 20;

export function grammarLevel(value: string): value is GrammarLevel {
  return grammarLevels.includes(value as GrammarLevel);
}

export function prerequisiteLevel(target: GrammarLevel): GrammarLevel | null {
  return grammarLevels[grammarLevels.indexOf(target) - 1] ?? null;
}

export function isLevelOpen(level: GrammarLevel, unlocked: readonly GrammarLevel[]) {
  return level === "A1" || unlocked.includes(level);
}

export function canTestLevel(target: GrammarLevel, unlocked: readonly GrammarLevel[]) {
  const prerequisite = prerequisiteLevel(target);
  return prerequisite !== null && isLevelOpen(prerequisite, unlocked);
}

export function scoreGrammarPlacement(correct: number, total = GRAMMAR_TEST_SIZE) {
  const percent = Math.round(correct / total * 100);
  return { correct, total, percent, passed: total === GRAMMAR_TEST_SIZE && percent >= GRAMMAR_PASS_PERCENT };
}
