// Full-length, exam-style audio for the five owner-supplied pilot Listening papers (ESL-L-01 … 05).
// The longer scripts live in content/original-tests/listening/ESL-L-0N.txt:
//   # ID | Title, then "## Part N | Title", "intro: …", "voices: Speaker=Voice, …",
//   "### 1-6" question-range blocks, and "Speaker: text" lines.
// Each part's MP3 carries the narrator rubric and real-exam pauses: reading time before every block,
// a prompt between blocks, and checking time at the end of each part (two minutes after Part 4).
//
//   check (default)  every answer's evidence sentence is spoken, in order, inside its question block
//   --voice          Gemini TTS into content/original-tests/dist/full (gitignored; existing files are kept)
//   --publish        upload the MP3s and save a new revision of the five papers (dry run unless --apply)
//
//   node --experimental-strip-types scripts/full-length-original-listening.mts --zip <owner ZIP>
//   LAMEJS=<lamejs.js> node --env-file=.env.local --experimental-strip-types scripts/full-length-original-listening.mts --zip <owner ZIP> --voice
//   node --env-file=.env.production.local --experimental-strip-types scripts/full-length-original-listening.mts --zip <owner ZIP> --publish [--only ESL-L-01] [--apply]
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { pathToFileURL } from "node:url";
import { strFromU8, unzipSync } from "fflate";
import { chunkTurns, defaultStyle, pcmFromAudio, silence, ttsModels, ttsRequestBody, TTS_SAMPLE_RATE, type Turn } from "../src/lib/listening-tts.ts";

const args = process.argv.slice(2);
const zipPath = args[args.indexOf("--zip") + 1];
if (args.indexOf("--zip") < 0 || !zipPath) throw new Error("Pass --zip <owner-supplied ZIP path>");
const scriptDir = join("content", "original-tests", "listening");
const outDir = join("content", "original-tests", "dist", "full");
const NARRATOR_VOICE = "Iapetus";
const LOOK_SECONDS = 30;
const PART4_LOOK_SECONDS = 45;
const CHECK_SECONDS = 30;
const FINAL_CHECK_SECONDS = 120;

type Block = { from: number; to: number; lines: Turn[] };
type Part = { number: number; title: string; intro: string; voices: Record<string, string>; blocks: Block[] };
type Paper = { id: string; title: string; parts: Part[] };
type SourceQuestion = { number: number; type: string; answer: string; evidence: string; options?: { value: string; label: string }[] };

