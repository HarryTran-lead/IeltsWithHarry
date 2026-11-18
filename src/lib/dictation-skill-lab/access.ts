import { demoMode } from "@/lib/runtime";
import { getViewerRole } from "@/lib/viewer-role";
import { skillLabOpenToLearners } from "./preview";

export type SkillLabAccess = { allowed: true; preview: boolean } | { allowed: false; status: 401 | 403; error: string };

/** Admins can always review the bank; demo mode is local and always open. */
export async function skillLabAccess(): Promise<SkillLabAccess> {
  if (demoMode) return { allowed: true, preview: true };
  const role = await getViewerRole();
  if (role === "guest") return { allowed: false, status: 401, error: "Hãy đăng nhập để luyện Dictation." };
  if (role === "admin") return { allowed: true, preview: true };
  if (skillLabOpenToLearners()) return { allowed: true, preview: true };
  return { allowed: false, status: 403, error: "Kho Skill Lab đang tạm đóng." };
}
