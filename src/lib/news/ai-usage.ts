import { createClient } from "@supabase/supabase-js";

/** Which Gemini key a call used. Free Tier quotas are per key (per Google Cloud project). */
export type AiUsageKey = "quiz" | "article" | "shared" | "custom";
export type AiUsageOutcome = "ok" | "unavailable" | "quota" | "error";

/** HTTP status of a Gemini reply, or null when the request failed or timed out before a reply. */
export function aiUsageOutcome(status: number | null): AiUsageOutcome {
  if (status === null) return "error";
  if (status >= 200 && status < 300) return "ok";
  if (status === 429) return "quota";
  if (status >= 500) return "unavailable";
  return "error";
}

function makeClient(url: string, key: string) {
  return createClient(url, key, { auth: { autoRefreshToken: false, persistSession: false } });
}
let client: ReturnType<typeof makeClient> | null | undefined;
function usageClient() {
  if (client !== undefined) return client;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  // Tests and local runs without service credentials simply do not count.
  client = url && key && !process.env.VITEST ? makeClient(url, key) : null;
  return client;
}

/**
 * Counts one Gemini call for the admin usage panel. Counting never fails or slows the
 * calling job by more than a moment: errors are ignored and the write is bounded.
 */
export async function recordAiUsage(key: AiUsageKey, model: string, status: number | null, system?: string) {
  const db = usageClient();
  if (!db) return;
  const outcome = aiUsageOutcome(status);
  const step = system ? aiUsageStep(system) : "";
  try {
    await Promise.race([
      Promise.all([
        db.rpc("news_record_ai_usage", { p_key: key, p_model: model.slice(0, 80), p_outcome: outcome }),
        ...(step ? [db.rpc("news_record_ai_step", { p_key: key, p_step: step, p_outcome: outcome })] : []),
      ]),
      new Promise((resolve) => setTimeout(resolve, 1500)),
    ]);
  } catch { /* usage counts are best effort */ }
}

/** The pipeline step of a call: the opening words of the app's own system instruction, at most 48 characters. */
export function aiUsageStep(system: string) {
  return system.replace(/\s+/g, " ").trim().slice(0, 48).trim();
}