function parsePaper(text: string): Paper {
  const paper: Paper = { id: "", title: "", parts: [] };
  for (const [index, raw] of text.split(/\r?\n/).entries()) {
    const line = raw.trim();
    const part = paper.parts.at(-1);
    const fail = (message: string) => { throw new Error(`${paper.id || "?"} line ${index + 1}: ${message}`); };
    if (!line) continue;
    let match;
    if ((match = line.match(/^# (ESL-L-0\d) \| (.+)$/))) [paper.id, paper.title] = [match[1], match[2]];
    else if ((match = line.match(/^## Part (\d) \| (.+)$/))) paper.parts.push({ number: Number(match[1]), title: match[2], intro: "", voices: {}, blocks: [] });
    else if (!part) fail("text before the first part");
    else if ((match = line.match(/^intro: (.+)$/))) part.intro = match[1];
    else if ((match = line.match(/^voices: (.+)$/))) part.voices = Object.fromEntries(match[1].split(",").map((pair) => pair.trim().split("=").map((item) => item.trim())));
    else if ((match = line.match(/^### (\d+)-(\d+)$/))) part.blocks.push({ from: Number(match[1]), to: Number(match[2]), lines: [] });
    else if ((match = line.match(/^([A-Z][\w .'-]{0,30}): (.+)$/)) && part.blocks.length) part.blocks.at(-1)!.lines.push({ speaker: match[1], text: match[2] });
    else fail(`cannot read "${line.slice(0, 40)}"`);
  }
  return paper;
}

const normalize = (text: string) => text.normalize("NFD").replace(/[̀-ͯ]/g, "").replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .toLowerCase().replace(/\s+/g, " ").trim().replace(/[.\s]+$/, "");
const words = (turns: Turn[]) => turns.reduce((sum, turn) => sum + turn.text.split(/\s+/).length, 0);

// The owner ZIP holds the questions; their evidence sentences must survive the rewrite word for word.
const sources = Object.fromEntries(Object.entries(unzipSync(readFileSync(zipPath), { filter: (entry) => /\/content\/ESL-L-0[1-5]\.json$/.test(entry.name) }))
  .map(([, bytes]) => JSON.parse(strFromU8(bytes)) as { id: string; parts: { questions: SourceQuestion[] }[] }).map((source) => [source.id, source]));
const papers = [1, 2, 3, 4, 5].map((n) => parsePaper(readFileSync(join(scriptDir, `ESL-L-0${n}.txt`), "utf8")));

// questions.json gives every question group its real exam type and rubric, and replaces the questions
// that were rewritten into a new type (map labelling, matching, completion).
type Group = { from: number; to: number; type: string; instructions: string; wordLimit?: string; options?: string[]; media?: string };
type Override = { prompt: string; answer: string; evidence: string };
const questionPlan = JSON.parse(readFileSync(join(scriptDir, "questions.json"), "utf8")) as Record<string, { groups: Group[]; questions: Record<string, Override> }>;
const groupOf = (paperId: string, number: number) => questionPlan[paperId]?.groups.find((group) => number >= group.from && number <= group.to);
/** The question as it will be published: owner question, with the group's type and any rewrite applied. */
function effective(paperId: string, question: SourceQuestion) {
  const override = questionPlan[paperId]?.questions[question.number];
  const group = groupOf(paperId, question.number);
  return { ...question, ...(override ?? {}), type: group?.type ?? question.type, options: override ? undefined : question.options, group, override };
}
const isCompletion = (type: string) => /completion|short[_-]answer/.test(type);
/** Words that count towards an IELTS word limit; one number is allowed on top when the limit says so. */
function withinLimit(answer: string, limit: string) {
  const tokens = answer.split(/\s+/).filter(Boolean);
  const numbers = tokens.filter((token) => /\d/.test(token)).length;
  const maxWords = /ONE WORD/.test(limit) ? 1 : /TWO WORDS/.test(limit) ? 2 : 3;
  const allowNumber = /NUMBER/.test(limit);
  return tokens.length - numbers <= maxWords && (numbers === 0 || (allowNumber && numbers <= 1));
}

const problems: string[] = [];
const report: string[] = [];
for (const paper of papers) {
  const source = sources[paper.id];
  if (!source) { problems.push(`${paper.id}: not in the ZIP`); continue; }
  if (paper.parts.length !== 4) problems.push(`${paper.id}: ${paper.parts.length} parts`);
  for (const [index, part] of paper.parts.entries()) {
    const label = `${paper.id} Part ${part.number}`;
    const expected = part.number === 4 ? [[31, 40]] : [[index * 10 + 1, index * 10 + 6], [index * 10 + 7, index * 10 + 10]];
    if (JSON.stringify(part.blocks.map((block) => [block.from, block.to])) !== JSON.stringify(expected)) problems.push(`${label}: blocks should be ${JSON.stringify(expected)}`);
    if (!part.intro) problems.push(`${label}: missing intro`);
    for (const speaker of new Set(part.blocks.flatMap((block) => block.lines.map((line) => line.speaker)))) if (!part.voices[speaker]) problems.push(`${label}: no voice for ${speaker}`);
    const whole = normalize(part.blocks.flatMap((block) => block.lines.map((line) => line.text)).join(" "));
    let last = -1;
    for (const original of source.parts[index]?.questions ?? []) {
      const question = effective(paper.id, original);
      if (!question.group) { problems.push(`${label} Q${question.number}: no question group`); continue; }
      if (isCompletion(question.type) && !withinLimit(question.answer, question.group.wordLimit ?? "")) problems.push(`${label} Q${question.number}: "${question.answer}" breaks ${question.group.wordLimit ?? "a missing word limit"}`);
      if (/matching|labelling/.test(question.type) && !question.group.options?.some((option) => option === question.answer || option.startsWith(`${question.answer} — `))) problems.push(`${label} Q${question.number}: answer ${question.answer} is not an option`);
      if (question.override && isCompletion(question.type) && !/_{3,}/.test(question.prompt)) problems.push(`${label} Q${question.number}: prompt has no gap`);
      const block = part.blocks.find((item) => question.number >= item.from && question.number <= item.to);
      const evidence = normalize(question.evidence);
      if (!block) { problems.push(`${label} Q${question.number}: no block`); continue; }
      if (!normalize(block.lines.map((line) => line.text).join(" ")).includes(evidence)) { problems.push(`${label} Q${question.number}: evidence not in its block: "${question.evidence}"`); continue; }
      const at = whole.indexOf(evidence);
      if (whole.indexOf(evidence, at + 1) >= 0) problems.push(`${label} Q${question.number}: evidence spoken twice`);
      if (at <= last) problems.push(`${label} Q${question.number}: evidence out of order`);
      last = at;
      if (isCompletion(question.type) && !evidence.includes(normalize(question.answer))) problems.push(`${label} Q${question.number}: answer not in evidence`);
      // Wrong options may be heard as distractors; list where they occur so a person can confirm none reads as the answer.
      for (const option of question.options ?? []) {
        if (option.value === question.answer) continue;
        const phrase = normalize(option.label.replace(/^[A-Z]\.\s*/, "")).replace(/^(a|an|the) /, "");
        if (whole.includes(phrase)) report.push(`${label} Q${question.number}: distractor "${phrase}" is heard`);
      }
    }
    const types = [...new Set((source.parts[index]?.questions ?? []).map((question) => groupOf(paper.id, question.number)?.type))];
    report.push(`${label}: ${part.blocks.map((block) => words(block.lines)).join(" + ")} words · ${types.join(", ")}`);
  }
}
console.log(report.join("\n"));
if (problems.length) { console.error(`\n${problems.length} problem(s):\n${problems.join("\n")}`); process.exit(1); }
console.log("\nAll 200 answers are spoken in order inside their question blocks.");

/** The spoken plan for one part: narrator lines, pauses and dialogue blocks, in order. */
function partPlan(paper: Paper, part: Part) {
  const testNumber = paper.id.slice(-2);
  const kind = part.number === 2 ? "talk" : "conversation";
  const steps: ({ say: string } | { pause: number } | { block: Block })[] = [];
  if (part.number === 1) steps.push({ say: `IELTS with Harry. Original Listening Test ${testNumber}. In this test, you will hear four recordings, and you will answer forty questions. You will hear each recording once only. Before each section, you will have time to read the questions, and after each part, you will have time to check your answers. Now turn to Part 1.` }, { pause: 2 });
  else steps.push({ say: `Now turn to Part ${part.number}.` }, { pause: 1.5 });
  if (part.number === 4) {
    steps.push({ say: `Part 4. You will hear ${part.intro}. You now have ${PART4_LOOK_SECONDS} seconds to look at questions 31 to 40.` }, { pause: PART4_LOOK_SECONDS },
      { say: "Now listen carefully, and answer questions 31 to 40." }, { pause: 1.2 }, { block: part.blocks[0] }, { pause: 2 },
      { say: "That is the end of Part 4. That is the end of the listening test. You now have two minutes to check all of your answers." }, { pause: FINAL_CHECK_SECONDS });
    return steps;
  }
  const [first, second] = part.blocks;
  steps.push({ say: `Part ${part.number}. You will hear ${part.intro}. First, you have ${LOOK_SECONDS} seconds to look at questions ${first.from} to ${first.to}.` }, { pause: LOOK_SECONDS },
    { say: `Now listen carefully, and answer questions ${first.from} to ${first.to}.` }, { pause: 1.2 }, { block: first }, { pause: 2 },
    { say: `Before you hear the rest of the ${kind}, you have ${LOOK_SECONDS} seconds to look at questions ${second.from} to ${second.to}.` }, { pause: LOOK_SECONDS },
    { say: `Now listen, and answer questions ${second.from} to ${second.to}.` }, { pause: 1.2 }, { block: second }, { pause: 2 },
    { say: `That is the end of Part ${part.number}. You now have ${CHECK_SECONDS} seconds to check your answers to Part ${part.number}.` }, { pause: CHECK_SECONDS });
  return steps;
}

const partFile = (paper: Paper, part: Part) => join(outDir, `${paper.id}-P${part.number}.mp3`);

if (args.includes("--voice")) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Missing GEMINI_API_KEY");
  const { Mp3Encoder } = await import(process.env.LAMEJS ? pathToFileURL(process.env.LAMEJS).href : "@breezystack/lamejs");
  mkdirSync(outDir, { recursive: true });
  const models = ttsModels();
  const style = `${defaultStyle}, with British English accents`;
  const narratorStyle = "a calm, neutral British English exam narrator, clear and unhurried";

  async function speak(chunk: Turn[], voices: Record<string, string>, chunkStyle: string) {
    let lastError = "";
    for (let attempt = 0; attempt < 6; attempt += 1) {
      for (const model of models) {
        // A dropped connection is retried like a rate limit instead of ending the whole run.
        const response = await fetch("https://generativelanguage.googleapis.com/v1beta/interactions", {
          method: "POST", headers: { "x-goog-api-key": apiKey!, "Content-Type": "application/json" },
          body: JSON.stringify(ttsRequestBody(chunk, voices, chunkStyle, model)),
        }).catch((error: Error) => { lastError = `network: ${error.cause instanceof Error ? error.cause.message : error.message}`; return null; });
        if (!response) continue;
        const payload = await response.json().catch(() => null) as { steps?: { content?: { type?: string; data?: string }[] }[]; error?: { message?: string } } | null;
        const data = (payload?.steps ?? []).flatMap((step) => step.content ?? []).filter((item) => item.type === "audio" && item.data).pop()?.data;
        if (response.ok && data) return pcmFromAudio(Uint8Array.from(Buffer.from(data, "base64")));
        lastError = payload?.error?.message ?? `HTTP ${response.status}`;
      }
      await new Promise((resolve) => setTimeout(resolve, 15000 * (attempt + 1)));
    }
    throw new Error(`TTS failed: ${lastError}`);
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
    return { bytes: Buffer.concat(chunks), seconds: samples.length / TTS_SAMPLE_RATE };
  }

  for (const paper of papers) {
    for (const part of paper.parts) {
      const target = partFile(paper, part);
      if (existsSync(target)) continue;
      const pcm: Uint8Array[] = [];
      let requests = 0;
      for (const step of partPlan(paper, part)) {
        if ("pause" in step) pcm.push(silence(step.pause));
        else if ("say" in step) { pcm.push(await speak([{ speaker: "Narrator", text: step.say }], { Narrator: NARRATOR_VOICE }, narratorStyle)); requests += 1; }
        else for (const [index, chunk] of chunkTurns(step.block.lines, 1800).entries()) {
          if (index) pcm.push(silence(0.4));
          pcm.push(await speak(chunk, part.voices, style));
          requests += 1;
        }
      }
      const { bytes, seconds } = mp3(pcm);
      writeFileSync(target, bytes);
      console.log(`${paper.id} Part ${part.number}: ${(seconds / 60).toFixed(1)} min, ${requests} requests`);
    }
    // CBR MP3 frames concatenate cleanly, so the whole paper is the four parts back to back.
    const files = paper.parts.map((part) => partFile(paper, part));
    if (files.every((file) => existsSync(file))) writeFileSync(join(outDir, `${paper.id}-full.mp3`), Buffer.concat(files.map((file) => readFileSync(file))));
  }
}

if (args.includes("--publish")) {
  const apply = args.includes("--apply");
  const { createClient } = await import("@supabase/supabase-js");
  const { contentHash, contentSchema, validateExam } = await import("../src/lib/ielts-bank/schema.ts");
  const note = "Full-length exam audio: longer scripts, narrator rubric, reading and checking pauses (owner request 2026-10-27).";
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
  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const ok = <T,>(result: { data: T; error: { message: string } | null }, context: string) => {
    if (result.error) throw new Error(`${context}: ${result.error.message}`);
    return result.data;
  };
  const actor = (ok(await db.from("admin_users").select("user_id").order("granted_at").limit(1), "admin user") as { user_id: string }[])[0]?.user_id;
  if (!actor) throw new Error("No admin user to record as reviewer");

  // MP3 length from its size: 64 kbps CBR is 8000 bytes per second.
  const minutesOf = (file: string) => readFileSync(file).byteLength / 8000 / 60;
  type Exam = { id: string; external_id: string; title: string; skill: "Listening"; format: string; mode: string; duration_minutes: number; source_url: string; license: string; license_url: string; attribution: string; ai_generated: boolean; current_version_id: string; published_version_id: string };
  const plans = [];
  // --only ESL-L-01,ESL-L-02 publishes just those papers (the rest may still be waiting for audio).
  const only = args.includes("--only") ? args[args.indexOf("--only") + 1].split(",") : null;
  for (const paper of papers.filter((item) => !only || only.includes(item.id))) {
    const exam = ok(await db.from("ielts_exams").select("id,external_id,title,skill,format,mode,duration_minutes,source_url,license,license_url,attribution,ai_generated,current_version_id,published_version_id")
      .like("external_id", `ESL-PILOT-2026-%${paper.id}`).single(), `${paper.id} exam`) as Exam;
    if (exam.current_version_id !== exam.published_version_id) throw new Error(`${paper.id}: has unpublished edits; review them first`);
    const version = ok(await db.from("ielts_exam_versions").select("id,revision,upstream_version,content").eq("id", exam.current_version_id).single(), `${paper.id} version`) as { id: string; revision: number; upstream_version: string; content: unknown };
    const content = contentSchema.parse(version.content);
    if (content.sections.length !== 4) throw new Error(`${paper.id}: expected 4 sections`);
    const files = paper.parts.map((part) => partFile(paper, part));
    const missing = files.filter((file) => !existsSync(file));
    if (missing.length) throw new Error(`${paper.id}: missing ${missing.join(", ")}; run --voice first`);
    const minutes = files.reduce((sum, file) => sum + minutesOf(file), 0);
    // The attempt is auto-submitted when duration_minutes runs out, so the timer must outlast the recording.
    const duration = Math.ceil(minutes) + 1;
    plans.push({ paper, exam, version, content, files, minutes, duration });
  }
  console.log(JSON.stringify({ mode: apply ? "apply" : "dry run", papers: plans.map(({ paper, exam, version, minutes, duration }) => `${paper.id} → ${exam.external_id} revision ${version.revision + 1}: audio ${minutes.toFixed(1)} min, timer ${exam.duration_minutes} → ${duration} min`) }, null, 1));
  if (!apply) process.exit(0);

  const { default: sharp } = await import("sharp");
  for (const { paper, exam, version, content, files, duration } of plans) {
    const sourceQuestions = sources[paper.id].parts.flatMap((part) => part.questions);
    for (const [index, section] of content.sections.entries()) {
      const path = `original-tests/full/${section.id}.mp3`;
      ok(await db.storage.from("ielts-audio").upload(path, readFileSync(files[index]), { contentType: "audio/mpeg", upsert: true }), `upload ${path}`);
      section.audioUrl = db.storage.from("ielts-audio").getPublicUrl(path).data.publicUrl;
      section.transcript = paper.parts[index].blocks.flatMap((block) => block.lines.map((line) => `${line.speaker}: ${line.text}`)).join("\n");
      for (const question of section.questions) {
        const source = sourceQuestions.find((item) => item.number === question.number);
        if (!source) throw new Error(`${paper.id} Q${question.number}: not in the ZIP`);
        const { group, override, evidence } = effective(paper.id, source);
        if (!group) throw new Error(`${paper.id} Q${question.number}: no question group`);
        question.type = group.type;
        question.instructions = group.instructions;
        if (group.wordLimit) question.wordLimit = group.wordLimit;
        else delete question.wordLimit;
        if (group.options) question.options = group.options;
        if (group.media) {
          // Maps are drawn as SVG in the repo and published as PNG (the image bucket takes raster files only).
          const mediaPath = `original-tests/${group.media.replace(/\.svg$/, ".png")}`;
          const png = await sharp(join(scriptDir, group.media), { density: 144 }).png().toBuffer();
          ok(await db.storage.from("ielts-images").upload(mediaPath, png, { contentType: "image/png", upsert: true }), `upload ${mediaPath}`);
          question.mediaUrl = db.storage.from("ielts-images").getPublicUrl(mediaPath).data.publicUrl;
        }
        if (override) {
          question.prompt = override.prompt;
          question.answers = [override.answer];
          question.explanation = `${/matching|labelling/.test(group.type) ? "Listen for the description that matches this item; the other letters describe different places or details." : "The answer is stated directly in the recording."}\n\nEvidence: ${evidence}`;
        }
      }
    }
    const parsed = contentSchema.parse(content);
    const warnings = validateExam({
      externalId: exam.external_id, skill: exam.skill, format: exam.format, mode: exam.mode, title: exam.title, durationMinutes: duration,
      sourceUrl: exam.source_url, attribution: exam.attribution, license: exam.license, licenseUrl: exam.license_url, aiGenerated: exam.ai_generated,
      upstreamVersion: version.upstream_version, content: parsed,
    });
    if (warnings.length) throw new Error(`${paper.id}: validation warnings ${warnings.join(", ")}`);
    const row = ok(await db.from("ielts_exam_versions").insert({ exam_id: exam.id, revision: version.revision + 1, upstream_version: version.upstream_version, content_hash: contentHash(parsed), content: parsed, warnings }).select("id").single(), `${paper.id} revision`) as { id: string };
    ok(await db.from("ielts_exams").update({ current_version_id: row.id, duration_minutes: duration, status: "ready", updated_at: new Date().toISOString() }).eq("id", exam.id).eq("current_version_id", version.id).select("id").single(), `${paper.id} ready`);
    ok(await db.from("ielts_review_log").insert([
      { exam_id: exam.id, version_id: row.id, actor_id: actor, action: "edit", note },
      { exam_id: exam.id, version_id: row.id, actor_id: actor, action: "ready", note },
    ]), `${paper.id} review log`);
    ok(await db.from("ielts_exams").update({ status: "published", published_version_id: row.id, updated_at: new Date().toISOString() }).eq("id", exam.id).select("id").single(), `${paper.id} publish`);
    ok(await db.from("ielts_review_log").insert({ exam_id: exam.id, version_id: row.id, actor_id: actor, action: "publish", note }), `${paper.id} publish log`);
    console.log(`${paper.id}: published revision ${version.revision + 1}, timer ${duration} min`);
  }
}
