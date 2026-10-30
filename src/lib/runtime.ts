export const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
export const googleAuthEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true";
export const phoneAuthEnabled = process.env.NEXT_PUBLIC_ENABLE_PHONE_AUTH === "true";
export const emailDeliveryReady = process.env.NEXT_PUBLIC_EMAIL_DELIVERY_READY === "true";

export const supabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

export const liveMode = !demoMode && supabaseConfigured;
/** Explicit rollout switch; the legacy notes and timeline stay available until migration and QA are complete. */
export const smartNotebookV1 = liveMode && process.env.NEXT_PUBLIC_SMART_NOTEBOOK_V1 === "true";
/** Keep launch locks in production; the isolated develop Preview can expose work in progress. */
export const releaseLocks = process.env.NODE_ENV === "production" && process.env.NEXT_PUBLIC_UNLOCK_DEV_FEATURES !== "true";

export function lockedLearnerPath(pathname: string) {
  if (!releaseLocks) return false;
  return /^\/app\/(grammar|reading|listening|writing|speaking|question-bank|learn)(?:\/|$)/.test(pathname)
    || /^\/app\/vocabulary\/mode\//.test(pathname)
    || pathname === "/app/content-lab" || pathname.startsWith("/app/content-lab/")
    || pathname === "/app/news/learn" || pathname.startsWith("/app/news/learn/")
    || pathname === "/app/lesson" || pathname.startsWith("/app/lesson/")
    || pathname === "/app/check" || pathname.startsWith("/app/check/");
}
