import { NextRequest, NextResponse } from "next/server";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";

export const runtime = "nodejs";

const translation = z.object({ language: z.object({ code: z.string() }), word: z.string() });
const sense = z.object({
  definition: z.string(),
  examples: z.array(z.string()).optional(),
  translations: z.array(translation).optional(),
  synonyms: z.array(z.string()).optional(),
  antonyms: z.array(z.string()).optional(),
});
const entry = z.object({
  partOfSpeech: z.string(),
  pronunciations: z.array(z.object({ type: z.string(), text: z.string() })).optional(),
  senses: z.array(sense),
});
const dictionaryResponse = z.object({ word: z.string(), entries: z.array(entry), source: z.object({ url: z.string(), license: z.object({ name: z.string(), url: z.string() }) }) });

export async function GET(request: NextRequest) {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims) return NextResponse.json({ error: "Cần đăng nhập để tra từ." }, { status: 401 });
  const word = request.nextUrl.searchParams.get("word")?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
  if (!/^[a-z][a-z' -]{0,59}$/.test(word)) return NextResponse.json({ error: "Nhập một từ hoặc cụm từ tiếng Anh hợp lệ." }, { status: 400 });
  const { data: allowed, error: quotaError } = await db.rpc("vocabulary_claim_lookup_quota");
  if (quotaError) return NextResponse.json({ error: "Chưa thể tra từ lúc này. Hãy thử lại sau." }, { status: 503 });
  if (!allowed) return NextResponse.json({ error: "Đã dùng hết 100 lượt tra từ hôm nay. Hãy quay lại ngày mai." }, { status: 429 });
  try {
    const response = await fetch(`https://freedictionaryapi.com/api/v1/entries/en/${encodeURIComponent(word)}?translations=true`, {
      headers: { Accept: "application/json", "User-Agent": "IeltsWithHarry/1.0 (vocabulary lookup)" },
      signal: AbortSignal.timeout(8000), next: { revalidate: 86400 },
    });
    if (response.status === 404) return NextResponse.json({ error: "Từ điển chưa có mục từ này." }, { status: 404 });
    if (!response.ok) return NextResponse.json({ error: "Nguồn từ điển đang bận. Hãy thử lại sau." }, { status: 502 });
    const parsed = dictionaryResponse.safeParse(await response.json());
    if (!parsed.success) return NextResponse.json({ error: "Nguồn từ điển trả về dữ liệu chưa hỗ trợ." }, { status: 502 });
    const meanings = parsed.data.entries.slice(0, 4).flatMap((item) => item.senses.slice(0, 3).map((meaning) => ({
      pos: item.partOfSpeech.slice(0, 50),
      definition: meaning.definition.slice(0, 500),
      meaningVi: [...new Set((meaning.translations ?? []).filter((value) => value.language.code === "vi").map((value) => value.word))].slice(0, 3).join("; ").slice(0, 200),
      example: meaning.examples?.[0]?.slice(0, 500) ?? "",
      synonyms: meaning.synonyms?.slice(0, 5) ?? [],
      antonyms: meaning.antonyms?.slice(0, 5) ?? [],
    }))).slice(0, 8);
    const ipa = parsed.data.entries.flatMap((item) => item.pronunciations ?? []).find((item) => item.type === "ipa")?.text ?? "";
    return NextResponse.json({ word: parsed.data.word.slice(0, 100), ipa, meanings, source: {
      name: "FreeDictionaryAPI.com / Wiktionary",
      url: parsed.data.source.url.startsWith("https://en.wiktionary.org/wiki/") ? parsed.data.source.url : `https://en.wiktionary.org/wiki/${encodeURIComponent(word)}`,
      license: "CC BY-SA 4.0",
      licenseUrl: "https://creativecommons.org/licenses/by-sa/4.0/",
    } }, { headers: { "Cache-Control": "private, no-store" } });
  } catch {
    return NextResponse.json({ error: "Không kết nối được nguồn từ điển. Hãy thử lại sau." }, { status: 502 });
  }
}
