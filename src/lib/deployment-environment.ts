const PRODUCTION_SUPABASE_REF = "vpkhriywprepuhrbarye";

function supabaseRef(value: string | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "https:") return null;
    const match = /^([a-z0-9]+)\.supabase\.co$/.exec(url.hostname);
    return match?.[1] ?? null;
  } catch {
    return null;
  }
}

export function assertDeploymentEnvironment(env: Record<string, string | undefined>): void {
  const target = env.VERCEL_ENV;
  if (target !== "production" && target !== "preview") return;

  const projectRef = supabaseRef(env.NEXT_PUBLIC_SUPABASE_URL);
  const demo = env.NEXT_PUBLIC_DEMO_MODE === "true";

  if (target === "production") {
    if (demo || projectRef !== PRODUCTION_SUPABASE_REF) {
      throw new Error("Production must use the production Supabase project with demo mode disabled.");
    }
    return;
  }

  if (projectRef === PRODUCTION_SUPABASE_REF) {
    throw new Error("Preview deployments must never connect to the production Supabase project.");
  }
  if (!demo && (!projectRef || !env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY || !env.SUPABASE_SERVICE_ROLE_KEY)) {
    throw new Error("Live Preview requires a separate Supabase URL, publishable key and server-only service key.");
  }
}
