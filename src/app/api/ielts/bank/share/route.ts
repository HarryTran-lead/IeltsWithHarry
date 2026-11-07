import { randomUUID } from "node:crypto";
import { z } from "zod";
import { bankClient, requestError, viewer } from "@/lib/ielts-bank/server";

export const runtime = "nodejs";

const input = z.object({ attemptId: z.uuid(), enabled: z.boolean() });

async function ownedReadingAttempt(attemptId: string, userId: string) {
  const client = bankClient();
  const { data, error } = await client.from("ielts_attempts")
    .select("id,state,notes,ielts_exams(skill)")
    .eq("id", attemptId).eq("user_id", userId).single();
  const exam = Array.isArray(data?.ielts_exams) ? data.ielts_exams[0] : data?.ielts_exams;
  if (error || !data || !["submitted", "expired"].includes(data.state) || exam?.skill !== "Reading") throw new Error("Bài làm không thể chia sẻ.");
  return { client, attempt: data, notes: (data.notes || {}) as Record<string, string> };
}

export async function GET(request: Request) {
  try {
    const user = await viewer();
    const attemptId = z.uuid().parse(new URL(request.url).searchParams.get("attemptId"));
    const { notes } = await ownedReadingAttempt(attemptId, user.id);
    const enabled = notes.reading_share_enabled === "true" && Boolean(notes.reading_share_token);
    return Response.json({ enabled, token: enabled ? notes.reading_share_token : null });
  } catch (error) { return requestError(error); }
}

export async function POST(request: Request) {
  try {
    const user = await viewer();
    const { attemptId, enabled } = input.parse(await request.json());
    const { client, notes } = await ownedReadingAttempt(attemptId, user.id);
    const token = enabled ? (notes.reading_share_enabled === "true" && notes.reading_share_token) || randomUUID() : null;
    const updatedNotes = { ...notes, reading_share_enabled: String(enabled), reading_share_token: token || "" };
    const { data, error } = await client.from("ielts_attempts").update({ notes: updatedNotes })
      .eq("id", attemptId).eq("user_id", user.id).in("state", ["submitted", "expired"]).select("id").single();
    if (error || !data) throw new Error("Không thể cập nhật chia sẻ.");
    return Response.json({ enabled, token });
  } catch (error) { return requestError(error); }
}
