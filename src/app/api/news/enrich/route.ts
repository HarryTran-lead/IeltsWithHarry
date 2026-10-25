import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { enrichNews } from "@/lib/news/enrichment";

export const runtime = "nodejs";
export const maxDuration = 60;

function validSecret(candidate: string, secret: string) {
  const a = Buffer.from(candidate); const b = Buffer.from(secret);
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function POST(request: NextRequest) {
  const secret = process.env.NEWS_SYNC_SECRET;
  const token = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const scheduled = Boolean(secret && validSecret(token, secret));
  let authorized = scheduled;
  if (!authorized) {
    const origin = request.headers.get("origin");
    if (!origin || origin !== request.nextUrl.origin) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
    const client = await createClient();
    const { data: claims } = await client.auth.getClaims();
    if (claims?.claims) {
      const { data: isAdmin } = await client.rpc("is_admin");
      authorized = isAdmin === true;
    }
  }
  if (!authorized) return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  try { return NextResponse.json(await enrichNews({ scheduled })); }
  catch (cause) {
    const message = cause && typeof cause === "object" && "message" in cause && typeof cause.message === "string"
      ? cause.message : "Enrichment failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
