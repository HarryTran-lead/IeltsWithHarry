// Full IELTS-format Listening papers written in content/listening-tests/ESL-OL-NN.txt: check them, import them
// as private drafts, voice them with Gemini TTS (narrator rubric and real-exam pauses), and publish each paper
// once its four parts are voiced. The papers reuse the ESL-OL ids of the owner's 30-paper pack.
//
//   check (default)  structure, word limits, answers, evidence spoken in order, no question repeated across papers
//   --import         create or refresh drafts (dry run unless --apply); plan images go to the ielts-images bucket
//   --voice          MP3s into content/listening-tests/dist (gitignored); stops cleanly at the daily Gemini quota
//   --publish        attach audio and publish every paper whose four MP3s exist (dry run unless --apply)
//   --only ESL-OL-01,ESL-OL-02 limits any mode to those papers.
//
//   node --experimental-strip-types scripts/listening-tests.mts
//   node --env-file=.env.production.local --experimental-strip-types scripts/listening-tests.mts --import|--publish [--apply]
//   LAMEJS=<lamejs.js> node --env-file=.env.local --experimental-strip-types scripts/listening-tests.mts --voice
//
// Paper format (one file per paper):
//   # ESL-OL-01 | Title
//   ## Part 1 | Title                      four parts
//   intro: a telephone conversation …       completes "You will hear …" in the narrator rubric
//   voices: Receptionist=Kore en-GB, …     Gemini voice and accent per speaker
//   @ 1-10 form_completion | rubric        a question group: range, bank type, rubric as printed on the paper
//   = Title  ** Heading  - bullet  text    layout lines (form, notes, table rows, flow chart); {7} marks gap 7
//   image: ESL-OL-01-plan.svg              plan/map for a labelling group (letters A–H from the rubric)
//   A text                                 an option: belongs to the question above it, otherwise to the group's box
//   21 text  /  11-12 text                 a question (MCQ, matching item, map label, Choose TWO stem)
//   ? 3 = 9.30 / half past nine | evidence answer (alternatives split by " / ") and the words spoken in the script
//   ? 11-12 = B, E | evidence || evidence  a Choose TWO pair
//   ### 1-6                                a dialogue block; the narrator gives reading time before each block
//   Speaker: words                         script lines
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { chunkTurns, pcmFromAudio, silence, ttsModels, ttsRequestBody, TTS_SAMPLE_RATE, type Turn } from "../src/lib/listening-tts.ts";
import { contentHash, contentSchema, publicContent, scoreAnswers, validateExam, type ExamQuestion, type NormalizedExam } from "../src/lib/ielts-bank/schema.ts";

const args = process.argv.slice(2);
const apply = args.includes("--apply");
const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
const sourceDir = join("content", "listening-tests");
const outDir = join(sourceDir, "dist");
const REVIEW_URL = "https://github.com/HarryTran-lead/IeltsWithHarry/blob/main/content/listening-tests";
const license = "English Skill Lab original practice test (owner-supplied)";
const attribution = "English Skill Lab original practice test";
const BLANK = "__________";

type Option = { key: string; text: string };
type Question = { number: number; to?: number; text: string; options: Option[] };
type Answer = { from: number; to: number; values: string[]; evidence: string[] };
type Group = { from: number; to: number; type: string; rubric: string; layout: string[]; box: Option[]; questions: Question[]; image?: string; answers: Answer[] };
type Block = { from: number; to: number; lines: Turn[] };
type Part = { number: number; title: string; intro: string; voices: Record<string, { voice: string; accent: string }>; groups: Group[]; blocks: Block[] };
type Paper = { id: string; title: string; file: string; parts: Part[] };

