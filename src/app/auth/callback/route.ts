import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { liveMode } from "@/lib/runtime";

export async function GET(request: Request) {
  const url = new URL(request.url);
  const code = url.searchParams.get("code");
  const next = url.searchParams.get("next");
  const isRecovery = next === "/reset-password";
  if (!liveMode) return NextResponse.redirect(new URL("/login", url.origin));
  if (code) {
    const supabase = await createClient();
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (!error) {
      if (isRecovery) return NextResponse.redirect(new URL("/reset-password", url.origin));
      const { data: isAdmin } = await supabase.rpc("is_admin");
      return NextResponse.redirect(new URL(isAdmin === true ? "/admin" : "/app/dashboard", url.origin));
    }
  }
  return NextResponse.redirect(new URL("/login?error=verification", url.origin));
}
