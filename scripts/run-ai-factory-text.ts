import { createClient } from "@supabase/supabase-js";
import { createTextPracticeJob } from "../src/lib/ai-factory/produce";
import { factoryKinds, kindForSlot, topicSeeds, type FactoryKind } from "../src/lib/ai-factory/kinds";

// Five daily slots (UTC): two Listening parts, Reading, Writing, Speaking. See kindForSlot for the rotation.
const slots: Record<string, number> = { "27 8 * * *": 0, "37 8 * * *": 1, "47 8 * * *": 2, "57 8 * * *": 3, "7 9 * * *": 4 };

async function main() {
  if (process.env.AI_FACTORY_FREE_TIER_CONFIRMED !== "true" || process.env.AI_FACTORY_FREE_TIER_ONLY !== "true" || !process.env.AI_FACTORY_GEMINI_API_KEY) {
    console.log("AI Factory text schedule is unconfigured; no model request made.");
    return;
  }
  const url = process.env.AI_FACTORY_SUPABASE_URL;
  const key = process.env.AI_FACTORY_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("AI Factory database configuration is missing");
  const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const { data: settings, error } = await client.from("ai_factory_settings").select("generation_enabled,daily_job_limit,paid_provider_enabled").eq("id", true).single();
  if (error) throw new Error(error.message);
  if (!settings.generation_enabled || !settings.daily_job_limit || settings.paid_provider_enabled) {
    console.log("AI Factory text schedule is disabled by production settings.");
    return;
  }
  const day = Math.floor(Date.now() / 86_400_000);
  // A manual run may name a kind (or, as before, a skill, meaning that skill's first kind).
  const requested = process.env.AI_FACTORY_KIND || process.env.AI_FACTORY_SKILL || "";
  const named = requested in factoryKinds ? requested as FactoryKind : (Object.keys(factoryKinds) as FactoryKind[]).find((item) => factoryKinds[item].skill === requested);
  if (requested && !named) throw new Error("Invalid AI Factory kind");
  const kind = named ?? kindForSlot(slots[process.env.AI_FACTORY_SCHEDULE_CRON || ""] ?? day % 5, day);
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const { count, error: duplicateError } = await client.from("ai_factory_jobs").select("id", { count: "exact", head: true }).contains("payload", { factoryKind: kind }).gte("created_at", today.toISOString());
  if (duplicateError) throw new Error(duplicateError.message);
  if (count) {
    console.log(`${kind} already has a Content Factory draft today; skipping duplicate.`);
    return;
  }
  // Recent factory titles for the same skill, so the model does not repeat a topic or angle.
  const { data: recent } = await client.from("ielts_exams").select("title").eq("source_id", "ai-factory").eq("skill", factoryKinds[kind].skill).order("created_at", { ascending: false }).limit(30);
  const seeds = topicSeeds[kind];
  const topic = seeds[day % seeds.length];
  const result = await createTextPracticeJob(client, kind, topic, null, { day, avoid: (recent ?? []).map((row) => row.title) });
  console.log(`Created ${kind} practice job ${result.job.id}: ${result.status}${result.warnings.length ? ` (${result.warnings.join("; ").slice(0, 400)})` : ""}`);
  if (result.status === "qa_failed") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "AI Factory text schedule failed");
  process.exitCode = 1;
});
