import { z } from "zod";
import { bankClient, requestError, viewer } from "@/lib/ielts-bank/server";
import { AiQuotaError, geminiJson } from "@/lib/news/enrichment";
import { learnerSkillAvailable } from "@/lib/runtime";

export const runtime = "nodejs";
export const maxDuration = 60;

const band = { type: "number", minimum: 0, maximum: 9 } as const;
const feedbackSchema = {
  type: "object", additionalProperties: false,
  required: ["overall", "task_response", "coherence_cohesion", "lexical_resource", "grammatical_range", "summary_vi", "criteria_vi", "strengths_vi", "improvements_vi", "corrections", "upgraded_paragraph", "upgraded_essay"],
  properties: {
    overall: band, task_response: band, coherence_cohesion: band, lexical_resource: band, grammatical_range: band,
    summary_vi: { type: "string" },
    criteria_vi: { type: "object", additionalProperties: false, required: ["task_response", "coherence_cohesion", "lexical_resource", "grammatical_range"], properties: { task_response: { type: "string" }, coherence_cohesion: { type: "string" }, lexical_resource: { type: "string" }, grammatical_range: { type: "string" } } },
    strengths_vi: { type: "array", maxItems: 4, items: { type: "string" } },
    improvements_vi: { type: "array", maxItems: 5, items: { type: "string" } },
    corrections: { type: "array", maxItems: 16, items: { type: "object", additionalProperties: false, required: ["criterion", "issue_vi", "original", "improved", "explanation_vi"], properties: { criterion: { type: "string", enum: ["TR", "CC", "LR", "GR"] }, issue_vi: { type: "string" }, original: { type: "string" }, improved: { type: "string" }, explanation_vi: { type: "string" } } } },
    upgraded_paragraph: { type: "string" },
    upgraded_essay: { type: "string" },
  },
} as const;

type WritingFeedback = {
  overall: number; task_response: number; coherence_cohesion: number; lexical_resource: number; grammatical_range: number;
  summary_vi: string; strengths_vi: string[]; improvements_vi: string[];
  criteria_vi?: { task_response: string; coherence_cohesion: string; lexical_resource: string; grammatical_range: string };
  corrections: { criterion?: "TR" | "CC" | "LR" | "GR"; issue_vi?: string; original: string; improved: string; explanation_vi: string }[];
  upgraded_paragraph: string;
  upgraded_essay?: string;
};

const system = `You are an experienced IELTS Writing examiner giving practice feedback to a Vietnamese learner.
Score the response on the four public IELTS Writing band descriptors (Task Achievement/Response, Coherence and Cohesion, Lexical Resource, Grammatical Range and Accuracy), each from 0 to 9 in steps of 0.5, and give an overall band that is their average rounded to the nearest 0.5 (round .25 up and .75 up).
Be fair and specific. Each correction is one concrete problem: "original" must be copied EXACTLY, character for character, from the learner's response (a short span of at most 25 words, so it can be highlighted in their text), "improved" is the corrected or more natural English for that span, "criterion" is the band descriptor it affects (TR = task achievement/response, CC = coherence and cohesion, LR = lexical resource, GR = grammatical range and accuracy), and "issue_vi" names the problem in a few Vietnamese words (for example "Lặp từ nối", "Sai thì động từ", "Thiếu overview"). Cover all four criteria where there are real problems, most important first.
criteria_vi gives, for each criterion, two or three Vietnamese sentences explaining why the response earns that band and what would lift it.
Write summary_vi, strengths_vi, improvements_vi, issue_vi and explanation_vi in Vietnamese. Keep "improved", "upgraded_paragraph" and "upgraded_essay" in English. upgraded_paragraph rewrites ONE of the learner's paragraphs at about band 7.5, keeping their ideas. upgraded_essay rewrites the WHOLE response at about band 7.5, keeping the learner's ideas, order and paragraphing (paragraphs separated by a blank line) and changing only what is needed.
Under-length responses (below the minimum word count) must lose marks on task achievement/response. Never claim the result is an official IELTS score.`;

const round = (value: number) => Math.min(9, Math.max(0, Math.round(value * 2) / 2));

