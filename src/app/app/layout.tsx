import "../news.css";
import "../community.css";
import "../study-room.css";
import "../learning-journey.css";
import { SuspendedNotice } from "@/components/account/suspended-notice";
import { StudyPresenceProvider } from "@/features/study-room/study-presence";
import { StudyRoomLayer } from "@/features/study-room/study-room-layer";
import { activeUntil } from "@/lib/account";
import { demoMode, supabaseConfigured } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/server";
import { getViewerRole } from "@/lib/viewer-role";

async function accountControls() {
  const supabase = await createClient();
  return supabase.from("account_controls").select("suspended_until,suspended_reason").maybeSingle();
}

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  if (!demoMode && !supabaseConfigured) return children;
  // Fetch the suspension row alongside the role instead of after it: one database round trip, not two.
  const [role, controls] = await Promise.all([
    getViewerRole(),
    demoMode ? null : accountControls(),
  ]);
  if (role === "guest") return children;
  if (!demoMode && role === "student" && controls) {
    // An admin can suspend a learner; the portal stays closed until the suspension ends.
    const { data, error } = controls;
    if (error) throw new Error("Could not load account controls");
    if (data && activeUntil(data.suspended_until)) return <SuspendedNotice until={data.suspended_until} reason={data.suspended_reason} />;
  }
  return <StudyPresenceProvider><StudyRoomLayer canManage={role === "admin"} />{children}</StudyPresenceProvider>;
}
