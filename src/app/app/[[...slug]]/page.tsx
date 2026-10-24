import { Portal } from "@/features/portal";
import { demoMode, supabaseConfigured } from "@/lib/runtime";
import { getViewerRole } from "@/lib/viewer-role";
import { redirect } from "next/navigation";

export default async function AppPage() {
  if (!demoMode && !supabaseConfigured) return <main className="setup-notice"><h1>Backend setup required</h1><p>Connect Supabase to enable learner accounts and saved progress. See the project README for setup steps.</p></main>;
  const role = await getViewerRole();
  if (role === "guest") redirect("/login");
  return <Portal canManage={role === "admin"} />;
}
