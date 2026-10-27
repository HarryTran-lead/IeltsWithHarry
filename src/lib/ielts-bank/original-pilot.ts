import { z } from "zod";
import { contentSchema, validateExam, type NormalizedExam } from "./schema";

const option = z.object({ value: z.string().min(1), label: z.string().min(1) });
const question = z.object({
  number: z.number().int().min(1).max(40),
  type: z.enum(["gap", "mcq", "tfng"]),
  prompt: z.string().min(1), answer: z.string().min(1),
  options: z.array(option).optional(),
  evidence: z.string().default(""), explanation: z.string().min(1),
});
const common = { label: z.string().min(1), title: z.string().min(1), questions: z.array(question) };
const readingPart = z.object({ ...common, paragraphs: z.array(z.string().min(1)).min(1) });
const listeningPart = z.object({
  ...common, audio: z.string().nullable().optional(),
  script: z.array(z.object({ speaker: z.string().min(1), text: z.string().min(1) })).min(1),
});
const paper = z.discriminatedUnion("skill", [
  z.object({ id: z.string().regex(/^ESL-R-0[1-5]$/), skill: z.literal("reading"), title: z.string().min(3), minutes: z.number().int().positive(), parts: z.array(readingPart).length(3) }),
  z.object({ id: z.string().regex(/^ESL-L-0[1-5]$/), skill: z.literal("listening"), title: z.string().min(3), minutes: z.number().int().positive(), parts: z.array(listeningPart).length(4) }),
]);

export const PILOT_PREFIX = "ESL-PILOT-2026-";
export const PILOT_REVIEW_URL = "https://github.com/HarryTran-lead/IeltsWithHarry/blob/develop/docs/ORIGINAL_TESTS_IMPORT.md";
export const PILOT_RIGHTS_STATUS = "Owner-supplied; publication rights pending review";

/** Import content for admin review only. In particular, a transcript is never substituted for an audio recording. */
export function normalizeOriginalPilot(raw: unknown): { exam: NormalizedExam; warnings: string[] } {
  const source = paper.parse(raw);
  const numbered = source.parts.flatMap((part) => part.questions.map((item) => item.number));
  if (numbered.length !== 40 || numbered.some((number, index) => number !== index + 1)) {
    throw new Error(`${source.id}: expected questions 1–40 in order`);
  }
  if (source.parts.some((part, index) => part.questions.length !== (source.skill === "reading" ? (index === 2 ? 14 : 13) : 10))) {
    throw new Error(`${source.id}: unexpected question distribution`);
  }
  const sections = source.parts.map((part, index) => {
    if ("script" in part && part.audio) throw new Error(`${source.id} part ${index + 1}: audio references require a reviewed audio asset`);
    const transcript = "script" in part
      ? part.script.map((line) => `${line.speaker}: ${line.text}`).join("\n") : "";
    const passage = "paragraphs" in part ? part.paragraphs.join("\n\n") : "";
    for (const item of part.questions) {
      if (item.type === "mcq" && (!item.options || item.options.length < 2 || !item.options.some((choice) => choice.value === item.answer))) {
        throw new Error(`${source.id} Q${item.number}: invalid multiple-choice key`);
      }
      if (item.type === "tfng" && !["TRUE", "FALSE", "NOT GIVEN"].includes(item.answer)) {
        throw new Error(`${source.id} Q${item.number}: invalid TRUE/FALSE/NOT GIVEN key`);
      }
      if (!item.evidence.trim() && item.answer !== "NOT GIVEN") {
        throw new Error(`${source.id} Q${item.number}: evidence missing`);
      }
    }
    return {
      id: `${source.id}-P${index + 1}`,
      title: part.title,
      passage, transcript,
      // The supplied ZIP has no MP3 files. Leave audioUrl absent until a human recording passes review.
      questions: part.questions.map((item) => ({
        id: `${source.id}-Q${String(item.number).padStart(2, "0")}`,
        number: item.number,
        type: { gap: "sentence_completion", mcq: "multiple_choice", tfng: "true_false_not_given" }[item.type],
        prompt: item.prompt,
        options: item.options?.map((choice) => `${choice.value} — ${choice.label.replace(new RegExp(`^${choice.value}\\.\\s*`), "")}`) ?? [],
        answers: [item.answer],
        explanation: item.evidence ? `${item.explanation}\n\nEvidence: ${item.evidence}` : item.explanation,
      })),
    };
  });
  const exam: NormalizedExam = {
    externalId: `${PILOT_PREFIX}${source.id}`,
    skill: source.skill === "reading" ? "Reading" : "Listening",
    format: "Academic", mode: "pilot_practice", title: source.title,
    topic: "Original pilot", difficulty: "Uncalibrated",
    durationMinutes: source.minutes,
    sourceUrl: PILOT_REVIEW_URL, attribution: "Owner-supplied original pilot ZIP",
    license: PILOT_RIGHTS_STATUS, licenseUrl: PILOT_REVIEW_URL,
    aiGenerated: false, upstreamVersion: "owner-supplied-v0.1",
    content: contentSchema.parse({ sections }),
  };
  const warnings = [
    ...validateExam(exam),
    "rights_review_required", "editorial_review_required", "band_not_calibrated",
    ...(source.skill === "listening" ? ["human_recording_required", "listening_script_too_short"] : []),
  ];
  return { exam, warnings: [...new Set(warnings)] };
}
