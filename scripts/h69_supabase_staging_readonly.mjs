// H69 opt-in LIVE Supabase STAGING smoke test. Never imports service_role or writes teacher reviews.
import { createClient } from "@supabase/supabase-js";

function stop(status, reason) {
  console.log(JSON.stringify({ milestone: "H69", scope: "LIVE_STAGING", status, reason, releaseGate: "NO_GO" }));
  process.exitCode = status === "PASS" ? 0 : status === "NOT_TESTED" ? 2 : 1;
}

const env = process.env;
if (env.H69_ALLOW_READ_ONLY_PROBE !== "YES_AUTHORIZED_STAGING") {
  stop("NOT_TESTED", "Explicit authorization required; no network request made");
} else {
  const ref = env.H69_SUPABASE_PROJECT_REF ?? "";
  const address = env.H69_SUPABASE_URL ?? "";
  let safe = false;
  try {
    const url = new URL(address);
    safe = /^[a-z0-9]{10,32}$/.test(ref)
      && url.protocol === "https:" && url.hostname === ref + ".supabase.co"
      && url.pathname === "/" && url.username === "" && url.password === "";
  } catch { /* keep blocked */ }
  const required = [
    "H69_SUPABASE_ANON_KEY", "H69_TEACHER_EMAIL", "H69_TEACHER_PASSWORD",
    "H69_OUTSIDER_EMAIL", "H69_OUTSIDER_PASSWORD",
  ];
  if (!safe || required.some(k => !env[k]) || env.H69_TEACHER_EMAIL === env.H69_OUTSIDER_EMAIL) {
    stop("NOT_TESTED", "Missing dedicated staging credentials or invalid project guard");
  } else {
    try {
      const client = createClient(address, env.H69_SUPABASE_ANON_KEY, {
        auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
      });
      async function user(email, password) {
        const login = await client.auth.signInWithPassword({ email, password });
        if (login.error || !login.data.session?.access_token) throw Error("AUTH_LOGIN_FAILED");
        const token = login.data.session.access_token;
        const verified = await client.auth.getUser(token);
        if (verified.error || !verified.data.user?.id || verified.data.user.id !== login.data.user?.id) {
          throw Error("AUTH_GETUSER_FAILED");
        }
        return { token, userId: verified.data.user.id };
      }
      const teacher = await user(env.H69_TEACHER_EMAIL, env.H69_TEACHER_PASSWORD);
      const outsider = await user(env.H69_OUTSIDER_EMAIL, env.H69_OUTSIDER_PASSWORD);
      if (teacher.userId === outsider.userId) throw Error("IDENTITY_NOT_DISTINCT");
      // Use independent authenticated fetches. No direct access to private H58.
      const privateRead = async (jwt) => {
        const res = await fetch(new URL("/rest/v1/probes?select=probe_id&limit=1", address), {
          headers: {
            apikey: env.H69_SUPABASE_ANON_KEY,
            Authorization: "Bearer " + jwt,
            "Accept-Profile": "r19_h58",
          }, signal: AbortSignal.timeout(12000),
        });
        if (res.ok) throw Error("PRIVATE_H58_EXPOSED");
      };
      await privateRead(teacher.token);
      await privateRead(outsider.token);
      // Invalid and unassigned request is guaranteed non-writing even if DBA accidentally opened the gate.
      const noWrite = await fetch(new URL("/rest/v1/rpc/h68_submit_review", address), {
        method: "POST",
        headers: {
          apikey: env.H69_SUPABASE_ANON_KEY,
          Authorization: "Bearer " + teacher.token,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          p_probe_id: "H69-INVALID-PROBE-DO-NOT-CREATE",
          p_fingerprint: "f".repeat(64),
          p_meaning: "PRESERVES_MEANING",
          p_grammar: "ACCEPTABLE",
          p_evidence_quote: "teacher",
          p_reason: "This is a deliberately invalid nonwriting smoke test.",
          p_uncertainty_reason: "",
          p_idempotency_key: "h69_nonwriting_probe_key_0000001",
        }), signal: AbortSignal.timeout(12000),
      });
      const result = await noWrite.json().catch(() => ({}));
      if (noWrite.ok) throw Error("UNEXPECTED_WRITE_SUCCESS");
      if (result?.message !== "H68_DB_DISABLED") throw Error("DB_KILL_SWITCH_NOT_CONFIRMED");
      stop("PASS", "Supabase Auth confirmed; private tables denied; DB gate disabled. No learner release.");
    } catch (e) {
      stop("FAIL", e instanceof Error ? e.message : "Unknown validation failure");
    }
  }
}
