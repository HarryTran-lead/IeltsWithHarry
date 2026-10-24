import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { liveMode } from "@/lib/runtime";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const destination = next === "/reset-password" ? next : "/app/dashboard";
  if (!liveMode) return NextResponse.redirect(new URL("/login", url.origin));
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) return NextResponse.redirect(new URL(destination, url.origin));
  }
  return NextResponse.redirect(new URL("/login?error=verification", url.origin));
}
