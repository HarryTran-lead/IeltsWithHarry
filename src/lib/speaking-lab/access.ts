import "server-only";
import { demoMode, lockedLearnerPath } from "@/lib/runtime";
import { getViewerRole } from "@/lib/viewer-role";
import { SPEAKING_BASE } from "./types";

export type SpeakingAccess = { allowed: true } | { allowed: false; status: 401 | 403; error: string };

/** Signed-in learners once the lab is enabled, admins always; demo mode is local. */
export async function speakingAccess(): Promise<SpeakingAccess> {
  if (demoMode) return { allowed: true };
  const role = await getViewerRole();
  if (role === "guest") return { allowed: false, status: 401, error: "Hãy đăng nhập để luyện Speaking." };
  if (role !== "admin" && lockedLearnerPath(SPEAKING_BASE)) return { allowed: false, status: 403, error: "Speaking Lab đang chuẩn bị." };
  return { allowed: true };
}

export const privateHeaders = { "Cache-Control": "private, no-store" };
