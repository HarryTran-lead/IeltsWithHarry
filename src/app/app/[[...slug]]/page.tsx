import { Portal } from "@/features/portal";
import { demoMode, supabaseConfigured } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";

export default async function AppPage() {
  if (!demoMode) {
    if (!supabaseConfigured) return <main className="setup-notice"><h1>Backend setup required</h1><p>Connect Supabase to enable learner accounts and saved progress. See the project README for setup steps.</p></main>;
    const supabase = await createClient();
    const { data, error } = await supabase.auth.getClaims();
    if (error || !data?.claims) redirect("/login");
  }
  return <Portal />;
}
