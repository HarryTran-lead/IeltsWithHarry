export const wordFormationModes = ["family", "blank", "choice", "error", "rewrite", "context", "translation"] as const;
export type WordFormationMode = typeof wordFormationModes[number];
export type WordFormationGuidance = "basic" | "intermediate" | "advanced";
export type WordPosition = "noun" | "verb" | "adj" | "adv";
export type WordFamily = {
  id: number;
  noun: string;
  verb: string | null;
  adjective: string;
  adverb: string | null;
  meaning_vi: string;
  example_pos: WordPosition;
  example_blank_en: string;
  example_vi: string;
  source_warning: string | null;
};
export type WordFormationProgress = {
  family_id: number;
  mode: WordFormationMode;
  guidance: WordFormationGuidance;
  attempts: number;
  correct_count: number;
  wrong_count: number;
  self_checked_count: number;
  last_result: "correct" | "wrong" | "self_checked";
  due_at: string;
  last_attempt_at: string;
};

const positions: WordPosition[] = ["noun", "verb", "adj", "adv"];

export function formAt(family: WordFamily, position: WordPosition): string | null {
  return position === "adj" ? family.adjective : position === "adv" ? family.adverb : family[position];
}

export function sourceAnswer(family: WordFamily): string {
  return formAt(family, family.example_pos) ?? "";
}

export function cueForm(family: WordFamily): string {
  const answer = sourceAnswer(family);
  return positions.map((position) => formAt(family, position)).find((form) => Boolean(form) && form !== answer) ?? family.noun;
}

export function completeSentence(family: WordFamily): string {
  return family.example_blank_en.replace("____", sourceAnswer(family));
}

export function wrongForm(family: WordFamily): string | null {
  const answer = sourceAnswer(family);
  return positions.filter((position) => position !== family.example_pos)
    .map((position) => formAt(family, position))
    .find((form) => Boolean(form) && form !== answer) ?? null;
}

/** The source has only one verified example per family; ambiguous forms stay out of objective modes. */
export function eligibleForMode(family: WordFamily, mode: WordFormationMode): boolean {
  if (!sourceAnswer(family)) return false;
  if (mode === "choice") {
    const forms = positions.map((position) => formAt(family, position));
    return !family.source_warning && forms.every(Boolean) && new Set(forms).size === 4;
  }
  if (mode === "error" || mode === "rewrite") return !family.source_warning && Boolean(wrongForm(family));
  return true;
}

export function choiceOptions(family: WordFamily, guidance: WordFormationGuidance): string[] {
  if (!eligibleForMode(family, "choice")) return [];
  const forms = positions.map((position) => formAt(family, position)!);
  const shift = (family.id + { basic: 1, intermediate: 2, advanced: 3 }[guidance]) % forms.length;
  return [...forms.slice(shift), ...forms.slice(0, shift)];
}

export function normalizeFormationAnswer(value: string): string {
  return value.normalize("NFKC").trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ").replace(/[.!?]+$/, "");
}

export function nextFormationProgress(
  family: WordFamily, mode: WordFormationMode, guidance: WordFormationGuidance,
  previous: WordFormationProgress | undefined, result: WordFormationProgress["last_result"], now = new Date(),
): WordFormationProgress {
  const days = result === "wrong" ? 1 / 24 : result === "self_checked" ? 1
    : Math.max(2, Math.min(30, 2 ** ((previous?.correct_count ?? 0) + 1)));
  return {
    family_id: family.id, mode, guidance,
    attempts: (previous?.attempts ?? 0) + 1,
    correct_count: (previous?.correct_count ?? 0) + Number(result === "correct"),
    wrong_count: (previous?.wrong_count ?? 0) + Number(result === "wrong"),
    self_checked_count: (previous?.self_checked_count ?? 0) + Number(result === "self_checked"),
    last_result: result,
    due_at: new Date(now.getTime() + days * 86_400_000).toISOString(),
    last_attempt_at: now.toISOString(),
  };
}

export function recommendFamilies(
  families: WordFamily[], progress: WordFormationProgress[], mode: WordFormationMode,
  count: number, now: Date, excluded = new Set<number>(),
): WordFamily[] {
  const byId = new Map(progress.map((row) => [row.family_id, row]));
  const scope = families.filter((family) => eligibleForMode(family, mode) && !excluded.has(family.id));
  const due = scope.filter((family) => {
    const state = byId.get(family.id);
    return state && new Date(state.due_at).getTime() <= now.getTime();
  }).sort((a, b) => new Date(byId.get(a.id)!.due_at).getTime() - new Date(byId.get(b.id)!.due_at).getTime()
    || a.id - b.id);
  const fresh = scope.filter((family) => !byId.has(family.id)).sort((a, b) => a.id - b.id);
  return [...due, ...fresh].slice(0, count);
}
