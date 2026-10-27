export const demoMode = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
export const googleAuthEnabled = process.env.NEXT_PUBLIC_ENABLE_GOOGLE_AUTH === "true";
export const phoneAuthEnabled = process.env.NEXT_PUBLIC_ENABLE_PHONE_AUTH === "true";
export const emailDeliveryReady = process.env.NEXT_PUBLIC_EMAIL_DELIVERY_READY === "true";

export const supabaseConfigured = Boolean(
  process.env.NEXT_PUBLIC_SUPABASE_URL &&
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
);

export const liveMode = !demoMode && supabaseConfigured;
/** Hide unfinished learner experiences in deployed builds until their content is ready. */
export const releaseLocks = process.env.NODE_ENV === "production";

export function lockedLearnerPath(pathname: string) {
  if (!releaseLocks) return false;
  return pathname === "/app/grammar" || pathname.startsWith("/app/grammar/")
    || /^\/app\/(vocabulary|reading|listening|writing|speaking)\/mode\//.test(pathname)
    || pathname === "/app/content-lab" || pathname.startsWith("/app/content-lab/")
    || pathname === "/app/news/learn" || pathname.startsWith("/app/news/learn/")
    || pathname === "/app/listening/youtube" || pathname.startsWith("/app/listening/youtube/")
    || ["foundation", "elementary", "pre-ielts"].some((stage) => pathname === `/app/learn/${stage}` || pathname.startsWith(`/app/learn/${stage}/`));
}
