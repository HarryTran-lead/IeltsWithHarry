import { createClient } from "@supabase/supabase-js";
import { createTextPracticeJob } from "../src/lib/ai-factory/produce";
import type { TextSkill } from "../src/lib/ai-factory/text-generation";

const topics: Record<TextSkill, string[]> = {
  Listening: ["Booking a community workshop", "Asking about a local cycling course", "Arranging a museum visit", "Registering for a language club"],
  Reading: ["Urban green spaces and wellbeing", "How communities preserve local archives", "Designing quieter public spaces", "The history of small inventions"],
  Writing: ["Public transport and city life", "Technology in education", "Protecting local cultural traditions", "Working from home and community life"],
  Speaking: ["A useful skill learned from someone", "A memorable public place", "A helpful conversation", "An activity shared with friends"],
};

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
  const skills: TextSkill[] = ["Listening", "Reading", "Writing", "Speaking"];
  const scheduled: Record<string, TextSkill> = {
    "37 18 * * *": "Listening", "47 18 * * *": "Reading", "57 18 * * *": "Writing", "7 19 * * *": "Speaking",
  };
  const requested = process.env.AI_FACTORY_SKILL;
  if (requested && !skills.includes(requested as TextSkill)) throw new Error("Invalid AI Factory skill");
  const skill = (requested as TextSkill | undefined) || scheduled[process.env.AI_FACTORY_SCHEDULE_CRON || ""] || skills[day % skills.length];
  const today = new Date(); today.setUTCHours(0, 0, 0, 0);
  const kind = skill === "Listening" ? "listening_audio" : skill.toLowerCase();
  const { count, error: duplicateError } = await client.from("ai_factory_jobs").select("id", { count: "exact", head: true }).eq("kind", kind).gte("created_at", today.toISOString());
  if (duplicateError) throw new Error(duplicateError.message);
  if (count) {
    console.log(`${skill} already has a Content Factory draft today; skipping duplicate.`);
    return;
  }
  const topic = topics[skill][Math.floor(day / skills.length) % topics[skill].length];
  const result = await createTextPracticeJob(client, skill, topic);
  console.log(`Created ${skill} practice job ${result.job.id}: ${result.status}`);
  if (result.status === "qa_failed") process.exitCode = 1;
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : "AI Factory text schedule failed");
  process.exitCode = 1;
});
