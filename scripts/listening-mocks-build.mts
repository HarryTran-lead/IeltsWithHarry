// Builds the bank's exam content from the owner's Listening Mocks 01–05 package (see listening-mocks.mts).
//
//   node --experimental-strip-types scripts/listening-mocks-build.mts <package>
//
// Writes <package>/../build/listening-mocks.json: one exam per mock, with the evidence turns as transcript line
// numbers and, when a recording exists, each line's start time. Asset URLs point at https://assets.invalid/<path>;
// the import (or the local preview) swaps in real URLs. The output holds answer keys: keep it out of the repo.
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { contentSchema, publicContent, scoreAnswers } from "../src/lib/ielts-bank/schema.ts";

type Speaker = { speaker_id: string; role: string };
type Turn = { turn_id: string; speaker_id: string; text_en: string };
type Question = { question_id: string; test_question_number: number; evidence_turn_ids: string[]; prompt_en: string; options?: { key: string; text: string }[]; correct_answers: string[]; accepted_answers?: string[]; explanation_vi?: string };
type Layout = { presentation?: string; heading?: string; options?: [string, string][]; sections?: Record<string, unknown>[]; summary_text?: string };
type Group = { question_ids: string[]; question_type: string; instructions_en: string; layout_metadata?: Layout };
type Part = { part_number: number; title: string; speakers: Speaker[]; turns: Turn[]; questions: Question[]; question_groups: Group[] };
type Master = { test_id: string; parts: Part[] };

const pkg = process.argv.slice(2).find((arg) => !arg.startsWith("--"));
if (!pkg || !existsSync(join(pkg, "MOCK_01"))) throw new Error("Pass the extracted package folder (with MOCK_01 … MOCK_05)");
const ASSET = "https://assets.invalid/";
const BLANK = "__________";
const partName = (mock: number, part: number) => `MOCK-0${mock}-P${part}`;
const typeOf: Record<string, string> = { mcq: "multiple_choice", mcq_choose_two: "multiple_answers", matching: "matching", map_labelling: "map_labelling" };
const gap = (text: string, n: number) => /_{3,}/.test(text) ? text.replace(/_{3,}/, `**${n}** ${BLANK}`) : `${text} **${n}** ${BLANK}`;

