import { generateFactoryDraft } from "../src/lib/ai-factory/text-generation";
import { topicSeeds } from "../src/lib/ai-factory/kinds";

if (process.env.AI_FACTORY_FREE_TIER_CONFIRMED !== "true" || process.env.AI_FACTORY_FREE_TIER_ONLY !== "true" || !process.env.AI_FACTORY_GEMINI_API_KEY) {
  throw new Error("A confirmed, unbilled AI Factory key is required for the passage probe");
}

const setId = process.env.AI_FACTORY_PROBE_SET_ID || "set-2026-10-28";
if (!/^set-\d{4}-\d{2}-\d{2}$/.test(setId)) throw new Error("Invalid AI_FACTORY_PROBE_SET_ID");
const day = Math.floor(Date.parse(`${setId.slice(4)}T00:00:00Z`) / 86_400_000);
const kind = "reading_passage2";
const topic = topicSeeds[kind][day % topicSeeds[kind].length];

const draft = await generateFactoryDraft(kind, topic, { day, model: "gemini-3.7-flash", maxAttempts: 1, retryTransient: false });
const section = draft.exam.content.sections[0];
console.log(JSON.stringify({ kind, model: draft.model, title: draft.exam.title, passageWords: section.passage.trim().split(/\s+/).length,
  questions: section.questions.length, warnings: draft.warnings, usage: draft.usage }, null, 2));
if (draft.warnings.length) process.exitCode = 1;
