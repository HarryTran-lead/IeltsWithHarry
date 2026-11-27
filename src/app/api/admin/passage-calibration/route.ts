import { z } from "zod";
import { viewer } from "../../../../lib/ielts-bank/server";
import { PASSAGE_LABEL_SINCE, passageForScore, passageScore, textDifficulty, validRubric } from "../../../../lib/news/passage-difficulty";
import { newsAdminClient } from "../../../../lib/news/sync";
import { MAP_SYSTEM, mapSchema } from "../../../../lib/news/question-factory-v2/prompts";
import { alternateV2Model, ArticleRequestBudget, FactoryProviderError, strictGeminiJson, v2Model } from "../../../../lib/news/question-factory-v2/provider";
import type { PassageMap } from "../../../../lib/news/question-factory-v2/types";

export const runtime = "nodejs";

/**
 * Calibration of the passage difficulty score against labelled Cambridge passages (admin only).
 * Runs the production passage map once on the text, the same request and model an article gets, and returns
 * the ratings behind the score. Nothing is stored: the text is copyrighted and used only for this measurement.
 *
 * With an articleId instead of a text it re-scores one of the site's own articles labelled since the passage
 * label began (older articles are left as they are) and saves the new score and passage level.
 */
const bodySchema = z.union([
  z.object({ articleId: z.string().uuid() }),
  z.object({ title: z.string().trim().max(200).default(""), text: z.string().trim().min(400).max(12000) }),
]);
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
  if (!parsed.success) return Response.json({ error: "Send an articleId, or a title and a passage of 400–12,000 characters" }, { status: 400, headers: noStore });
  let title = "", text = "", articleId: string | null = null;
  if ("articleId" in parsed.data) {
    articleId = parsed.data.articleId;
    const db = newsAdminClient();
    const [body, article] = await Promise.all([
      db.from("news_article_bodies").select("body_text,ingested_at").eq("article_id", articleId).maybeSingle(),
      db.from("news_articles").select("title").eq("id", articleId).maybeSingle(),
    ]);
    if (body.error || article.error) return Response.json({ error: "Article could not be read" }, { status: 500, headers: noStore });
    if (!body.data?.body_text) return Response.json({ error: "Article not found" }, { status: 404, headers: noStore });
    if (!body.data.ingested_at || Date.parse(body.data.ingested_at) < PASSAGE_LABEL_SINCE) {
      return Response.json({ error: "Only articles labelled since the passage label began are re-scored" }, { status: 409, headers: noStore });
    }
    title = String(article.data?.title ?? "").slice(0, 200);
    text = body.data.body_text;
  } else {
    title = parsed.data.title;
    text = parsed.data.text;
  }
  try {
    // Like an article's map step, an overloaded model (503) falls back once to the other model.
    const ask = (model: string) => strictGeminiJson<{ passage_map?: PassageMap }>(MAP_SYSTEM, `TITLE: ${title}\n\nARTICLE:\n${text}`, mapSchema,
      new ArticleRequestBudget(1), fetch, 4000, model);
    const reply = await ask(v2Model()).catch((error) => {
      if (error instanceof FactoryProviderError && error.kind === "unavailable") return ask(alternateV2Model(v2Model()));
      throw error;
    });
    const map = reply.data?.passage_map;
    const score = passageScore(map?.difficulty, map?.passage_style, text);
    let saved = false;
    if (articleId && score !== null) {
      const { error } = await newsAdminClient().from("news_article_bodies")
        .update({ passage_score: score, reading_passage: passageForScore(score) }).eq("article_id", articleId);
      if (error) return Response.json({ error: `Score not saved (${error.message})` }, { status: 500, headers: noStore });
      saved = true;
    }
    return Response.json({ saved,
      model: reply.model, style: map?.passage_style ?? null, rubric: validRubric(map?.difficulty),
      writerView: Boolean(map?.writer_view?.trim()), textDifficulty: textDifficulty(text), score,
      level: score === null ? null : passageForScore(score),
    }, { headers: noStore });
  } catch (error) {
    const status = error instanceof FactoryProviderError && error.kind === "quota" ? 429 : 502;
    return Response.json({ error: error instanceof Error ? error.message : "Gemini request failed" }, { status, headers: noStore });
  }
}
