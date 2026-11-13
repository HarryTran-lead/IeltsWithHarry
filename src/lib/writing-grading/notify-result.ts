import type { SupabaseClient } from "@supabase/supabase-js";

/** A persistent in-app notice, keyed by result ID so a retried callback cannot duplicate it. */
export async function notifyWritingResult(db: SupabaseClient, resultId: string, userId: string, attemptId: string) {
  const { error } = await db.from("user_notifications").upsert({
    id: resultId,
    user_id: userId,
    kind: "account",
    title: "Bài Writing đã chấm xong",
    body: "Kết quả và góp ý đã sẵn sàng. Mở bài để xem và sửa tiếp.",
    link: `/app/question-bank/result/${attemptId}`,
  }, { onConflict: "id", ignoreDuplicates: true });
  if (error) throw new Error("WRITING_NOTICE_FAILED");
}
