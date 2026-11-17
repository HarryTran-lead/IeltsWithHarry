#!/usr/bin/env node
// Deterministic no-network integration test of the *actual* H74/M02 script.
// All tokens and project refs are synthetic; the fetch shim never calls the internet.
const scenario = process.argv[2] ?? "success";
const stageRef = "abcdefghijklmnopqrst";
const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";
const attemptA = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const attemptB = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
function jwt(userId) {
  const header=Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" })).toString("base64url");
  const payload=Buffer.from(JSON.stringify({
    iss: `https://${stageRef}.supabase.co/auth/v1`,
    sub: userId, role: "authenticated", aud: "authenticated",
    exp: Math.floor(Date.now()/1000)+3600,
  })).toString("base64url");
  return `${header}.${payload}.synthetic_signature_only`;
}
const tokenA=jwt(A), tokenB=jwt(B);
for (const name of Object.keys(process.env)) {
  if (name.startsWith("H74_")) delete process.env[name];
}
Object.assign(process.env, {
  H74_ALLOW_READONLY_STAGING:"YES_AUTHORIZED_STAGING_TWO_USER_READONLY",
  H74_STAGING_PROJECT_REF:stageRef,
  H74_STAGING_URL:`https://${stageRef}.supabase.co/`,
  H74_STAGING_PUBLISHABLE_KEY:"sb_publishable_synthetic_test_key_123456789",
  H74_STAGING_USER_A_JWT:tokenA,
  H74_STAGING_USER_B_JWT:tokenB,
  H74_STAGING_USER_A_ATTEMPT_ID:attemptA,
  H74_STAGING_USER_B_ATTEMPT_ID:attemptB,
});
let calls=0;
globalThis.fetch = async (input, options) => {
  const url = new URL(String(input));
  calls++;
  if (url.origin !== `https://${stageRef}.supabase.co` ||
      options?.method !== "GET" || options?.redirect !== "error" ||
      url.searchParams.has("secret")) throw Error("MOCK_UNEXPECTED_URL_OR_METHOD");
  const raw=options?.headers?.Authorization ?? "";
  const actor=raw === `Bearer ${tokenA}` ? A : raw === `Bearer ${tokenB}` ? B : null;
  if (url.pathname === "/auth/v1/user") {
    return actor ? Response.json({ id:actor }) : Response.json({ error:"not authorized" },{ status:401 });
  }
  if (url.pathname !== "/rest/v1/ielts_attempts" ||
      url.searchParams.get("select") !== "id,user_id" ||
      url.searchParams.get("limit") !== "2") throw Error("MOCK_UNEXPECTED_QUERY");
  const eq=url.searchParams.get("id");
  const id=eq?.startsWith("eq.") ? eq.slice(3) : null;
  const owner=id === attemptA ? A : id === attemptB ? B : null;
  if (!owner) return Response.json([]);
  if (raw === "Bearer invalid.h74.jwt") {
    return scenario === "invalid-jwt-accepted" ? Response.json([]) :
      Response.json({error:"bad jwt"},{status:401});
  }
  if (scenario === "own-missing" && actor === A && id === attemptA) return Response.json([]);
  if (scenario === "cross-exposed" && actor === A && id === attemptB)
    return Response.json([{id,user_id:B}]);
  if (scenario === "anonymous-exposed" && !actor && id === attemptB)
    return Response.json([{id,user_id:B}]);
  return actor && actor === owner ? Response.json([{id,user_id:owner}]) : Response.json([]);
};
// Top-level imports run once in this isolated Node process; this is never a real probe.
await import("../scripts/h74_staging_two_user_readonly.mjs");
if (calls === 0) {
  console.error("MOCK_NOT_EXERCISED");
  process.exitCode = 5;
}