/** The name printed before each transcript line: the person's name when the script gives one. */
function speakerNames(part: Part) {
  const names: Record<string, string> = {};
  for (const speaker of part.speakers) {
    const role = speaker.role.trim();
    const intro = part.turns.find((turn) => turn.speaker_id === speaker.speaker_id)?.text_en.match(/\bI'm ([A-Z][a-z]+)\b/)?.[1];
    const trailing = role.split(" ").length > 1 ? / ([A-Z][a-z]+)$/.exec(role)?.[1] : undefined;
    names[speaker.speaker_id] = (role.includes(":") ? role.split(":").pop()!.trim() : undefined)
      ?? /\b(?:Dr|Prof)\s+[A-Z][a-z]+/.exec(role)?.[0]
      ?? /^([A-Z][a-z]+) \(/.exec(role)?.[1]
      ?? trailing ?? intro
      ?? (/lecturer/i.test(role) ? "Lecturer" : /supervisor|tutor/i.test(role) ? "Tutor" : /student/i.test(role) ? "Student" : "Guide");
  }
  // Two unnamed students become Student 1 and Student 2.
  const counts = Object.values(names).reduce((map, name) => map.set(name, (map.get(name) ?? 0) + 1), new Map<string, number>());
  const seen = new Map<string, number>();
  for (const id of Object.keys(names)) if ((counts.get(names[id]) ?? 0) > 1) { const n = (seen.get(names[id]) ?? 0) + 1; seen.set(names[id], n); names[id] = `${names[id]} ${n}`; }
  return names;
}

/** The Vietnamese explanation without the package's internal turn ids and review status. */
const cleanExplanation = (text = "") => text.replace(/\*\*(?:Dẫn chứng|Bằng chứng trong lời thoại|Trạng thái|Đối chiếu audio)[^*]*\*\*[^*]*/g, "").replace(/\s+/g, " ").trim();

function buildExam(mock: number, master: Master) {
  const timingsDir = [join(pkg!, "..", "audio"), join(pkg!, "..", "audio-placeholder")].find((dir) => existsSync(join(dir, `${partName(mock, 1)}.timings.json`)));
  const sections = master.parts.map((part) => {
    const names = speakerNames(part);
    const lineOf = new Map(part.turns.map((turn, index) => [turn.turn_id, index]));
    const timingFile = timingsDir ? join(timingsDir, `${partName(mock, part.part_number)}.timings.json`) : "";
    const timings = timingFile && existsSync(timingFile) ? JSON.parse(readFileSync(timingFile, "utf8")) as { turns: { turn: string; startMs: number }[] } : null;
    const byId = new Map(part.questions.map((question) => [question.question_id, question]));
    const printed: string[] = [];
    const questions: unknown[] = [];
    for (const group of part.question_groups) {
      const items = group.question_ids.map((id) => byId.get(id)!);
      const numbers = items.map((item) => item.test_question_number);
      const layout = group.layout_metadata ?? {};
      const rubric = group.instructions_en.replace(/A-([A-H])\b/g, "A–$1");
      const isGap = /completion/.test(group.question_type);
      printed.push(`**Questions ${numbers[0]}–${numbers.at(-1)}**`, rubric);
      if (isGap) {
        if (layout.heading) printed.push(`**${layout.heading}**`);
        const blocks = (layout.sections ?? []).map((entry) => ({ heading: String(entry.heading ?? entry.section ?? ""), ids: (entry.ids ?? entry.questions ?? []) as number[] }));
        const line = (item: Question) => {
          const n = item.test_question_number;
          if (layout.presentation === "matrix_table") { const [left, ...rest] = item.prompt_en.split(":"); return `${left.trim()} | ${gap(rest.join(":").trim(), n)}`; }
          if (layout.presentation === "thematic_research_table") return `${item.prompt_en} | ${gap("", n).trim()}`;
          return `${layout.presentation === "form_fields" ? "" : "- "}${gap(item.prompt_en, n)}`;
        };
        if (layout.presentation === "summary_prose" && layout.summary_text) printed.push(layout.summary_text.replace(/\((\d+)\)\s*_{3,}/g, (_, n) => `**${n}** ${BLANK}`));
        else if (blocks.length) for (const block of blocks) {
          printed.push(`**${block.heading}**`);
          if (layout.presentation === "thematic_research_table") printed.push("What the lecturer describes | Term");
          for (const n of block.ids) { const item = items.find((entry) => entry.test_question_number === n); if (item) printed.push(line(item)); }
        } else {
          if (layout.presentation === "matrix_table") printed.push("Detail | Information");
          for (const item of items) printed.push(line(item));
        }
      }
      printed.push("");
      const box = layout.options?.map(([key, text]) => `${key} — ${text}`);
      const heading = layout.heading && !isGap && group.question_type !== "mcq" && layout.heading !== part.title ? `**${layout.heading}**\n` : "";
      const map = group.question_type === "map_labelling" ? readdirSync(join(pkg!, `MOCK_0${mock}`, "assets", "maps")).find((file) => file.endsWith(".svg")) : undefined;
      for (const item of items) {
        const pair = group.question_type === "mcq_choose_two";
        questions.push({
          id: `ESL-LM-0${mock}-Q${String(item.test_question_number).padStart(2, "0")}`,
          number: item.test_question_number,
          type: typeOf[group.question_type] ?? group.question_type,
          instructions: `${heading}${rubric}`,
          prompt: pair ? `Questions ${numbers[0]}–${numbers.at(-1)}: ${item.prompt_en}` : item.prompt_en.replace(/_{3,}/, BLANK),
          options: map ? (item.options ?? []).map((option) => option.key) : box ?? (item.options ?? []).map((option) => `${option.key} — ${option.text}`),
          answers: [...new Set([...item.correct_answers, ...(isGap ? item.accepted_answers ?? [] : [])])],
          explanation: cleanExplanation(item.explanation_vi),
          ...(isGap ? { wordLimit: /(NO MORE THAN .+?)(?= for each|\.|$)/.exec(rubric)?.[1].trim() } : {}),
          ...(pair ? { group: `ESL-LM-0${mock}-G${numbers[0]}` } : {}),
          ...(map ? { mediaUrl: `${ASSET}MOCK_0${mock}/assets/maps/${map}` } : {}),
          evidenceLines: [...new Set(item.evidence_turn_ids.map((id) => lineOf.get(id)).filter((index): index is number => index !== undefined))],
        });
      }
    }
    return {
      id: `ESL-LM-0${mock}-P${part.part_number}`,
      title: part.title,
      passage: printed.join("\n").trim(),
      transcript: part.turns.map((turn) => `${names[turn.speaker_id]}: ${turn.text_en}`).join("\n"),
      audioUrl: `${ASSET}audio/${partName(mock, part.part_number)}.mp3`,
      ...(timings ? { transcriptTimes: part.turns.map((turn) => Math.round((timings.turns.find((entry) => entry.turn === turn.turn_id)?.startMs ?? 0) / 100) / 10) } : {}),
      coverUrl: `${ASSET}MOCK_0${mock}/assets/covers_PREVIEW_UNAPPROVED/part_${part.part_number}.webp`,
      questions,
    };
  });
  return {
    externalId: `ESL-LM-0${mock}`, mock, title: `English Skill Lab Listening Test 0${mock}`,
    topic: master.parts.map((part) => part.title).join(" · "), sourceTestId: master.test_id,
    audioSource: timingsDir?.endsWith("audio-placeholder") ? "placeholder" : timingsDir ? "gemini" : "none",
    content: contentSchema.parse({ sections }),
  };
}

const masters = readdirSync(pkg).filter((dir) => /^MOCK_0\d$/.test(dir)).sort().map((dir) => {
  const file = readdirSync(join(pkg, dir, "server_only")).find((name) => name.endsWith("Canonical_Teacher_Master.json"))!;
  return { mock: Number(dir.slice(-2)), master: JSON.parse(readFileSync(join(pkg, dir, "server_only", file), "utf8")) as Master };
});
const exams = masters.map(({ mock, master }) => buildExam(mock, master));
for (const exam of exams) {
  const questions = exam.content.sections.flatMap((section) => section.questions);
  // Every key must grade itself as correct, and the learner copy must carry no key or evidence.
  const { score } = scoreAnswers(exam.content, Object.fromEntries(questions.map((question) => [question.id, question.answers[0]])));
  const leaked = publicContent(exam.content).sections.some((section) => section.transcript || section.questions.some((question) => question.answers.length || question.explanation || question.evidenceLines));
  const unprinted = exam.content.sections.flatMap((section) => section.questions.filter((question) => !question.options.length && !section.passage.includes(`**${question.number}**`)).map((question) => question.number));
  const noEvidence = questions.filter((question) => !question.evidenceLines?.length).map((question) => question.number);
  console.log(`${exam.externalId}: ${questions.length} questions, key grades ${score}/${questions.length}, audio ${exam.audioSource}${unprinted.length ? `, gaps not printed: ${unprinted.join(",")}` : ""}${noEvidence.length ? `, no evidence: ${noEvidence.join(",")}` : ""}${leaked ? " — LEARNER COPY LEAKS" : ""}`);
  if (questions.length !== 40 || score !== 40 || leaked || unprinted.length) process.exitCode = 1;
}
const out = join(pkg, "..", "build");
mkdirSync(out, { recursive: true });
writeFileSync(join(out, "listening-mocks.json"), JSON.stringify(exams, null, 1));
console.log(`Wrote ${join(out, "listening-mocks.json")}`);
