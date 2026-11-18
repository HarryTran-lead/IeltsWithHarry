import { z } from "zod";

export const transcriptSchema = z.object({
  text: z.string().min(1).max(12000),
  duration_seconds: z.number().positive().max(130),
  words: z.array(z.object({ word: z.string(), start: z.number().nonnegative(), end: z.number().positive() })).max(800),
  asr_model: z.string().min(1).max(80),
}).strict();
export type Transcript = z.infer<typeof transcriptSchema>;

export const coachingDraftSchema = z.object({
  areas: z.array(z.object({
    criterion: z.enum(["fluency_coherence", "lexical_resource", "grammar"]),
    evidence_quote: z.string().min(1).max(180),
    feedback_vi: z.string().min(1).max(650),
    practice_vi: z.string().min(1).max(400),
  }).strict()).length(3),
  strengths_vi: z.array(z.string().min(1).max(250)).min(1).max(3),
  next_steps_vi: z.array(z.string().min(1).max(250)).min(1).max(3),
}).strict();
export type CoachingDraft = z.infer<typeof coachingDraftSchema>;

/** Timestamp-derived observations, not IELTS bands or pronunciation ratings. */
export function speakingMetrics(transcript: Transcript) {
  const words = transcript.words.filter((word) => word.word.trim() && word.end >= word.start);
  let pauseCount = 0;
  let pauseSeconds = 0;
  for (let i = 1; i < words.length; i++) {
    const gap = words[i].start - words[i - 1].end;
    if (gap >= 2) { pauseCount++; pauseSeconds += gap; }
  }
  return {
    recognized_words: words.length,
    words_per_minute: Math.round(words.length * 60 / transcript.duration_seconds),
    long_pause_count: pauseCount,
    long_pause_seconds: Math.round(pauseSeconds * 10) / 10,
  };
}

export function verifyCoachingDraft(raw: unknown, transcript: string) {
  const draft = coachingDraftSchema.parse(raw);
  const expected = ["fluency_coherence", "lexical_resource", "grammar"];
  if (draft.areas.some((area, index) => area.criterion !== expected[index] || !transcript.includes(area.evidence_quote))) {
    throw new Error("SPEAKING_EVIDENCE_INVALID");
  }
  return draft;
}
