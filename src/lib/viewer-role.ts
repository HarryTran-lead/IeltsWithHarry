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
  const { data, error } = await supabase.auth.getClaims();
  if (error || !data?.claims) return "guest";
  const { data: isAdmin } = await supabase.rpc("is_admin");
  return isAdmin === true ? "admin" : "student";
});
