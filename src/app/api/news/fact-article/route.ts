import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { newsAdminClient } from "@/lib/news/sync";
import { writeArticleFromFacts } from "@/lib/news/fact-dossier";

export const runtime = "nodejs";
export const maxDuration = 180;

export async function POST(request: NextRequest) {
  if (request.headers.get("origin") !== request.nextUrl.origin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  const viewer = await createClient();
  const { data: claims } = await viewer.auth.getClaims();
  const { data: admin } = claims?.claims ? await viewer.rpc("is_admin") : { data: false };
  if (admin !== true) return NextResponse.json({ error: "Admin access required" }, { status: 403 });

  try {
    // The model receives only the editor's atomic factual notes, never a publisher's article body.
    const written = await writeArticleFromFacts(await request.json());
    const db = newsAdminClient();
    const { data: source, error: sourceError } = await db.from("news_sources").select("id").eq("provider", "manual").single();
    if (sourceError || !source) throw new Error(sourceError?.message ?? "Manual news source unavailable");
    const id = randomUUID();
    const sourceUrl = written.dossier.facts[0].source_url;
    const article = await db.from("news_articles").insert({
      id, source_id: source.id, provider: "manual", external_id: `fact-dossier:${id}`,
      canonical_hash: createHash("sha256").update(`fact-dossier:${id}`).digest("hex"),
      canonical_url: sourceUrl, title: written.title, publisher: "IeltsWithHarry", category: written.dossier.category,
      published_at: new Date().toISOString(), publication_status: "review", sensitive: false,
      attribution_text: "Factual sources recorded in the editorial dossier", metadata: { fact_dossier: true },
    });
    if (article.error) throw new Error(article.error.message);
    const body = await db.from("news_article_bodies").insert({
      article_id: id, body_text: written.body, source_url: sourceUrl, ai_generated: true,
      byline: "IeltsWithHarry editorial", rights_basis: `Original AI-assisted article drafted from verified atomic facts. Editorial dossier: ${JSON.stringify({ topic: written.dossier.topic, facts: written.dossier.facts, model: written.model, verified_with: written.verified_with, reviewed_with: written.reviewed_with })}`,
    });
    if (body.error) {
      await db.from("news_articles").delete().eq("id", id);
      throw new Error(body.error.message);
    }
    const dossier = await db.from("news_fact_dossiers").insert({ article_id: id, dossier: written.dossier, verification_model: written.verified_with });
    if (dossier.error) { await db.from("news_articles").delete().eq("id", id); throw new Error(dossier.error.message); }
    return NextResponse.json({ id, status: "review" }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (cause) {
    return NextResponse.json({ error: cause instanceof Error ? cause.message : "Fact article creation failed" }, { status: 400 });
  }
}
