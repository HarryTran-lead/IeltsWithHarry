export const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
export const googleAuthEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true";
export const phoneAuthEnabled = process.env.NEXT_PUBLIC_ENABLE_PHONE_AUTH === "true";
export const emailDeliveryReady = process.env.NEXT_PUBLIC_EMAIL_DELIVERY_READY === "true";

export const supabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

export const liveMode = !demoMode && supabaseConfigured;
/** Community is enabled locally; production requires an explicit rollout flag. */
export const communityEnabled = process.env.NODE_ENV !== "production" || process.env.NEXT_PUBLIC_ENABLE_COMMUNITY === "true";
/** Explicit rollout switch; the legacy notes and timeline stay available until migration and QA are complete. */
export const smartNotebookV1 = liveMode && process.env.NEXT_PUBLIC_SMART_NOTEBOOK_V1 === "true";
/** Keep launch locks in production; the isolated develop Preview can expose work in progress. */
export const releaseLocks = process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_UNLOCK_DEV_FEATURES !== "true";
export function learnerSkillAvailable(skill: string | null | undefined) {
  return !releaseLocks || ["Reading", "reading", "Writing", "writing"].includes(skill ?? "");
}
export const productionLearnStage = "ielts-builder";
// Learn is locked for learners for now; add stage ids here (e.g. productionLearnStage) to reopen them.
const releasedLearnStages: string[] = [];

export function learnStageAvailable(stageId: string) {
  return !releaseLocks || releasedLearnStages.includes(stageId);
}

export function lockedLearnerPath(pathname: string) {
  if (pathname === "/app/self-study/listening" || pathname.startsWith("/app/self-study/listening/"))
    return releaseLocks && process.env.NEXT_PUBLIC_ENABLE_LISTENING_LAB !== "true";
  if (pathname === "/app/self-study" || pathname.startsWith("/app/self-study/")) return true;
  if (!releaseLocks) return false;
  if (["/app/reading", "/app/reading/live", "/app/reading/vocabulary", "/app/writing", "/app/writing/live", "/app/writing/task-1", "/app/writing/task-2"].includes(pathname)) return false;
  if (/^\/app\/question-bank\/(?:exam|attempt|result)\/[^/]+$/.test(pathname)) return false;
  // Listening (with its mock tests) and Learn (with its course lessons) stay locked until they reopen.
  return /^\/app\/(reading|listening|writing|speaking|question-bank|learn)(?:\/|$)/.test(pathname)
    || /^\/app\/vocabulary\/mode\//.test(pathname)
    || pathname === "/app/content-lab" || pathname.startsWith("/app/content-lab/")
    || pathname === "/app/news/learn" || pathname.startsWith("/app/news/learn/")
    || pathname === "/app/lesson" || pathname.startsWith("/app/lesson/")
    || pathname === "/app/check" || pathname.startsWith("/app/check/");
}
