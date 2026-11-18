import { checkFormat } from "../ielts-bank/format-rules";
import { validateExam, type NormalizedExam } from "../ielts-bank/schema";
import type { FactoryKind } from "./kinds";
import { FactoryModelError } from "./text-generation";
import type { generateFactoryDraft } from "./text-generation";

export const dailyPieceKinds = [
  "listening_part1", "listening_part2", "listening_part3", "listening_part4",
  "reading_passage1", "reading_passage2", "reading_passage3",
  "writing_task1_academic", "writing_task2", "speaking_part1", "speaking_part2",
] as const satisfies readonly FactoryKind[];

export type DailyPieceKind = (typeof dailyPieceKinds)[number];
export type DailyPiece = Awaited<ReturnType<typeof generateFactoryDraft>>;
export type DailyPieces = Partial<Record<DailyPieceKind, DailyPiece>>;
const generationOrder: readonly DailyPieceKind[] = [...dailyPieceKinds.slice(7), ...dailyPieceKinds.slice(0, 7)];

export function nextMissingPiece(pieces: DailyPieces): DailyPieceKind | null {
  return generationOrder.find((kind) => !pieces[kind]) ?? null;
}

export function dailySetId(date: Date): string {
  return `set-${date.toISOString().slice(0, 10)}`;
}

/** A bounded retry on the primary model, then two attempts on the free-tier fallback. */
export async function continueWithFallback<T>(
  create: (model: string) => Promise<T>,
  wait: (milliseconds: number) => Promise<void>,
  primary: string,
  fallback: string,
  onRetry?: (model: string, nextModel: string, milliseconds: number, error: FactoryModelError) => Promise<void>,
): Promise<T> {
  const models = primary === fallback ? [primary, primary] : [primary, primary, fallback, fallback];
  const delays = [30_000, 90_000, 180_000];
  for (let attempt = 0; attempt < models.length; attempt += 1) {
    try {
      return await create(models[attempt]);
    } catch (error) {
      if (!(error instanceof FactoryModelError) || error.failure !== "unavailable" || attempt === models.length - 1) throw error;
      const delay = delays[attempt];
      await onRetry?.(models[attempt], models[attempt + 1], delay, error);
      await wait(delay);
    }
  }
  throw new Error("AI Factory model fallback was not attempted");
}

/** An incomplete older set takes precedence; a completed set for today prevents a second one. */
export function chooseDailySet<T extends { payload: { setId: string; completedAt?: string } }>(current: T | null, unfinished: T | null): T | "complete" | null {
  if (current?.payload.completedAt) return "complete";
  return unfinished ?? current;
}

export function composeFullDraft(skill: "Listening" | "Reading", setId: string, pieces: DailyPieces) {
  const kinds = skill === "Listening" ? dailyPieceKinds.slice(0, 4) : dailyPieceKinds.slice(4, 7);
  const selected = kinds.map((kind) => pieces[kind]);
  if (selected.some((piece) => !piece || piece.warnings.length)) throw new Error(`${skill} full test is missing a validated part`);
  const valid = selected as DailyPiece[];
  const sections = valid.flatMap((piece) => piece.exam.content.sections);
  const first = valid[0].exam;
  const exam: NormalizedExam = {
    ...first,
    externalId: `factory-daily-${setId}-${skill.toLowerCase()}`,
    mode: "full_test",
    title: `${skill} Academic Test ${setId.slice(4)}`,
    topic: valid.map((piece) => piece.exam.topic).filter(Boolean).join(" · "),
    durationMinutes: skill === "Reading" ? 60 : 30,
    content: { prompt: "", sections },
  };
  const findings = checkFormat(skill, exam.content, "full").filter((finding) => skill !== "Listening" || finding.code !== "L2");
  const warnings = validateExam(exam).filter((warning) => skill !== "Listening" || warning !== "audio_missing");
  if (findings.length || warnings.length) throw new Error(`${skill} full test failed format gate: ${[...findings.map((finding) => `${finding.code}: ${finding.message}`), ...warnings].join("; ")}`);
  const audioSections = skill === "Listening" ? valid.map((piece, index) => {
    const payload = piece.audioPayload;
    if (!payload || !Array.isArray(payload.turns) || !payload.evidence) throw new Error(`Listening Part ${index + 1} has no audio payload`);
    return { sectionId: sections[index].id, setting: payload.setting, turns: payload.turns, evidence: payload.evidence, answerPhrases: payload.answerPhrases };
  }) : [];
  return { exam, audioSections, evidence: Object.assign({}, ...valid.map((piece) => piece.evidence)) as Record<string, string> };
}
