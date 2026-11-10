import { z } from "zod";
import { bankClient, requestError, viewer } from "@/lib/ielts-bank/server";

export const runtime = "nodejs";

/** Old Gemini feedback stays readable for its owner; no new external AI grading is performed. */
export async function GET(request: Request) {
  try {
    const user = await viewer();
    const attemptId = z.uuid().parse(new URL(request.url).searchParams.get("attemptId"));
    const { data, error } = await bankClient().from("ielts_attempts").select("notes").eq("id", attemptId).eq("user_id", user.id).single();
    if (error || !data) return Response.json({ error: "Không tìm thấy bài làm." }, { status: 404 });
    const stored = (data.notes as Record<string, string> | null)?.__ai_feedback;
    return Response.json({ feedback: stored ? JSON.parse(stored) : null }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return requestError(error); }
}

export async function POST() {
  return Response.json({ error: "Chấm trực tiếp đã ngừng. Bài viết vẫn được lưu; hệ thống chấm tự host sẽ mở sau khi kiểm định." }, { status: 410 });
}
