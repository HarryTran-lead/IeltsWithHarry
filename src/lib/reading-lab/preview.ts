import "server-only";

import { readFile, readdir } from "node:fs/promises";
import { isAbsolute, join, relative, resolve } from "node:path";
import { contentSchema, publicContent, scoreAnswers } from "@/lib/ielts-bank/schema";
import { bankClient, viewer } from "@/lib/ielts-bank/server";
import { demoMode } from "@/lib/runtime";
import { getViewerRole } from "@/lib/viewer-role";
import type { ReadingLabSummary } from "./types";

const milestonePattern = /^M08_(0[2-9]|[12][0-9]|3[0-7])$/;
const assetPattern = /^[A-Za-z0-9_-]+\.(png|jpg)$/;
const sourceId = "manual";
const externalId = (id: string) => `reading-lab-${id.toLowerCase().replace("_", "-")}`;
const production = process.env.NODE_ENV === "production";

export function readingLabRoot() {
  if (production || process.env.NEXT_PUBLIC_READING_LAB_PREVIEW !== "true")
    throw new Error("Reading Lab preview is unavailable");
  const root = process.env.READING_LAB_S03_DATA_DIR;
  if (!root) throw new Error("Reading Lab preview data is not configured");
  const absolute = resolve(root);
  const insideRepository = relative(process.cwd(), absolute);
  if (!isAbsolute(root) || (!insideRepository.startsWith("..") && !isAbsolute(insideRepository)))
    throw new Error("Reading Lab private data must be outside the repository");
  return absolute;
}

export async function readingLabViewer() {
  if (!production) readingLabRoot();
  if (demoMode) {
    if (await getViewerRole() === "guest") throw new Error("Authentication required");
  } else await viewer();
}

function assertMilestone(id: string) {
  if (!milestonePattern.test(id)) throw new Error("Unknown Reading Lab milestone");
  return id;
}

async function record(id: string, kind: "private" | "learner" | "offsets") {
  const name = assertMilestone(id);
  const suffix = kind === "offsets" ? "EVIDENCE_OFFSETS_S03" : `CANDIDATE_${kind.toUpperCase()}_S03`;
  return JSON.parse(await readFile(join(readingLabRoot(), kind, `${name}_${suffix}.json`), "utf8"));
}

async function publishedExam(id: string) {
  assertMilestone(id);
  const db = bankClient();
  const { data: exam, error } = await db.from("ielts_exams")
    .select("id,title,duration_minutes,published_version_id")
    .eq("source_id", sourceId).eq("external_id", externalId(id))
    .not("published_version_id", "is", null).single();
  if (error || !exam?.published_version_id) throw new Error("Reading Lab exam unavailable");
  const { data: version, error: versionError } = await db.from("ielts_exam_versions")
    .select("content").eq("id", exam.published_version_id).single();
  if (versionError || !version) throw new Error("Reading Lab version unavailable");
  return { exam, content: version.content as Record<string, unknown> };
}

export async function catalog(): Promise<ReadingLabSummary[]> {
  if (production) {
    const db = bankClient();
    const { data: exams, error } = await db.from("ielts_exams")
      .select("external_id,title,mode,duration_minutes,published_version_id")
      .eq("source_id", sourceId).like("external_id", "reading-lab-m08-%")
      .not("published_version_id", "is", null).order("external_id");
    if (error) throw new Error(error.message);
    const versionIds = (exams ?? []).map((exam) => exam.published_version_id).filter((id): id is string => Boolean(id));
    if (!versionIds.length) return [];
    const { data: versions, error: versionsError } = await db.from("ielts_exam_versions")
      .select("id,content").in("id", versionIds);
    if (versionsError) throw new Error(versionsError.message);
    const byId = new Map((versions ?? []).map((version) => [version.id, version.content]));
    return (exams ?? []).map((exam) => {
      const id = exam.external_id.replace(/^reading-lab-m08-/, "M08_");
      assertMilestone(id);
      const content = contentSchema.parse(byId.get(exam.published_version_id));
      const questions = content.sections.flatMap((section) => section.questions);
      return { id, title: exam.title, sections: content.sections.length, questions: questions.length,
        minutes: exam.duration_minutes, fullTest: exam.mode === "full_mock",
        questionTypes: [...new Set(questions.map((question) => question.type))],
        passages: content.sections.map((section) => section.title) };
    });
  }
  const files = await readdir(join(readingLabRoot(), "learner"));
  const ids = files.map((file) => file.match(/^(M08_\d\d)_CANDIDATE_LEARNER_S03\.json$/)?.[1])
    .filter((id): id is string => id !== undefined && milestonePattern.test(id));
  return Promise.all(ids.sort().map(async (id) => {
    const { exam } = await record(id, "learner");
    const content = contentSchema.parse(exam.content);
    const questions = content.sections.flatMap((section) => section.questions);
    return {
      id, title: exam.title as string, sections: content.sections.length,
      questions: questions.length, minutes: exam.durationMinutes as number,
      fullTest: exam.mode === "full_mock",
      questionTypes: [...new Set(questions.map((question) => question.type))],
      passages: content.sections.map((section) => section.title),
    };
  }));
}