/** Feedback already stored on the learner's attempt, or null; never calls the AI. */
export async function GET(request: Request) {
  if (!learnerSkillAvailable("Writing")) return Response.json({ error: "Writing practice is not available yet." }, { status: 404 });
  try {
    const user = await viewer();
    const attemptId = z.uuid().parse(new URL(request.url).searchParams.get("attemptId"));
    const { data, error } = await bankClient().from("ielts_attempts").select("notes").eq("id", attemptId).eq("user_id", user.id).single();
    if (error || !data) throw new Error("Không tìm thấy bài làm.");
    const stored = (data.notes as Record<string, string> | null)?.__ai_feedback;
    return Response.json({ feedback: stored ? JSON.parse(stored) as WritingFeedback : null });
  } catch (error) { return requestError(error); }
}

/** AI practice feedback for a submitted Writing attempt; stored on the attempt so it is graded once. */
export async function POST(request: Request) {
  if (!learnerSkillAvailable("Writing")) return Response.json({ error: "Writing practice is not available yet." }, { status: 404 });
  try {
    const user = await viewer();
    const { attemptId } = z.object({ attemptId: z.uuid() }).parse(await request.json());
    const client = bankClient();
    const { data, error } = await client.from("ielts_attempts")
      .select("id,state,answers,notes,ielts_exams(title,skill,practice_type,format),ielts_exam_versions(content)")
      .eq("id", attemptId).eq("user_id", user.id).single();
    if (error || !data) throw new Error("Không tìm thấy bài làm.");
    const exam = (Array.isArray(data.ielts_exams) ? data.ielts_exams[0] : data.ielts_exams) as { title: string; skill: string; practice_type: string; format: string } | null;
    const version = (Array.isArray(data.ielts_exam_versions) ? data.ielts_exam_versions[0] : data.ielts_exam_versions) as { content: { prompt?: string; minimumWords?: number; visual?: unknown; figureDescription?: string } } | null;
    if (exam?.skill !== "Writing") throw new Error("Chỉ chấm được bài Writing.");
    if (data.state === "in_progress") throw new Error("Hãy nộp bài trước khi chấm.");
    const notes = (data.notes ?? {}) as Record<string, string>;
    if (notes.__ai_feedback) return Response.json({ feedback: JSON.parse(notes.__ai_feedback) as WritingFeedback });
    const essay = String((data.answers as Record<string, string>)?.__response ?? "").trim();
    const words = essay.split(/\s+/).filter(Boolean).length;
    if (words < 40) throw new Error("Bài viết quá ngắn để chấm (cần ít nhất 40 từ).");
    const minimum = version?.content.minimumWords ?? (exam.practice_type === "task2" ? 250 : 150);
    const task = exam.practice_type === "task2" ? "Task 2 essay" : exam.practice_type === "task1_general" ? "General Training Task 1 letter" : "Academic Task 1 report";
    const visual = version?.content.visual ? JSON.stringify(version.content.visual).slice(0, 3500) : version?.content.figureDescription ?? "";
    const user_prompt = `Task type: ${task} (minimum ${minimum} words).\nQuestion:\n${version?.content.prompt ?? exam.title}\n${visual ? `\nData shown in the visual (JSON):\n${visual}\n` : ""}\nLearner's response (${words} words):\n${essay.slice(0, 12000)}`;
    const { data: raw } = await geminiJson<WritingFeedback>(system, user_prompt, feedbackSchema, { maxOutputTokens: 9000, temperature: 0.2 });
    const feedback: WritingFeedback = {
      ...raw,
      task_response: round(raw.task_response), coherence_cohesion: round(raw.coherence_cohesion), lexical_resource: round(raw.lexical_resource), grammatical_range: round(raw.grammatical_range),
      overall: round((raw.task_response + raw.coherence_cohesion + raw.lexical_resource + raw.grammatical_range) / 4 + 0.001),
    };
    await client.from("ielts_attempts").update({ notes: { ...notes, __ai_feedback: JSON.stringify(feedback) } }).eq("id", attemptId).eq("user_id", user.id);
    return Response.json({ feedback });
  } catch (error) {
    if (error instanceof AiQuotaError) return Response.json({ error: "AI đang quá tải hoặc hết lượt chấm hôm nay. Hãy thử lại sau." }, { status: 429 });
    return requestError(error);
  }
}
