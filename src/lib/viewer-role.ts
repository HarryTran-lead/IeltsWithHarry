import { cookies } from "next/headers";
import { cache } from "react";
import { demoMode, supabaseConfigured } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/server";

export const DEMO_ROLE_COOKIE = "esl_demo_role";
export type ViewerRole = "guest" | "student" | "admin";

export function parseDemoRole(value: string | undefined): ViewerRole {
  return value === "student" || value === "admin" ? value : "guest";
}

export const getViewerRole = cache(async (): Promise<ViewerRole> => {
  if (demoMode) return parseDemoRole((await cookies()).get(DEMO_ROLE_COOKIE)?.value);
  if (!supabaseConfigured) return "guest";
  const supabase = await createClient();
  // Ask both at once: each is a round trip to the database, and is_admin is simply false for a guest.
  const [{ data, error }, { data: isAdmin }] = await Promise.all([
    supabase.auth.getClaims(),
    supabase.rpc("is_admin"),
  ]);
  if (error || !data?.claims) return "guest";
  return isAdmin === true ? "admin" : "student";
});
