import { notFound } from "next/navigation";
import { ReadingReview } from "@/features/ielts/bank-reading-review";
import readingEvidence from "@/data/ielts-reading-evidence.json";
import { evidenceFromExplanation } from "@/lib/ielts-bank/reading-evidence";
import { bankClient } from "@/lib/ielts-bank/server";
import { attemptContent, contentSchema, scoreAnswers } from "@/lib/ielts-bank/schema";

export const dynamic = "force-dynamic";
export const metadata = { title: "Bài Reading được chia sẻ | IeltsWithHarry", robots: { index: false, follow: false } };

export default async function SharedReadingPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(token)) notFound();
  const { data: attempt, error } = await bankClient().from("ielts_attempts")
    .select("started_at,submitted_at,answers,notes,ielts_exam_versions(content),ielts_exams(title,skill,format,attribution)")
    .contains("notes", { reading_share_token: token, reading_share_enabled: "true" })
    .in("state", ["submitted", "expired"]).maybeSingle();
  const exam = Array.isArray(attempt?.ielts_exams) ? attempt.ielts_exams[0] : attempt?.ielts_exams;
  const version = Array.isArray(attempt?.ielts_exam_versions) ? attempt.ielts_exam_versions[0] : attempt?.ielts_exam_versions;
  if (error || !attempt || exam?.skill !== "Reading" || !version) notFound();
  const notes = (attempt.notes || {}) as Record<string, string>;
  const content = attemptContent(contentSchema.parse(version.content), notes);
  const result = scoreAnswers(content, (attempt.answers || {}) as Record<string, string>);
  const review = result.review.map((question) => ({ ...question, evidence: readingEvidence[question.id as keyof typeof readingEvidence] || evidenceFromExplanation(question.explanation) }));
  return <ReadingReview title={exam.title} content={content} review={review} format={exam.format} attribution={exam.attribution} startedAt={attempt.started_at} submittedAt={attempt.submitted_at || undefined} backHref="/" />;
}
