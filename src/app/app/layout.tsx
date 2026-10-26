import { redirect } from "next/navigation";
import { SuspendedNotice } from "@/components/account/suspended-notice";
import { StudyPresenceProvider } from "@/features/study-room/study-presence";
import { StudyRoomLayer } from "@/features/study-room/study-room-layer";
import { activeUntil } from "@/lib/account";
import { demoMode, supabaseConfigured } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/server";
import { getViewerRole } from "@/lib/viewer-role";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  if (!demoMode && !supabaseConfigured) return children;
  const role = await getViewerRole();
  if (role === "guest") redirect("/login");
  if (!demoMode && role === "student") {
    // An admin can suspend a learner; the portal stays closed until the suspension ends.
    const supabase = await createClient();
    const { data, error } = await supabase.from("account_controls").select("suspended_until,suspended_reason").maybeSingle();
    if (error) throw new Error("Could not load account controls");
    if (data && activeUntil(data.suspended_until)) return <SuspendedNotice until={data.suspended_until} reason={data.suspended_reason} />;
  }
  return <StudyPresenceProvider><StudyRoomLayer canManage={role === "admin"} />{children}</StudyPresenceProvider>;
}
