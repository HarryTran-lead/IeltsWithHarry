import { Portal } from "@/features/portal";
import { GuestPortal } from "@/features/guest-portal";
import { getViewerRole } from "@/lib/viewer-role";

/**
 * The learner portal lives in this layout, not in the page: layouts stay mounted while the learner
 * moves between /app/* sections, so the header, sidebar and study data load once instead of on every
 * click. Each section is chosen client-side from the pathname (see Portal), so the page renders nothing.
 */
export default async function PortalLayout({ children }: { children: React.ReactNode }) {
  const role = await getViewerRole();
  return <>
    {role === "guest" ? <GuestPortal /> : <Portal canManage={role === "admin"} />}
    {children}
  </>;
}