export async function publicExam(id: string) {
  const loaded = production ? await publishedExam(id) : await record(id, "learner");
  const exam = loaded.exam;
  const content = publicContent(contentSchema.parse("content" in loaded ? loaded.content : exam.content));
  const sections = content.sections.map((section) => ({
    ...section,
    questions: section.questions.map((question) => ({
      ...question,
      mediaUrl: question.mediaReference?.startsWith("assets/")
        ? production
          ? `/reading-lab/assets/${id}/${encodeURIComponent(question.mediaReference.slice(7).replace(/\.svg$/i, ".png"))}`
          : `/api/reading-lab/asset?milestone=${id}&name=${encodeURIComponent(question.mediaReference.slice(7).replace(/\.svg$/i, ".png"))}`
        : undefined,
    })),
  }));
  return { id, title: exam.title as string, minutes: production ? (exam as { duration_minutes: number }).duration_minutes : (exam as { durationMinutes: number }).durationMinutes, sections };
}

type FiveStep = Record<"understand" | "wordClass" | "paraphrase" | "evidence" | "final", {
  en: string; vi: string; quotes?: { paragraph: string; quote: string }[];
  trapEn?: string; trapVi?: string; tipEn?: string; tipVi?: string;
}>;
type Offset = { normalizedQuestionId: string; paragraph: string; quote: string; startUtf16: number; endUtf16: number };

export async function grade(id: string, sectionId: string | undefined, answers: Record<string, string>) {
  const loaded = production ? await publishedExam(id) : await record(id, "private");
  const rawContent = "content" in loaded ? loaded.content : loaded.exam.content;
  const offsets = production ? { evidenceOffsets: (rawContent as { readingLabOffsets?: Offset[] }).readingLabOffsets ?? [] } : await record(id, "offsets");
  const content = contentSchema.parse(rawContent);
  const section = sectionId ? content.sections.find((item) => item.id === sectionId) : undefined;
  if (sectionId && !section) throw new Error("Unknown passage");
  const scoped = section ? { ...content, sections: [section] } : content;
  const result = scoreAnswers(scoped, answers);
  const rawQuestions = ((rawContent as { sections: { questions: { id: string; fiveStep?: FiveStep }[] }[] }).sections)
    .flatMap((item) => item.questions);
  const steps = new Map(rawQuestions.map((question) => [question.id, question.fiveStep]));
  const evidence = new Map<string, Offset[]>();
  for (const offset of offsets.evidenceOffsets as Offset[]) {
    if (!result.review.some((item) => item.id === offset.normalizedQuestionId)) continue;
    const list = evidence.get(offset.normalizedQuestionId) ?? [];
    list.push(offset);
    evidence.set(offset.normalizedQuestionId, list);
  }
  if (production) {
    const user = await viewer();
    const exam = (loaded as Awaited<ReturnType<typeof publishedExam>>).exam;
    const { error } = await bankClient().from("ielts_attempts").insert({
      user_id: user.id, exam_id: exam.id, version_id: exam.published_version_id,
      state: "submitted", answers, score: result.score, total: result.total,
      submitted_at: new Date().toISOString(), notes: { __lab: "reading", ...(sectionId ? { __section: sectionId } : {}) },
    });
    if (error) throw new Error(`Could not save Reading Lab attempt: ${error.message}`);
  }
  return {
    score: result.score, total: result.total,
    review: result.review.map((item) => ({ ...item, fiveStep: steps.get(item.id) ?? null, evidence: evidence.get(item.id) ?? [] })),
  };
}

export async function asset(id: string, name: string) {
  if (production) throw new Error("Reading Lab assets use the public static path");
  assertMilestone(id);
  if (!assetPattern.test(name)) throw new Error("Unknown Reading Lab asset");
  const bytes = await readFile(join(readingLabRoot(), "assets", id, name));
  return { bytes, type: name.endsWith(".png") ? "image/png" : "image/jpeg" };
}
