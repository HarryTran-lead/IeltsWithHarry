import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { AdminEditor } from "@/features/admin/admin-editor";
import { DemoAdminEditor } from "@/features/admin/demo-admin-editor";
import { demoMode, supabaseConfigured } from "@/lib/runtime";
import { getViewerRole } from "@/lib/viewer-role";

export default async function AdminPage() {
  if (!demoMode && !supabaseConfigured) return <main className="admin-notice"><Card className="card"><h1>Admin CMS requires Supabase</h1><p>Configure a project and grant an admin account before managing content.</p></Card></main>;
  const role = await getViewerRole();
  if (role === "guest") redirect("/login");
  if (role !== "admin") return <main className="admin-notice"><Card className="card"><h1>Access denied</h1><p>This account does not have curriculum editor access.</p><Link href="/app/dashboard" className="button primary">Student portal →</Link></Card></main>;
  if (demoMode) return <DemoAdminEditor />;
  return <AdminEditor />;
}
