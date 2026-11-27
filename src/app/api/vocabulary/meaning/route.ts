import { createClient as createAdminClient } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { wordForms } from "@/lib/vocabulary/quick-define";

export const runtime = "nodejs";

type Row = { headword: string; pos: string; meaning_vi: string | null; auto_meaning_vi: string | null; auto_meaning_options: string[] | null; published: boolean };

/**
 * Vietnamese meanings for a word from the site's English–Vietnamese dictionary data (vocabulary_bank_entries:
 * editor-reviewed meanings first, then Thichhoc/Skypedia dictionary senses). No machine translation.
 */
export async function GET(request: NextRequest) {
  const db = await createClient();
  const { data } = await db.auth.getClaims();
  if (!data?.claims) return NextResponse.json({ error: "Cần đăng nhập để tra từ." }, { status: 401 });
  const word = request.nextUrl.searchParams.get("word")?.trim().replace(/\s+/g, " ").toLowerCase() ?? "";
  if (!/^[a-z][a-z' -]{0,39}$/.test(word)) return NextResponse.json({ error: "Nhập một từ tiếng Anh hợp lệ." }, { status: 400 });
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL, serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) return NextResponse.json({ error: "Máy chủ chưa cấu hình từ điển." }, { status: 503 });
  const admin = createAdminClient(url, serviceKey, { auth: { autoRefreshToken: false, persistSession: false } });
  const forms = wordForms(word).filter((form) => /^[a-z][a-z' -]*$/.test(form));
  const { data: rows, error } = await admin.from("vocabulary_bank_entries")
    .select("headword,pos,meaning_vi,auto_meaning_vi,auto_meaning_options,published")
    .or(forms.map((form) => `headword.ilike.${form}`).join(","))
    .or("published.eq.true,student_visible.eq.true")
    .limit(12);
  if (error) return NextResponse.json({ error: "Chưa tra được từ điển lúc này." }, { status: 503 });
  // The exact word before its base forms ("parks" before "park"), reviewed meanings before dictionary candidates.
  const rank = (row: Row) => forms.indexOf(row.headword.toLowerCase()) * 10 + (row.published && row.meaning_vi ? 0 : 1);
  const meanings = ((rows ?? []) as Row[]).sort((a, b) => rank(a) - rank(b)).flatMap((row) => {
    const reviewed = Boolean(row.published && row.meaning_vi?.trim());
    const senses = reviewed ? [row.meaning_vi!.trim()] : [...new Set([row.auto_meaning_vi ?? "", ...(row.auto_meaning_options ?? [])].map((value) => value.trim()).filter(Boolean))].slice(0, 3);
    return senses.length ? [{ headword: row.headword, pos: row.pos, vi: senses.join("; "), reviewed }] : [];
  });
  return NextResponse.json({ word, meanings }, { headers: { "Cache-Control": "private, max-age=3600" } });
}
