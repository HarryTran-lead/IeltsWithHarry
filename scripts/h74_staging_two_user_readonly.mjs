#!/usr/bin/env node
// H74/M02 opt-in *read-only* live Supabase STAGING check for two isolated test users.
// NO inserts, updates, deletes, RPCs, tokens in logs, service_role, or production.
// Does not count as 18/18 H71 attestation; an independent reviewer is still required.
import { readFileSync } from "node:fs";

const RUN_FLAG = "YES_AUTHORIZED_STAGING_TWO_USER_READONLY";
const env = process.env;
const required = [
  "H74_STAGING_PROJECT_REF", "H74_STAGING_URL", "H74_STAGING_PUBLISHABLE_KEY",
  "H74_STAGING_USER_A_JWT", "H74_STAGING_USER_B_JWT",
  "H74_STAGING_USER_A_ATTEMPT_ID", "H74_STAGING_USER_B_ATTEMPT_ID",
];
function stop(status, reason, checks = []) {
  console.log(JSON.stringify({
    milestone: "H74/M02", scope: "LIVE_STAGING_READ_ONLY",
    status, reason, checks, release_gate: "NO_GO",
    h71_live_checks_approved: 0, independent_review_required: true,
  }));
  process.exitCode = status === "PASS" ? 0 : status === "NOT_TESTED" ? 2 : 1;
}
function sameIdFormat(value) {
  return typeof value === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
}
function configuration() {
  const content = readFileSync(new URL("../src/lib/deployment-environment.ts", import.meta.url), "utf8");
  const match = /const PRODUCTION_SUPABASE_REF = "([a-z0-9]{10,32})";/.exec(content);
  if (!match) return null; // Cannot prove isolation from production: fail closed.
  const stageRef = env.H74_STAGING_PROJECT_REF;
  if (!/^[a-z0-9]{10,32}$/.test(stageRef || "") || stageRef === match[1]) return null;
  try {
    const url = new URL(env.H74_STAGING_URL);
    if (url.protocol !== "https:" || url.hostname !== `${stageRef}.supabase.co` ||
        url.pathname !== "/" || url.port || url.username || url.password ||
        url.search || url.hash) return null;
    if (env.H74_STAGING_USER_A_JWT === env.H74_STAGING_USER_B_JWT ||
        !sameIdFormat(env.H74_STAGING_USER_A_ATTEMPT_ID) ||
        !sameIdFormat(env.H74_STAGING_USER_B_ATTEMPT_ID) ||
        env.H74_STAGING_USER_A_ATTEMPT_ID === env.H74_STAGING_USER_B_ATTEMPT_ID) return null;
    if (env.H74_STAGING_USER_A_JWT.split(".").length !== 3 ||
        env.H74_STAGING_USER_B_JWT.split(".").length !== 3) return null;
    return url;
  } catch {
    return null;
  }
}

async function request(url, key, token) {
  const response = await fetch(url, {
    method: "GET",
    headers: { apikey: key, ...(token ? { Authorization: `Bearer ${token}` } : {}) },
    signal: AbortSignal.timeout(12000),
    cache: "no-store",
    redirect: "error",
  });
  // Only return status and a minimal validated body; never include response or token in logs.
  const body = response.ok ? await response.json().catch(() => null) : null;
  return { status: response.status, ok: response.ok, body };
}
function attemptUrl(origin, attemptId) {
  const url = new URL("/rest/v1/ielts_attempts", origin);
  url.searchParams.set("select", "id,user_id");
  url.searchParams.set("id", `eq.${attemptId}`);
  url.searchParams.set("limit", "2");
  return url;
}
function assertOwn(result, id, uid) {
  if (!result.ok || result.status !== 200 || !Array.isArray(result.body) ||
      result.body.length !== 1 || result.body[0]?.id !== id ||
      result.body[0]?.user_id !== uid) {
    throw Error("OWN_ATTEMPT_INVISIBLE_OR_WRONG_OWNER");
  }
}
function assertOther(result) {
  if (!(result.status === 401 || result.status === 403 ||
       (result.status === 200 && Array.isArray(result.body) && result.body.length === 0))) {
    throw Error("CROSS_ACCOUNT_ATTEMPT_EXPOSED");
  }
}

if (env.H74_ALLOW_READONLY_STAGING !== RUN_FLAG) {
  stop("NOT_TESTED", "EXPLICIT_STAGING_AUTHORIZATION_REQUIRED");
} else if (required.some(k => !env[k])) {
  stop("NOT_TESTED", "DEDICATED_STAGING_TEST_CREDENTIALS_MISSING");
} else {
  let origin = null;
  try { origin = configuration(); } catch { /* fail closed */ }
  if (!origin) {
    stop("NOT_TESTED", "STAGING_PROJECT_IDENTITY_OR_TEST_IDS_UNVERIFIED");
  } else {
    const key = env.H74_STAGING_PUBLISHABLE_KEY;
    const tokenA = env.H74_STAGING_USER_A_JWT;
    const tokenB = env.H74_STAGING_USER_B_JWT;
    const idA = env.H74_STAGING_USER_A_ATTEMPT_ID;
    const idB = env.H74_STAGING_USER_B_ATTEMPT_ID;
    const passed = [];
    try {
      const a = await request(new URL("/auth/v1/user", origin), key, tokenA);
      const b = await request(new URL("/auth/v1/user", origin), key, tokenB);
      const uidA = a.body?.id, uidB = b.body?.id;
      if (!a.ok || !b.ok || !sameIdFormat(uidA) || !sameIdFormat(uidB) || uidA === uidB) {
        throw Error("TWO_DISTINCT_AUTH_SESSIONS_NOT_VERIFIED");
      }
      passed.push("GETUSER_A_B_DISTINCT");
      assertOwn(await request(attemptUrl(origin, idA), key, tokenA), idA, uidA);
      assertOwn(await request(attemptUrl(origin, idB), key, tokenB), idB, uidB);
      passed.push("A_AND_B_OWN_ATTEMPTS_VISIBLE");
      assertOther(await request(attemptUrl(origin, idB), key, tokenA));
      assertOther(await request(attemptUrl(origin, idA), key, tokenB));
      passed.push("CROSS_USER_ATTEMPTS_DENIED");
      assertOther(await request(attemptUrl(origin, idB), key, null));
      passed.push("ANON_B_ATTEMPT_DENIED");
      const bad = await request(attemptUrl(origin, idA), key, "invalid.h74.jwt");
      if (![401,403].includes(bad.status)) throw Error("INVALID_JWT_NOT_REJECTED");
      passed.push("INVALID_JWT_DENIED");
      stop("PASS", "READ_ONLY_STAGING_PROBE_FINISHED_REVIEW_PENDING", passed);
    } catch (error) {
      // Fixed public error category only; never echo provider response, identities or secret data.
      const allowed = new Set([
        "OWN_ATTEMPT_INVISIBLE_OR_WRONG_OWNER",
        "CROSS_ACCOUNT_ATTEMPT_EXPOSED",
        "TWO_DISTINCT_AUTH_SESSIONS_NOT_VERIFIED",
        "INVALID_JWT_NOT_REJECTED",
      ]);
      const reason = error instanceof Error && allowed.has(error.message)
        ? error.message : "NETWORK_OR_RESPONSE_VALIDATION_FAILED";
      stop("FAIL", reason, passed);
    }
  }
}
