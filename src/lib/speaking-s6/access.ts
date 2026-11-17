import { bankClient } from "@/lib/ielts-bank/server";

/** Every learner request requires BOTH global QA release AND a server-verified S5 prerequisite.
 * Admin-only preview is checked by viewer(true) at each route, never by this helper. */
export async function s6AccessAllowed(userId: string, preview: boolean, db: ReturnType<typeof bankClient>) {
  if (preview) return true;
  const gate=await db.rpc("speaking_s6_release_ready");
  if(gate.error || gate.data!==true)return false;
  const eligible=await db.from("speaking_s6_s5_eligibility")
    .select("s5_verified").eq("user_id",userId).maybeSingle();
  return !eligible.error && eligible.data?.s5_verified===true;
}
