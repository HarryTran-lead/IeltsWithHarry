import { z } from "zod";
import { bankClient, requestError, viewer } from "@/lib/ielts-bank/server";

export const runtime = "nodejs";
const enabled = () => process.env.SPEAKING_COACHING_ENABLED === "true";
const answersSchema = z.array(z.object({ part: z.number(), question: z.string(), seconds: z.number() }).passthrough()).max(50);

export async function GET(request: Request) {
  try {
    const user = await viewer();
    const sessionId = z.uuid().parse(new URL(request.url).searchParams.get("sessionId"));
    const db = bankClient();
    const { data: session, error: sessionError } = await db.from("speaking_mock_sessions").select("id")
      .eq("id", sessionId).eq("user_id", user.id).maybeSingle();
    if (sessionError || !session) return Response.json({ error: "Không tìm thấy phiên Speaking." }, { status: 404 });
    const { data: job, error } = await db.from("speaking_coaching_jobs")
      .select("id,status,error_code,result,created_at,updated_at")
      .eq("session_id", sessionId).maybeSingle();
    if (error && !enabled()) return Response.json({ status: "unavailable", result: null });
    if (error) throw new Error("Không tải được trạng thái phân tích.");
    if (!job) return Response.json({ status: enabled() ? "not_requested" : "unavailable", result: null }, { headers: { "Cache-Control": "private, no-store" } });
    let ahead: number | null = null;
    if (job.status === "queued") {
      const queue = await db.from("speaking_coaching_jobs").select("id", { count: "exact", head: true })
        .in("status", ["queued", "analyzing"]).lt("created_at", job.created_at);
      if (!queue.error) ahead = queue.count ?? 0;
    }
    return Response.json({ ...job, ahead }, { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) { return requestError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await viewer();
    if (!enabled()) return Response.json({ error: "Phân tích Speaking chưa sẵn sàng." }, { status: 503 });
    const { sessionId } = z.object({ sessionId: z.uuid() }).parse(await request.json());
    const db = bankClient();
    const { data: session, error: sessionError } = await db.from("speaking_mock_sessions")
      .select("id,answers").eq("id", sessionId).eq("user_id", user.id).maybeSingle();
    if (sessionError || !session) return Response.json({ error: "Không tìm thấy phiên Speaking." }, { status: 404 });
    const { data: existing, error: existingError } = await db.from("speaking_coaching_jobs")
      .select("id,status").eq("session_id", sessionId).maybeSingle();
    if (existingError) throw new Error("Không kiểm tra được hàng đợi Speaking.");
    if (existing) return Response.json(existing, { status: 200 });
    const answers = answersSchema.parse(session.answers);
    const answerIndex = answers.findIndex((item) => item.part === 2 && item.seconds >= 5 && item.seconds <= 125);
    if (answerIndex < 0) return Response.json({ error: "Phiên này chưa có câu trả lời Part 2 hợp lệ." }, { status: 400 });
    const { data: recording, error: recordingError } = await db.from("speaking_mock_recordings")
      .select("storage_path").eq("session_id", sessionId).eq("user_id", user.id).eq("answer_index", answerIndex).maybeSingle();
    if (recordingError || !recording) return Response.json({ error: "Hãy lưu bản ghi Part 2 riêng tư trước khi phân tích." }, { status: 400 });
    const since = new Date(Date.now() - 86400000).toISOString();
    const [own, global] = await Promise.all([
      db.from("speaking_coaching_jobs").select("id", { count: "exact", head: true }).eq("user_id", user.id).gte("created_at", since),
      db.from("speaking_coaching_jobs").select("id", { count: "exact", head: true }).gte("created_at", since),
    ]);
    if (own.error || global.error) throw new Error("Không kiểm tra được hạn mức Speaking.");
    if ((own.count ?? 0) >= 2) return Response.json({ error: "Bạn đã dùng hết 2 lượt phân tích Speaking trong 24 giờ." }, { status: 429 });
    if ((global.count ?? 0) >= 10) return Response.json({ error: "Hàng đợi Speaking miễn phí đã đủ 10 bài trong 24 giờ. Hãy quay lại sau." }, { status: 429 });
    const { data: job, error: insertError } = await db.from("speaking_coaching_jobs").insert({
      session_id: sessionId, user_id: user.id, answer_index: answerIndex,
      question_snapshot: answers[answerIndex].question.slice(0, 1000), recording_path: recording.storage_path,
      recording_seconds: Math.max(5, Math.ceil(answers[answerIndex].seconds)),
    }).select("id,status").single();
    if (insertError?.code === "23505") {
      const retry = await db.from("speaking_coaching_jobs").select("id,status").eq("session_id", sessionId).single();
      if (retry.data) return Response.json(retry.data);
    }
    if (insertError || !job) throw new Error("Chưa thể đưa bài Speaking vào hàng đợi.");
    return Response.json(job, { status: 202 });
  } catch (error) { return requestError(error); }
}