// ---- parse ---------------------------------------------------------------------------------------
function parsePaper(file: string): Paper {
  const paper: Paper = { id: "", title: "", file, parts: [] };
  let mode: "group" | "block" | null = null;
  for (const [index, raw] of readFileSync(join(sourceDir, file), "utf8").split(/\r?\n/).entries()) {
    const line = raw.trim();
    const fail = (message: string): never => { throw new Error(`${file}:${index + 1}: ${message}`); };
    if (!line || line.startsWith("//")) continue;
    const part = paper.parts.at(-1);
    const group = part?.groups.at(-1);
    let m: RegExpMatchArray | null;
    if ((m = line.match(/^# (ESL-OL-\d\d) \| (.+)$/))) [paper.id, paper.title] = [m[1], m[2]];
    else if ((m = line.match(/^## Part ([1-4]) \| (.+)$/))) { paper.parts.push({ number: Number(m[1]), title: m[2], intro: "", voices: {}, groups: [], blocks: [] }); mode = null; }
    else if (!part) fail("text before the first part");
    else if ((m = line.match(/^intro: (.+)$/))) part!.intro = m[1];
    else if ((m = line.match(/^voices: (.+)$/))) {
      for (const pair of m[1].split(",")) {
        const v = pair.trim().match(/^(.+?)=(\w+) (en-[A-Z]{2})$/) ?? fail(`bad voice "${pair.trim()}"`);
        part!.voices[v[1]] = { voice: v[2], accent: v[3] };
      }
    } else if ((m = line.match(/^@ (\d+)-(\d+) ([a-z_]+) \| (.+)$/))) { part!.groups.push({ from: Number(m[1]), to: Number(m[2]), type: m[3], rubric: m[4], layout: [], box: [], questions: [], answers: [] }); mode = "group"; }
    else if ((m = line.match(/^### (\d+)-(\d+)$/))) { part!.blocks.push({ from: Number(m[1]), to: Number(m[2]), lines: [] }); mode = "block"; }
    else if (mode === "block") {
      m = line.match(/^([A-Z][\w .'-]{0,30}): (.+)$/) ?? fail(`expected "Speaker: words", got "${line.slice(0, 40)}"`);
      part!.blocks.at(-1)!.lines.push({ speaker: m[1], text: m[2] });
    } else if (mode === "group" && group) {
      if ((m = line.match(/^\? (\d+)(?:-(\d+))? = (.+?) \| (.+)$/))) {
        group.answers.push({ from: Number(m[1]), to: Number(m[2] ?? m[1]), values: m[3].split(m[2] ? /\s*,\s*/ : /\s+\/\s+/), evidence: m[4].split(/\s*\|\|\s*/) });
      } else if ((m = line.match(/^image: (\S+)$/))) group.image = m[1];
      else if ((m = line.match(/^([A-H]) (.+)$/))) (group.questions.at(-1)?.options ?? group.box).push({ key: m[1], text: m[2] });
      else if ((m = line.match(/^(\d+)(?:-(\d+))? (.+)$/))) group.questions.push({ number: Number(m[1]), to: m[2] ? Number(m[2]) : undefined, text: m[3], options: [] });
      else group.layout.push(line);
    } else fail(`cannot read "${line.slice(0, 40)}"`);
  }
  return paper;
}

const normalize = (text: string) => text.normalize("NFKC").replace(/[‘’]/g, "'").replace(/[“”]/g, '"').replace(/[–—]/g, "-").toLowerCase().replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "");
const isGap = (type: string) => /completion|short[_-]answer/.test(type);
const lettersIn = (rubric: string) => { const m = /A[–-]([A-H])/.exec(rubric); return m ? Array.from({ length: m[1].charCodeAt(0) - 64 }, (_, i) => String.fromCharCode(65 + i)) : []; };
const gapsIn = (line: string) => [...line.matchAll(/\{(\d+)\}/g)].map((m) => Number(m[1]));
/** Word limit printed in the rubric: words allowed and whether one number may be added. */
function limitOf(rubric: string) {
  const words = /ONE WORD/.test(rubric) ? 1 : /TWO WORDS/.test(rubric) ? 2 : /THREE WORDS/.test(rubric) ? 3 : 0;
  return words ? { words, number: /NUMBER/.test(rubric), label: (/(NO MORE THAN .+?|ONE WORD(?: AND\/OR A NUMBER| ONLY)?)(?= for each| for| $|\.)/.exec(rubric)?.[1] ?? "").trim() } : null;
}
function fitsLimit(answer: string, limit: { words: number; number: boolean }) {
  const tokens = answer.split(/\s+/).filter(Boolean);
  const numbers = tokens.filter((token) => /\d/.test(token)).length;
  return tokens.length - numbers <= limit.words && (numbers === 0 || (limit.number && numbers <= 1)) && tokens.length > 0;
}
/** The paper as printed for one part: rubrics, forms, notes, questions and boxes, with numbered blanks. */
function printedPart(part: Part) {
  const lines: string[] = [];
  for (const group of part.groups) {
    lines.push(`**Questions ${group.from}–${group.to}**`, group.rubric);
    for (const line of group.layout) {
      const text = line.replace(/\{(\d+)\}/g, (_, n) => `**${n}** ${BLANK}`);
      lines.push(text.startsWith("= ") ? `**${text.slice(2)}**` : text.startsWith("** ") ? `**${text.slice(3)}**` : text.startsWith("- ") ? `• ${text.slice(2)}` : text);
    }
    if (group.image) lines.push(`(Plan: see the image with Questions ${group.from}–${group.to}.)`);
    for (const option of group.box) lines.push(`${option.key}  ${option.text}`);
    for (const question of group.questions) {
      lines.push(`**${question.to ? `${question.number}–${question.to}` : question.number}** ${question.text.replace(/\{\d+\}/g, BLANK)}`);
      for (const option of question.options) lines.push(`   ${option.key}  ${option.text}`);
    }
    lines.push("");
  }
  return lines.join("\n").trim();
}

// ---- check ---------------------------------------------------------------------------------------
const papers = readdirSync(sourceDir).filter((file) => /^ESL-OL-\d\d\.txt$/.test(file)).sort().map(parsePaper)
  .filter((paper) => !only || only.includes(paper.id));
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? "https://example.invalid";
const imageUrl = (file: string) => `${supabaseUrl}/storage/v1/object/public/ielts-images/listening-tests/${file.replace(/\.svg$/, ".png")}`;
const problems: string[] = [];
const report: string[] = [];
const seenPrompts = new Map<string, string>();

function toExam(paper: Paper): NormalizedExam {
  const sections = paper.parts.map((part) => {
    const questions: ExamQuestion[] = [];
    for (const group of part.groups) {
      const limit = limitOf(group.rubric);
      const answerFor = (n: number) => group.answers.find((answer) => n >= answer.from && n <= answer.to);
      const title = group.layout.find((line) => line.startsWith("= "))?.slice(2);
      let heading = "";
      const base = (n: number) => ({ id: `${paper.id}-Q${String(n).padStart(2, "0")}`, number: n, instructions: [title && `**${title}**`, group.rubric].filter(Boolean).join("\n") });
      const explain = (answer?: Answer) => answer ? `Evidence: ${answer.evidence.join(" … ")}` : "";
      const lettered = (options: Option[]) => options.map((option) => `${option.key} — ${option.text}`);
      // Gap questions come from the layout lines that carry {n}. In a table, a gap is named by its row and column.
      const header = group.layout.find((line) => line.includes(" | ") && !gapsIn(line).length && !line.startsWith("Example"))?.split(" | ");
      for (const line of group.layout) {
        if (line.startsWith("** ")) heading = line.slice(3);
        for (const n of gapsIn(line)) {
          const answer = answerFor(n);
          const cells = line.split(" | ");
          const cell = cells.findIndex((text) => text.includes(`{${n}}`));
          const prompt = (header && cells.length > 1 ? `${cells[0]} — ${header[cell] ?? ""}: ${cells[cell]}` : line.replace(/^(= |\*\* |- )/, ""))
            .replace(new RegExp(`\\{${n}\\}`), BLANK).replace(/\{\d+\}/g, "…");
          questions.push({ ...base(n), type: group.type, prompt: heading && !prompt.includes(":") ? `${heading} — ${prompt}` : prompt,
            options: lettered(group.box), answers: answer?.values ?? [], explanation: explain(answer), ...(limit ? { wordLimit: limit.label } : {}) });
        }
      }
      for (const question of group.questions) {
        const last = question.to ?? question.number;
        for (let n = question.number; n <= last; n += 1) {
          const answer = answerFor(n);
          const pair = question.to !== undefined;
          const letters = group.image ? lettersIn(group.rubric) : [];
          questions.push({ ...base(n), type: group.type,
            prompt: pair ? `Questions ${question.number}–${last}: ${question.text}` : question.text.replace(/\{\d+\}/g, BLANK),
            options: letters.length ? letters : lettered(question.options.length ? question.options : group.box),
            answers: pair ? [answer?.values[n - question.number] ?? ""] : answer?.values ?? [],
            explanation: explain(answer),
            ...(pair ? { group: `${paper.id}-G${question.number}` } : {}),
            ...(group.image ? { mediaUrl: imageUrl(group.image) } : {}) });
        }
      }
    }
    questions.sort((a, b) => a.number - b.number);
    return { id: `${paper.id}-P${part.number}`, title: part.title, passage: printedPart(part), transcript: part.blocks.flatMap((block) => block.lines.map((line) => `${line.speaker}: ${line.text}`)).join("\n"), questions };
  });
  return {
    externalId: paper.id, skill: "Listening", format: "Academic", mode: "practice", title: paper.title,
    topic: paper.parts.map((part) => part.title).join(" · "), difficulty: "Uncalibrated", durationMinutes: 32,
    sourceUrl: REVIEW_URL, attribution, license, licenseUrl: REVIEW_URL, aiGenerated: true, upstreamVersion: `listening-tests:${createHash("sha256").update(readFileSync(join(sourceDir, paper.file))).digest("hex").slice(0, 16)}`,
    content: contentSchema.parse({ sections }),
  };
}

const exams = papers.map((paper) => {
  const label = paper.id || paper.file;
  if (paper.parts.map((part) => part.number).join() !== "1,2,3,4") problems.push(`${label}: needs Parts 1–4`);
  let total = 0;
  for (const part of paper.parts) {
    const where = `${label} P${part.number}`;
    const first = (part.number - 1) * 10 + 1;
    const covered = part.groups.flatMap((group) => Array.from({ length: group.to - group.from + 1 }, (_, i) => group.from + i));
    if (covered.join() !== Array.from({ length: 10 }, (_, i) => first + i).join()) problems.push(`${where}: groups must cover ${first}–${first + 9} in order`);
    const blockRanges = part.blocks.map((block) => [block.from, block.to]);
    if (part.number === 4 ? JSON.stringify(blockRanges) !== "[[31,40]]" : part.blocks.length !== 2 || blockRanges[0][0] !== first || blockRanges[1][1] !== first + 9 || blockRanges[1][0] !== blockRanges[0][1] + 1) problems.push(`${where}: dialogue blocks ${JSON.stringify(blockRanges)} (Part 4 is one block; others two)`);
    if (!part.intro) problems.push(`${where}: missing intro`);
    for (const speaker of new Set(part.blocks.flatMap((block) => block.lines.map((line) => line.speaker)))) if (!part.voices[speaker]) problems.push(`${where}: no voice for ${speaker}`);
    const words = part.blocks.reduce((sum, block) => sum + block.lines.reduce((n, line) => n + line.text.split(/\s+/).length, 0), 0);
    total += words;
    if (words < 600 || words > 1100) problems.push(`${where}: ${words} words (aim for 650–1,000)`);
    const blockText = (n: number) => normalize(part.blocks.find((block) => n >= block.from && n <= block.to)?.lines.map((line) => line.text).join(" ") ?? "");
    const whole = normalize(part.blocks.flatMap((block) => block.lines.map((line) => line.text)).join(" "));
    let last = -1;
    for (const group of part.groups) {
      const limit = limitOf(group.rubric);
      const written = isGap(group.type) && !group.box.length; // a flow chart with a letter box takes letters, not words
      if (written && !limit) problems.push(`${where} Q${group.from}: gap rubric has no word limit`);
      if (part.number === 1 && written && limit && !(limit.words === 1 && limit.number)) problems.push(`${where} Q${group.from}: Part 1 completion should be ONE WORD AND/OR A NUMBER`);
      if (part.number === 4 && written && limit && limit.words > 1) problems.push(`${where} Q${group.from}: Part 4 notes should be ONE WORD ONLY`);
      if (group.image && !existsSync(join(sourceDir, group.image))) problems.push(`${where}: missing ${group.image}`);
      const numbers = [...group.layout.flatMap(gapsIn), ...group.questions.flatMap((q) => Array.from({ length: (q.to ?? q.number) - q.number + 1 }, (_, i) => q.number + i))].sort((a, b) => a - b);
      if (numbers.join() !== Array.from({ length: group.to - group.from + 1 }, (_, i) => group.from + i).join()) problems.push(`${where} Q${group.from}-${group.to}: questions/gaps are ${numbers.join(",")}`);
      for (const answer of group.answers) {
        const choices = group.image ? lettersIn(group.rubric) : (group.questions.find((q) => q.number === answer.from)?.options.length ? group.questions.find((q) => q.number === answer.from)!.options : group.box).map((o) => o.key);
        if (answer.to > answer.from && (answer.values.length !== answer.to - answer.from + 1 || new Set(answer.values).size !== answer.values.length)) problems.push(`${where} Q${answer.from}-${answer.to}: needs ${answer.to - answer.from + 1} different letters`);
        for (const value of answer.values) {
          if (choices.length && !choices.includes(value)) problems.push(`${where} Q${answer.from}: ${value} is not an option`);
          if (!choices.length && limit && !fitsLimit(value, limit)) problems.push(`${where} Q${answer.from}: "${value}" breaks ${limit.label}`);
        }
        if (!choices.length && !answer.evidence.some((e) => answer.values.some((v) => normalize(e).includes(normalize(v))))) problems.push(`${where} Q${answer.from}: no answer form appears in its evidence`);
        for (const evidence of answer.evidence) {
          const text = normalize(evidence);
          if (!blockText(answer.from).includes(text)) { problems.push(`${where} Q${answer.from}: evidence not spoken in its block: "${evidence.slice(0, 60)}"`); continue; }
          const at = whole.indexOf(text);
          if (answer.to === answer.from && at < last) problems.push(`${where} Q${answer.from}: evidence out of order`);
          if (answer.to === answer.from) last = Math.max(last, at);
        }
      }
      for (let n = group.from; n <= group.to; n += 1) if (!group.answers.some((answer) => n >= answer.from && n <= answer.to)) problems.push(`${where} Q${n}: no answer`);
      // Learners must not be able to answer one paper from another: no stem, item or option text may repeat.
      for (const text of [...group.layout.filter((l) => gapsIn(l).length), ...group.questions.map((q) => q.text), ...group.questions.flatMap((q) => q.options.map((o) => o.text)), ...group.box.map((o) => o.text)]) {
        const key = normalize(text.replace(/\{\d+\}/g, ""));
        if (key.length < 12) continue;
        const owner = seenPrompts.get(key);
        if (owner && owner !== paper.id) problems.push(`${where}: "${text.slice(0, 50)}" repeats ${owner}`);
        seenPrompts.set(key, paper.id);
      }
    }
    report.push(`${where}: ${words} words · ${part.groups.map((group) => `${group.from}-${group.to} ${group.type}`).join(", ")}`);
  }
  report.push(`${label}: ${total} words in total`);
  const exam = toExam(paper);
  const invalid = validateExam(exam).filter((warning) => warning !== "audio_missing");
  if (invalid.length) problems.push(`${label}: ${invalid.join(", ")}`);
  const questions = exam.content.sections.flatMap((section) => section.questions);
  if (questions.length !== 40) problems.push(`${label}: ${questions.length} questions`);
  const key = Object.fromEntries(questions.map((q) => [q.id, q.options.find((o) => o === q.answers[0] || o.startsWith(`${q.answers[0]} — `)) ?? q.answers[0]]));
  if (scoreAnswers(exam.content, key).score !== 40) problems.push(`${label}: answer key does not grade 40/40`);
  const learner = publicContent(exam.content);
  if (learner.sections.some((s) => s.transcript || s.questions.some((q) => q.answers.length || q.explanation))) problems.push(`${label}: learner view leaks answers`);
  return exam;
});
console.log(report.join("\n"));
if (problems.length) { console.error(`\n${problems.length} problem(s):\n${problems.join("\n")}`); process.exit(1); }
console.log(`\n${papers.length} paper(s) check out.`);
// --show ESL-OL-01:3 prints that part as the learner sees it: the paper on the left, then one line per question.
if (args.includes("--show")) {
  const [id, part] = args[args.indexOf("--show") + 1].split(":");
  const section = exams.find((exam) => exam.externalId === id)?.content.sections[Number(part) - 1];
  console.log(section ? `${section.passage}\n\n${section.questions.map((q) => `[${q.number} ${q.type}] ${q.prompt} | ${q.options.join(" · ")} => ${q.answers.join(" / ")}`).join("\n")}` : "no such part");
}

// ---- preview -------------------------------------------------------------------------------------
// --preview writes content/listening-tests/dist/preview.html: each part's printed paper, plan, answer key and transcript.
if (args.includes("--preview")) {
  const escape = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const inline = (text: string) => escape(text).replace(/\*\*([^*]+)\*\*/g, "<b>$1</b>").replace(/_{3,}/g, '<span class="blank"></span>');
  const paperHtml = (passage: string) => {
    const out: string[] = [];
    let table: string[][] = [];
    const flush = () => { if (table.length) out.push(`<table>${table.map((row, i) => `<tr>${row.map((cell) => `<${i ? "td" : "th"}>${inline(cell)}</${i ? "td" : "th"}>`).join("")}</tr>`).join("")}</table>`); table = []; };
    for (const line of passage.split("\n")) {
      if (line.includes(" | ")) { table.push(line.split(" | ")); continue; }
      flush();
      out.push(line.trim() ? `<p>${inline(line)}</p>` : "");
    }
    flush();
    return out.join("\n");
  };
  const body = papers.map((paper, index) => {
    const exam = exams[index];
    const parts = paper.parts.map((part, partIndex) => {
      const section = exam.content.sections[partIndex];
      const images = [...new Set(part.groups.map((group) => group.image).filter(Boolean))].map((file) => `<figure>${readFileSync(join(sourceDir, file!), "utf8").replace(/<\?xml[^>]*>/, "")}</figure>`).join("");
      const key = section.questions.map((q) => `<li><b>${q.number}</b> ${escape(q.answers.join(" / "))} <span class="ev">${escape(q.explanation.replace(/^Evidence: /, ""))}</span></li>`).join("");
      const words = part.blocks.reduce((sum, block) => sum + block.lines.reduce((n, line) => n + line.text.split(/\s+/).length, 0), 0);
      const transcript = part.blocks.map((block) => `<h5>Questions ${block.from}–${block.to}</h5>${block.lines.map((line) => `<p><b>${escape(line.speaker)}:</b> ${escape(line.text)}</p>`).join("")}`).join("");
      return `<section class="part"><h3>Part ${part.number} · ${escape(part.title)} <small>${words} words · ${Object.entries(part.voices).map(([s, v]) => `${escape(s)} (${v.voice}, ${v.accent})`).join(", ")}</small></h3>
<div class="paper">${paperHtml(section.passage)}${images}</div>
<details><summary>Answer key and evidence</summary><ol class="key">${key}</ol></details>
<details><summary>Transcript</summary><div class="script">${transcript}</div></details></section>`;
    }).join("\n");
    return `<article id="${paper.id}"><h2>${escape(paper.id)} · ${escape(paper.title)}</h2>${parts}</article>`;
  }).join("\n");
  const nav = papers.map((paper) => `<a href="#${paper.id}">${paper.id}</a>`).join("");
  mkdirSync(outDir, { recursive: true });
  writeFileSync(join(outDir, "preview.html"), `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Listening papers preview</title>
<style>
:root{--ink:#1d2a38;--muted:#5d6b78;--line:#d6dee5;--wash:#f4f7f9;--accent:#1f6f8b}
body{margin:0;background:#eef2f5;color:var(--ink);font:15px/1.55 Georgia,"Times New Roman",serif}
nav{position:sticky;top:0;z-index:2;display:flex;flex-wrap:wrap;gap:8px;padding:10px 16px;background:#fff;border-bottom:1px solid var(--line);font-family:Arial,sans-serif}
nav a{padding:4px 10px;border:1px solid var(--line);border-radius:999px;color:var(--accent);text-decoration:none;font-size:13px}
main{max-width:860px;margin:0 auto;padding:16px}
article{margin:0 0 40px}h2{font-family:Arial,sans-serif;font-size:22px;margin:24px 0 12px}
.part{background:#fff;border:1px solid var(--line);border-radius:10px;padding:16px 20px;margin:0 0 18px}
h3{font-family:Arial,sans-serif;font-size:17px;margin:0 0 10px}h3 small{display:block;color:var(--muted);font-weight:400;font-size:12px;margin-top:2px}
.paper p{margin:3px 0}.blank{display:inline-block;width:90px;border-bottom:1.5px solid var(--ink);margin:0 4px;vertical-align:-2px}
table{border-collapse:collapse;margin:8px 0;width:100%}th,td{border:1px solid var(--line);padding:5px 8px;text-align:left;vertical-align:top}th{background:var(--wash)}
figure{margin:10px 0}figure svg{max-width:100%;height:auto;border:1px solid var(--line);border-radius:8px}
details{margin-top:10px;font-family:Arial,sans-serif;font-size:14px}summary{cursor:pointer;color:var(--accent);font-weight:700}
.key{padding-left:18px}.key li{margin:4px 0;list-style:none}.ev{display:block;color:var(--muted);font-size:12.5px}
.script p{margin:4px 0}h5{margin:12px 0 4px;color:var(--muted)}
</style></head><body><nav>${nav}</nav><main>${body}</main></body></html>`);
  console.log(`Preview written to ${join(outDir, "preview.html")}`);
}

// ---- database ------------------------------------------------------------------------------------
async function database() {
  const { createClient } = await import("@supabase/supabase-js");
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!url) throw new Error("Missing NEXT_PUBLIC_SUPABASE_URL");
  let key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!key || key.startsWith("[")) {
    const ref = new URL(url).hostname.split(".")[0];
    if (!/^[a-z0-9]{20}$/.test(ref)) throw new Error("Unexpected project ref");
    const [command, cliArgs] = process.platform === "win32"
      ? ["cmd.exe", ["/c", "npx", "supabase", "projects", "api-keys", "--project-ref", ref, "--output", "json"]]
      : ["npx", ["supabase", "projects", "api-keys", "--project-ref", ref, "--output", "json"]];
    key = (JSON.parse(execFileSync(command, cliArgs, { encoding: "utf8" })) as { id: string; api_key: string }[]).find((item) => item.id === "service_role")?.api_key;
  }
  if (!key) throw new Error("No service role key available");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}
const ok = <T,>(result: { data: T; error: { message: string } | null }, context: string) => {
  if (result.error) throw new Error(`${context}: ${result.error.message}`);
  return result.data;
};

// ---- import --------------------------------------------------------------------------------------
if (args.includes("--import")) {
  if (!process.env.NEXT_PUBLIC_SUPABASE_URL) throw new Error("--import needs the target Supabase environment");
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry run", drafts: exams.map((exam) => exam.externalId).join(" ") }));
  if (apply) {
    const db = await database();
    const { default: sharp } = await import("sharp");
    for (const [index, exam] of exams.entries()) {
      for (const image of new Set(papers[index].parts.flatMap((part) => part.groups.map((group) => group.image).filter(Boolean)))) {
        const png = await sharp(join(sourceDir, image!), { density: 144 }).png().toBuffer();
        ok(await db.storage.from("ielts-images").upload(`listening-tests/${image!.replace(/\.svg$/, ".png")}`, png, { contentType: "image/png", upsert: true }), `${image} upload`);
      }
      const { data: current } = await db.from("ielts_exams").select("status").eq("source_id", "manual").eq("external_id", exam.externalId).maybeSingle();
      if (current?.status === "published") { console.log(`${exam.externalId}: published already; edit through a new revision instead`); continue; }
      const warnings = [...validateExam(exam), "editorial_review_required", "band_not_calibrated"];
      const result = ok(await db.rpc("ielts_upsert_import", {
        p_source: "manual", p_external: exam.externalId,
        p_meta: { skill: exam.skill, format: exam.format, mode: exam.mode, title: exam.title, topic: exam.topic, difficulty: exam.difficulty, duration_minutes: exam.durationMinutes, source_url: exam.sourceUrl, attribution, license, license_url: exam.licenseUrl, ai_generated: exam.aiGenerated },
        p_content: exam.content, p_hash: contentHash(exam.content), p_upstream: exam.upstreamVersion, p_warnings: warnings,
      }), `${exam.externalId} import`);
      console.log(`${exam.externalId}: ${result}`);
    }
  }
}

// ---- voice ---------------------------------------------------------------------------------------
const partFile = (id: string, part: number) => join(outDir, `${id}-P${part}.mp3`);
const numberWords = ["", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine", "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen", "twenty"];
const spoken = (n: number) => n <= 20 ? numberWords[n] : `${["", "", "twenty", "thirty", "forty"][Math.floor(n / 10)]}${n % 10 ? `-${numberWords[n % 10]}` : ""}`;

/** Narrator rubric and pauses around the dialogue blocks of one part. */
function partPlan(part: Part) {
  const kind = part.number === 2 || part.number === 4 ? "talk" : "conversation";
  const steps: ({ say: string } | { pause: number } | { block: Block })[] = [];
  if (part.number === 1) steps.push({ say: "In this test, you will hear four recordings, and you will answer forty questions. You will hear each recording once only. Now turn to Part 1." }, { pause: 2 });
  else steps.push({ say: `Now turn to Part ${part.number}.` }, { pause: 1.5 });
  const [first, second] = part.blocks;
  const look = part.number === 4 ? 45 : 30;
  steps.push({ say: `Part ${part.number}. You will hear ${part.intro}. First, you have ${look === 45 ? "forty-five" : "thirty"} seconds to look at questions ${spoken(first.from)} to ${spoken(first.to)}.` }, { pause: look },
    { say: `Now listen carefully, and answer questions ${spoken(first.from)} to ${spoken(first.to)}.` }, { pause: 1.2 }, { block: first }, { pause: 2 });
  if (second) steps.push({ say: `Before you hear the rest of the ${kind}, you have thirty seconds to look at questions ${spoken(second.from)} to ${spoken(second.to)}.` }, { pause: 30 },
    { say: `Now listen, and answer questions ${spoken(second.from)} to ${spoken(second.to)}.` }, { pause: 1.2 }, { block: second }, { pause: 2 });
  steps.push(part.number === 4
    ? { say: "That is the end of Part 4. That is the end of the listening test. You now have two minutes to check all of your answers." }
    : { say: `That is the end of Part ${part.number}. You now have thirty seconds to check your answers to Part ${part.number}.` },
  { pause: part.number === 4 ? 120 : 30 });
  return steps;
}

if (args.includes("--voice")) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
  const { Mp3Encoder } = await import(process.env.LAMEJS ? pathToFileURL(process.env.LAMEJS).href : "@breezystack/lamejs");
  mkdirSync(join(outDir, "narrator"), { recursive: true });
  const models = ttsModels();
  const accents: Record<string, string> = { "en-GB": "British", "en-AU": "Australian", "en-NZ": "New Zealand", "en-US": "American", "en-IE": "Irish", "en-CA": "Canadian" };
  class QuotaSpent extends Error {}

  async function speak(chunk: Turn[], voices: Record<string, string>, styles: Record<string, string>) {
    let lastError = "";
    for (let attempt = 0; attempt < 6; attempt += 1) {
      for (const model of models) {
        const body = ttsRequestBody(chunk, voices, "", model);
        // Each speaker keeps their own accent; after two failed rounds fall back to one shared style.
        body.input[0].content.forEach((item, index) => {
          item.annotations[0].style = attempt < 2 ? styles[chunk[index].speaker] : "natural English accents, clear and natural, at the steady pace of an IELTS listening recording";
        });
        const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
          method: "POST", headers: { "x-goog-api-key": apiKey!, "Content-Type": "application/json" }, body: JSON.stringify(body),
        }).catch((error: Error) => { lastError = `network: ${error.cause instanceof Error ? error.cause.message : error.message}`; return null; });
        if (!response) continue;
        const payload = await response.json().catch(() => null) as { steps?: { content?: { type?: string; data?: string }[] }[]; error?: { message?: string } } | null;
        const data = (payload?.steps ?? []).flatMap((step) => step.content ?? []).filter((item) => item.type === "audio" && item.data).pop()?.data;
        if (response.ok && data) return pcmFromAudio(Uint8Array.from(Buffer.from(data, "base64")));
        lastError = payload?.error?.message ?? `HTTP ${response.status}`;
      }
      if (/per day/i.test(lastError)) throw new QuotaSpent(lastError);
      await new Promise((resolve) => setTimeout(resolve, 15000 * (attempt + 1)));
    }
    throw new Error(`TTS failed: ${lastError}`);
  }
  // Rubric lines repeat across papers, so each one is voiced once and reused.
  async function narrate(text: string) {
    const cached = join(outDir, "narrator", `${createHash("sha1").update(text).digest("hex").slice(0, 16)}.pcm`);
    if (existsSync(cached)) return new Uint8Array(readFileSync(cached));
    const pcm = await speak([{ speaker: "Narrator", text }], { Narrator: "Iapetus" }, { Narrator: "a calm, neutral British English exam narrator, clear and unhurried" });
    writeFileSync(cached, pcm);
    return pcm;
  }
  function mp3(parts: Uint8Array[]) {
    const pcm = Buffer.concat(parts);
    const samples = new Int16Array(pcm.buffer, pcm.byteOffset, Math.floor(pcm.byteLength / 2));
    const encoder = new Mp3Encoder(1, TTS_SAMPLE_RATE, 64);
    const chunks: Buffer[] = [];
    for (let offset = 0; offset < samples.length; offset += 1152) {
      const encoded = encoder.encodeBuffer(samples.subarray(offset, offset + 1152));
      if (encoded.length) chunks.push(Buffer.from(encoded));
    }
    const tail = encoder.flush();
    if (tail.length) chunks.push(Buffer.from(tail));
    return { bytes: Buffer.concat(chunks), minutes: samples.length / TTS_SAMPLE_RATE / 60 };
  }
  try {
    for (const paper of papers) {
      for (const part of paper.parts) {
        const target = partFile(paper.id, part.number);
        if (existsSync(target)) continue;
        const voices = Object.fromEntries(Object.entries(part.voices).map(([speaker, v]) => [speaker, v.voice]));
        const styles = Object.fromEntries(Object.entries(part.voices).map(([speaker, v]) => [speaker, `${accents[v.accent] ?? "British"} English accent; clear and natural, at the steady pace of an IELTS listening recording`]));
        const pcm: Uint8Array[] = [];
        for (const step of partPlan(part)) {
          if ("pause" in step) pcm.push(silence(step.pause));
          else if ("say" in step) pcm.push(await narrate(step.say));
          else for (const [index, chunk] of chunkTurns(step.block.lines, 3200).entries()) {
            if (index) pcm.push(silence(0.4));
            pcm.push(await speak(chunk, voices, styles));
          }
        }
        const { bytes, minutes } = mp3(pcm);
        writeFileSync(target, bytes);
        console.log(`${paper.id} Part ${part.number}: ${minutes.toFixed(1)} min`);
      }
    }
  } catch (error) {
    if (!(error instanceof QuotaSpent)) throw error;
    console.log(`Daily Gemini TTS quota used up; re-run after it resets. ${error.message}`);
  }
}

// ---- publish -------------------------------------------------------------------------------------
if (args.includes("--publish")) {
  const db = await database();
  const actor = (ok(await db.from("admin_users").select("user_id").order("granted_at").limit(1), "admin user") as { user_id: string }[])[0]?.user_id;
  if (!actor) throw new Error("No admin user to record as reviewer");
  type Row = { id: string; external_id: string; title: string; format: string; mode: string; topic: string; difficulty: string; source_url: string; license_url: string; ai_generated: boolean; current_version_id: string; status: string };
  const ids = papers.map((paper) => paper.id);
  const rows = (ok(await db.from("ielts_exams").select("id,external_id,title,format,mode,topic,difficulty,source_url,license_url,ai_generated,current_version_id,status").eq("source_id", "manual").in("external_id", ids).order("external_id"), "papers") as Row[]);
  const minutesOf = (file: string) => readFileSync(file).byteLength / 8000 / 60; // 64 kbps CBR
  const ready = rows.filter((row) => row.status !== "published" && [1, 2, 3, 4].every((part) => existsSync(partFile(row.external_id, part))));
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry run", written: ids.length, imported: rows.length, toPublish: ready.map((row) => row.external_id).join(" ") || "none" }));
  if (apply) for (const row of ready) {
    const version = ok(await db.from("ielts_exam_versions").select("id,revision,upstream_version,content").eq("id", row.current_version_id).single(), `${row.external_id} version`) as { id: string; revision: number; upstream_version: string; content: unknown };
    const content = contentSchema.parse(version.content);
    let minutes = 0;
    for (const [index, section] of content.sections.entries()) {
      const file = partFile(row.external_id, index + 1);
      const path = `listening-tests/${section.id}.mp3`;
      ok(await db.storage.from("ielts-audio").upload(path, readFileSync(file), { contentType: "audio/mpeg", upsert: true }), `upload ${path}`);
      section.audioUrl = db.storage.from("ielts-audio").getPublicUrl(path).data.publicUrl;
      minutes += minutesOf(file);
    }
    // The attempt is auto-submitted when duration_minutes runs out, so the timer must outlast the recording.
    const duration = Math.ceil(minutes) + 1;
    const warnings = validateExam({ externalId: row.external_id, skill: "Listening", format: row.format, mode: row.mode, title: row.title, topic: row.topic, difficulty: row.difficulty, durationMinutes: duration, sourceUrl: row.source_url, attribution, license, licenseUrl: row.license_url, aiGenerated: row.ai_generated, upstreamVersion: version.upstream_version, content });
    if (warnings.length) throw new Error(`${row.external_id}: validation warnings ${warnings.join(", ")}`);
    const note = "English Skill Lab Listening paper rewritten to the real IELTS format; audio voiced with Gemini TTS.";
    const created = ok(await db.from("ielts_exam_versions").insert({ exam_id: row.id, revision: version.revision + 1, upstream_version: version.upstream_version, content_hash: contentHash(content), content, warnings }).select("id").single(), `${row.external_id} revision`) as { id: string };
    ok(await db.from("ielts_exams").update({ current_version_id: created.id, duration_minutes: duration, license, attribution, status: "ready", updated_at: new Date().toISOString() }).eq("id", row.id).eq("current_version_id", version.id).select("id").single(), `${row.external_id} ready`);
    ok(await db.from("ielts_review_log").insert([{ exam_id: row.id, version_id: created.id, actor_id: actor, action: "edit", note }, { exam_id: row.id, version_id: created.id, actor_id: actor, action: "ready", note }]), `${row.external_id} review log`);
    ok(await db.from("ielts_exams").update({ status: "published", published_version_id: created.id, updated_at: new Date().toISOString() }).eq("id", row.id).select("id").single(), `${row.external_id} publish`);
    ok(await db.from("ielts_review_log").insert({ exam_id: row.id, version_id: created.id, actor_id: actor, action: "publish", note }), `${row.external_id} publish log`);
    console.log(`${row.external_id}: published revision ${version.revision + 1}, ${minutes.toFixed(1)} min audio, timer ${duration} min`);
  }
}
