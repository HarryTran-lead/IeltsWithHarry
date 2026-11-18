import "server-only";
import { demoMode, lockedLearnerPath } from "@/lib/runtime";
import { getViewerRole } from "@/lib/viewer-role";
import { TASK2_BASE } from "./types";

export type Task2Access = { allowed: true } | { allowed: false; status: 401 | 403; error: string };

/** Signed-in learners while the lab is released (always outside production), admins always; demo mode is local. */
export async function task2Access(): Promise<Task2Access> {
  if (demoMode) return { allowed: true };
  const role = await getViewerRole();
  if (role === "guest") return { allowed: false, status: 401, error: "Hãy đăng nhập để luyện Writing Task 2." };
  if (role !== "admin" && lockedLearnerPath(TASK2_BASE)) return { allowed: false, status: 403, error: "Writing Task 2 Lab đang chuẩn bị." };
  return { allowed: true };
}

export const privateHeaders = { "Cache-Control": "private, no-store" };
