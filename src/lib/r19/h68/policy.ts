import { z } from "zod";

export const reviewSchema = z.object({
  probeId: z.string().min(1).max(120),
  fingerprint: z.string().regex(/^[a-f0-9]{64}$/),
  meaning: z.enum(["PRESERVES_MEANING", "MEANING_DRIFT", "UNCERTAIN"]),
  grammar: z.enum(["ACCEPTABLE", "MINOR_FORM_ISSUE", "MAJOR_FORM_ISSUE", "NOT_RATED"]),
  evidenceQuote: z.string().trim().min(2).max(240),
  reason: z.string().trim().min(20).max(2000),
  uncertaintyReason: z.string().max(1000).default(""),
}).strict().superRefine((data, ctx) => {
  if (data.meaning === "UNCERTAIN" && data.uncertaintyReason.trim().length < 12) {
    ctx.addIssue({ code: "custom", path: ["uncertaintyReason"], message: "Required for uncertainty" });
  }
});

export function h68Enabled(env: Record<string, string | undefined>): boolean {
  return env.H68_REVIEW_WRITES_ENABLED === "true"
    && env.H61_LEARNER_RELEASE !== "true"
    && env.H61_AUTO_GRADING !== "true";
}

export function validOrigin(origin: string | null, allowed: string | undefined): boolean {
  if (!origin || !allowed) return false;
  try {
    const target = new URL(allowed);
    return target.protocol === "https:" && target.origin === allowed && origin === allowed;
  } catch { return false; }
}

export function validKey(key: string | null): boolean {
  return typeof key === "string" && /^[A-Za-z0-9_-]{16,128}$/.test(key);
}
