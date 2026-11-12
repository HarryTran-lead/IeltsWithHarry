import { z } from "zod";
import { bankClient, requestError, viewer } from "@/lib/ielts-bank/server";
import { savedReadingMarks } from "@/features/ielts/reading-highlights";

export const runtime = "nodejs";

const input = z.object({ attemptId: z.uuid(), highlights: z.string().max(16000) });

export async function POST(request: Request) {
  try {
    const user = await viewer();
    const { attemptId, highlights } = input.parse(await request.json());
    let parsed: unknown;
    try { parsed = JSON.parse(highlights) as unknown; }
    catch { return Response.json({ error: "Dữ liệu tô sáng không hợp lệ." }, { status: 400 }); }
    if (!Array.isArray(parsed) || parsed.length > 500 || savedReadingMarks(highlights).length !== parsed.length) {
      return Response.json({ error: "Dữ liệu tô sáng không hợp lệ." }, { status: 400 });
    }
    const client = bankClient();
    const { data: attempt, error } = await client.from("ielts_attempts").select("id,notes,ielts_exams(skill)")
      .eq("id", attemptId).eq("user_id", user.id).in("state", ["submitted", "expired"]).single();
    const exam = Array.isArray(attempt?.ielts_exams) ? attempt.ielts_exams[0] : attempt?.ielts_exams;
    if (error || !attempt || exam?.skill !== "Reading") return Response.json({ error: "Không tìm thấy bài Reading đã nộp." }, { status: 404 });
    const notes = { ...((attempt.notes || {}) as Record<string, string>), reading_highlights: highlights };
    const { data, error: updateError } = await client.from("ielts_attempts").update({ notes })
      .eq("id", attemptId).eq("user_id", user.id).in("state", ["submitted", "expired"]).select("id").single();
    if (updateError || !data) throw new Error("Không lưu được phần tô sáng.");
    return Response.json({ ok: true });
  } catch (error) { return requestError(error); }
}
