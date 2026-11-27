import { z } from "zod";
import { viewer } from "../../../../lib/ielts-bank/server";
import { passageForScore, passageScore, textDifficulty, validRubric } from "../../../../lib/news/passage-difficulty";
import { MAP_SYSTEM, mapSchema } from "../../../../lib/news/question-factory-v2/prompts";
import { ArticleRequestBudget, FactoryProviderError, strictGeminiJson, v2Model } from "../../../../lib/news/question-factory-v2/provider";
import type { PassageMap } from "../../../../lib/news/question-factory-v2/types";

export const runtime = "nodejs";

/**
 * Calibration of the passage difficulty score against labelled Cambridge passages (admin only).
 * Runs the production passage map once on the text, the same request and model an article gets, and returns
 * the ratings behind the score. Nothing is stored: the text is copyrighted and used only for this measurement.
 */
const bodySchema = z.object({ title: z.string().trim().max(200).default(""), text: z.string().trim().min(400).max(12000) });
const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  try {
    await viewer(true);
  } catch {
    return Response.json({ error: "Admin only" }, { status: 403, headers: noStore });
  }
  const origin = request.headers.get("origin");
  if (origin && new URL(origin).host !== new URL(request.url).host) return Response.json({ error: "Invalid request origin" }, { status: 403, headers: noStore });
  if (Number(request.headers.get("content-length") || 0) > 16000) return Response.json({ error: "Request too large" }, { status: 413, headers: noStore });
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Send a title and a passage of 400–12,000 characters" }, { status: 400, headers: noStore });
  const { title, text } = parsed.data;
  try {
    const reply = await strictGeminiJson<{ passage_map?: PassageMap }>(MAP_SYSTEM, `TITLE: ${title}\n\nARTICLE:\n${text}`, mapSchema,
      new ArticleRequestBudget(1), fetch, 4000, v2Model());
    const map = reply.data?.passage_map;
    const score = passageScore(map?.difficulty, map?.passage_style, text);
    return Response.json({
      model: reply.model, style: map?.passage_style ?? null, rubric: validRubric(map?.difficulty),
      writerView: Boolean(map?.writer_view?.trim()), textDifficulty: textDifficulty(text), score,
      level: score === null ? null : passageForScore(score),
    }, { headers: noStore });
  } catch (error) {
    const status = error instanceof FactoryProviderError && error.kind === "quota" ? 429 : 502;
    return Response.json({ error: error instanceof Error ? error.message : "Gemini request failed" }, { status, headers: noStore });
  }
}
