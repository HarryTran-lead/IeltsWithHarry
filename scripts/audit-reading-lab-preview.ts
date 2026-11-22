/** Read-only audit of the local S03 candidate used by Reading Lab preview. */
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { contentSchema, publicContent, scoreAnswers, validateExam, type NormalizedExam } from "../src/lib/ielts-bank/schema";

const root = process.argv[2];
if (!root) throw new Error("Usage: npx tsx scripts/audit-reading-lab-preview.ts PRIVATE_DATA_DIR");
const counts = { exams: 0, sections: 0, questions: 0, fullTests: 0, evidence: 0, imageReferences: 0, warnings: {} as Record<string, number> };
const ids = new Set<string>();
for (let number = 2; number <= 37; number++) {
  const id = `M08_${String(number).padStart(2, "0")}`;
  const { exam } = JSON.parse(readFileSync(join(root, "private", `${id}_CANDIDATE_PRIVATE_S03.json`), "utf8")) as { exam: NormalizedExam };
  exam.content = contentSchema.parse(exam.content);
  const publicExam = publicContent(exam.content);
  const questions = exam.content.sections.flatMap((section) => section.questions);
  const publicQuestions = publicExam.sections.flatMap((section) => section.questions);
  if (questions.length !== publicQuestions.length || publicQuestions.some((question) => question.answers.length || question.explanation)) throw new Error(`Answer leak: ${id}`);
  for (const question of questions) {
    if (ids.has(question.id)) throw new Error(`Duplicate question ID: ${question.id}`);
    ids.add(question.id);
    if (question.mediaReference) {
      const name = question.mediaReference.replace(/^assets\//, "").replace(/\.svg$/i, ".png");
      if (!existsSync(join(root, "assets", id, name))) throw new Error(`Missing image: ${id}/${name}`);
      counts.imageReferences++;
    }
  }
  const offsets = JSON.parse(readFileSync(join(root, "offsets", `${id}_EVIDENCE_OFFSETS_S03.json`), "utf8")) as {
    evidenceOffsets: { normalizedQuestionId: string; paragraph: string; quote: string; startUtf16: number; endUtf16: number }[];
  };
  for (const item of offsets.evidenceOffsets) {
    const section = exam.content.sections.find((part) => part.questions.some((question) => question.id === item.normalizedQuestionId));
    const paragraph = section?.passage.split(/\n\n+/).find((line) => line.startsWith(`${item.paragraph}. `));
    if (!paragraph || paragraph.slice(3 + item.startUtf16, 3 + item.endUtf16) !== item.quote) throw new Error(`Evidence offset mismatch: ${item.normalizedQuestionId}`);
    counts.evidence++;
  }
  const sheet = Object.fromEntries(questions.map((question) => [question.id,
    /multiple[_-]answers/.test(question.type) ? question.answers.join(",") : question.answers[0] ?? ""]));
  const scored = scoreAnswers(exam.content, sheet);
  if (scored.total !== questions.length) throw new Error(`Scorer question mismatch: ${id}`);
  for (const warning of validateExam(exam)) counts.warnings[warning] = (counts.warnings[warning] ?? 0) + 1;
  counts.exams++;
  counts.sections += exam.content.sections.length;
  counts.questions += questions.length;
  if (exam.mode === "full_mock") {
    if (questions.length !== 40 || exam.content.sections.length !== 3) throw new Error(`Incomplete full test: ${id}`);
    if (scored.score !== 40) throw new Error(`Full test answer key does not score 40/40: ${id} (${scored.score})`);
    counts.fullTests++;
  }
}
console.log(JSON.stringify(counts, null, 2));
