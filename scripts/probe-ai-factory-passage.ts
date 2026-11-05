import { generateFactoryDraft } from "../src/lib/ai-factory/text-generation";
import { topicSeeds } from "../src/lib/ai-factory/kinds";

async function diagnosticRequest(model: string, label: string, prompt: string, schema?: object) {
  const started = Date.now();
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST", signal: AbortSignal.timeout(120_000),
    headers: { "x-goog-api-key": process.env.AI_FACTORY_GEMINI_API_KEY!, "Content-Type": "application/json" },
    body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { maxOutputTokens: schema ? 4500 : 64,
      ...(schema ? { responseFormat: { text: { mimeType: "APPLICATION_JSON", schema } } } : {}) } }),
  });
  const body = await response.json() as { error?: { code?: number; status?: string; message?: string }; candidates?: { content?: { parts?: { text?: string }[] } }[] };
  const result = { label, model, status: response.status, durationMs: Date.now() - started,
    ...(response.ok ? {} : { errorCode: body.error?.code, errorStatus: body.error?.status, errorMessage: body.error?.message?.slice(0, 240) }) };
  if (!response.ok) { console.log(JSON.stringify(result)); return false; }
  const answer = body.candidates?.[0]?.content?.parts?.map((part) => part.text ?? "").join("") ?? "";
  const paragraphs = schema ? (JSON.parse(answer) as { paragraphs?: string[] }).paragraphs ?? [] : [];
  console.log(JSON.stringify({ ...result, ...(schema ? { paragraphs: paragraphs.length, passageWords: paragraphs.join(" ").trim().split(/\s+/).length } : { replied: Boolean(answer) }) }));
  return true;
}

async function main() {
  if (process.env.AI_FACTORY_FREE_TIER_CONFIRMED !== "true" || process.env.AI_FACTORY_FREE_TIER_ONLY !== "true" || !process.env.AI_FACTORY_GEMINI_API_KEY) {
    throw new Error("A confirmed, unbilled AI Factory key is required for the passage probe");
  }

  const setId = process.env.AI_FACTORY_PROBE_SET_ID || "set-2026-10-28";
  if (!/^set-\d{4}-\d{2}-\d{2}$/.test(setId)) throw new Error("Invalid AI_FACTORY_PROBE_SET_ID");
  const day = Math.floor(Date.parse(`${setId.slice(4)}T00:00:00Z`) / 86_400_000);
  const kind = "reading_passage2";
  const topic = topicSeeds[kind][day % topicSeeds[kind].length];
  const model = process.env.AI_FACTORY_PROBE_MODEL || "gemini-3.7-flash";
  if (!["gemini-3.7-flash", "gemini-3.6-flash"].includes(model)) throw new Error("Unsupported probe model");
  if (process.env.AI_FACTORY_PROBE_MODE === "diagnostic") {
    const tiny = await diagnosticRequest(model, "tiny", "Reply with the single word OK.");
    if (!tiny) { process.exitCode = 1; return; }
    const schema = { type: "object", additionalProperties: false, required: ["paragraphs"], properties: { paragraphs: { type: "array", items: { type: "string" } } } };
    const passage = await diagnosticRequest(model, "passage-only", `Write an original IELTS Academic Reading Passage 2 about ${topic}. Write 800-950 words in 6-8 paragraphs. Return the paragraphs as JSON strings, without questions.`, schema);
    if (!passage) process.exitCode = 1;
    return;
  }

  const draft = await generateFactoryDraft(kind, topic, { day, model, maxAttempts: 1, retryTransient: false });
  const section = draft.exam.content.sections[0];
  console.log(JSON.stringify({ kind, model: draft.model, title: draft.exam.title, passageWords: section.passage.trim().split(/\s+/).length,
    questions: section.questions.length, warnings: draft.warnings, usage: draft.usage }, null, 2));
  if (draft.warnings.length) process.exitCode = 1;
}

main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
