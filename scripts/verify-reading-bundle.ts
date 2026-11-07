import { readFileSync } from "node:fs";
import { contentSchema, qOptionKey, scoreAnswers, validateExam, type NormalizedExam } from "../src/lib/ielts-bank/schema";

const bundle = JSON.parse(readFileSync(process.argv[2], "utf8"));
const expectedCount = Number(process.argv[3] || 5);
if (bundle.kind !== "ielts-reading-admin-bundle" || bundle.exams?.length !== expectedCount) throw new Error(`Expected ${expectedCount} Reading exams`);
for (const raw of bundle.exams) {
  const exam = raw as NormalizedExam;
  exam.content = contentSchema.parse(raw.content);
  const warnings = validateExam({ ...exam, aiGenerated: false, upstreamVersion: "admin-upload" });
  if (warnings.length) throw new Error(`${exam.title}: ${warnings.join(", ")}`);
  const questions = exam.content.sections.flatMap((section) => section.questions);
  if (questions.length !== 40 || exam.content.sections.length !== 3) throw new Error(`${exam.title}: incomplete exam`);
  for (const question of questions) {
    if (question.options.length && /matching|multiple/.test(question.type)) {
      const keys = question.options.map(qOptionKey);
      if (question.answers.some((answer) => !keys.includes(answer))) throw new Error(`${exam.title}: answer ${question.number} has no option`);
    }
  }
  const answerSheet = Object.fromEntries(questions.map((question) => [question.id, question.answers[0]]));
  const scored = scoreAnswers(exam.content, answerSheet);
  if (scored.score !== 40 || scored.total !== 40) throw new Error(`${exam.title}: answer key scoring ${scored.score}/${scored.total}`);
  console.log(`${exam.title}: 3 passages, 40 questions, answer key scores 40/40`);
}
