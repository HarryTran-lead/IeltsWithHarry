import { redirect } from "next/navigation";
import { StudyPresenceProvider } from "@/features/study-room/study-presence";
import { StudyRoomLayer } from "@/features/study-room/study-room-layer";
import { demoMode, supabaseConfigured } from "@/lib/runtime";
import { getViewerRole } from "@/lib/viewer-role";

export default async function StudentLayout({ children }: { children: React.ReactNode }) {
  if (!demoMode && !supabaseConfigured) return children;
  const role = await getViewerRole();
  if (role === "guest") redirect("/login");
  return <StudyPresenceProvider><StudyRoomLayer canManage={role === "admin"} />{children}</StudyPresenceProvider>;
}
