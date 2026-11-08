import { Portal } from "@/features/portal";
import { GuestPortal } from "@/features/guest-portal";
import { getViewerRole } from "@/lib/viewer-role";

export default async function AppPage() {
  const role = await getViewerRole();
  if (role === "guest") return <GuestPortal />;
  return <Portal canManage={role === "admin"} />;
}
