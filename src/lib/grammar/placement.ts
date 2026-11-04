import "server-only";
import { createHmac, randomInt, timingSafeEqual } from "node:crypto";
import { loadEditorialLesson } from "./editorial";
import { GRAMMAR_TEST_SIZE, prerequisiteLevel, scoreGrammarPlacement } from "./gate";
import type { GrammarLevel } from "./types";
import catalog from "@/data/grammar-editorial/catalog.json";

type Choice = { id: string; prompt: string; instruction: string; options: string[]; lessonCode: string };
type AnswerKey = Choice & { correct: string; accepted: string[] };
type Ticket = { userId: string; target: GrammarLevel; ids: string[]; expires: number };

function secret() {
  const value = process.env.GRAMMAR_ASSESSMENT_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!value && process.env.NEXT_PUBLIC_DEMO_MODE !== "true") throw new Error("Grammar assessment signing key is not configured");
  return value || "local-demo-grammar-assessment-only";
}

function sign(payload: string) {
  return createHmac("sha256", secret()).update(payload).digest("base64url");
}

export function issueTicket(ticket: Ticket) {
  const payload = Buffer.from(JSON.stringify(ticket)).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

export function readTicket(token: string, userId: string, target: GrammarLevel): Ticket | null {
  const [payload, signature, extra] = token.split(".");
  if (!payload || !signature || extra) return null;
  const expected = sign(payload);
  if (signature.length !== expected.length || !timingSafeEqual(Buffer.from(signature), Buffer.from(expected))) return null;
  try {
    const value = JSON.parse(Buffer.from(payload, "base64url").toString()) as Ticket;
    return value.userId === userId && value.target === target && value.expires > Date.now() && value.ids.length === GRAMMAR_TEST_SIZE && new Set(value.ids).size === GRAMMAR_TEST_SIZE ? value : null;
  } catch { return null; }
}

export async function placementPool(target: GrammarLevel): Promise<AnswerKey[]> {
  const sourceLevel = prerequisiteLevel(target);
  if (!sourceLevel) return [];
  const lessons = catalog.filter((lesson) => lesson.level === sourceLevel);
  const loaded = await Promise.all(lessons.map(async (lesson) => ({ code: lesson.code, source: await loadEditorialLesson(lesson.code) })));
  return loaded.flatMap(({ code, source }) => (source?.questions ?? [])
    .filter((question) => question.auto_gradable === true && ["mcq", "error_choice"].includes(question.type)
      && Array.isArray(question.options) && question.options.length >= 2 && question.options.includes(question.correct_answer)
      && ["independent", "mastery"].includes(question.stage))
    .map((question) => ({ id: question.id, lessonCode: code, prompt: question.prompt_en, instruction: question.instruction_vi ?? "Chọn đáp án đúng.", options: question.options!, correct: question.correct_answer, accepted: question.accepted_answers ?? [] })));
}

export function choosePlacement(pool: AnswerKey[]): AnswerKey[] {
  const byLesson = new Map<string, AnswerKey[]>();
  for (const item of pool) byLesson.set(item.lessonCode, [...(byLesson.get(item.lessonCode) ?? []), item]);
  const codes = [...byLesson.keys()];
  for (let i = codes.length - 1; i > 0; i--) { const j = randomInt(i + 1); [codes[i], codes[j]] = [codes[j], codes[i]]; }
  return codes.slice(0, GRAMMAR_TEST_SIZE).map((code) => {
    const items = byLesson.get(code)!;
    return items[randomInt(items.length)];
  });
}

export function publicPlacement(items: AnswerKey[]): Choice[] {
  return items.map(({ id, lessonCode, prompt, instruction, options }) => ({ id, lessonCode, prompt, instruction, options }));
}

export function gradePlacement(items: AnswerKey[], ids: string[], answers: Record<string, string>) {
  const lookup = new Map(items.map((item) => [item.id, item]));
  const correct = ids.reduce((score, id) => {
    const item = lookup.get(id);
    const answer = answers[id];
    return score + Number(Boolean(item && typeof answer === "string" && item.options.includes(answer) && [item.correct, ...item.accepted].includes(answer)));
  }, 0);
  return scoreGrammarPlacement(correct);
}
