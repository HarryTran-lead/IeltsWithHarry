import Link from "next/link";
import { redirect } from "next/navigation";
import { Card } from "@/components/ui/card";
import { AdminEditor } from "@/features/admin/admin-editor";
import { demoMode, supabaseConfigured } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/server";

export default async function AdminPage() {
  if (demoMode || !supabaseConfigured) return <main className="admin-notice"><Card className="card"><h1>Admin CMS requires Supabase</h1><p>Configure a project and grant an admin account before managing content.</p><Link href="/app/dashboard" className="button primary">Back to demo →</Link></Card></main>;
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  if (!claims?.claims) redirect("/login");
  const { data: admin, error } = await supabase.rpc("is_admin");
  if (error || admin !== true) return <main className="admin-notice"><Card className="card"><h1>Access denied</h1><p>This account does not have curriculum editor access.</p><Link href="/app/dashboard" className="button primary">Student portal →</Link></Card></main>;
  return <AdminEditor />;
}
