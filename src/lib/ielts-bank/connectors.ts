import { validateExam, type ExamQuestion, type NormalizedExam } from "./schema";

type SourceId = "bandready" | "ielts-ai-dataset";
type TreeEntry = { path: string; type: string; size?: number };
type SourceConfig = { owner: string; repo: string; branch: string; license: string; licenseUrl: string; attribution: string };
export const sources: Record<SourceId, SourceConfig> = {
  bandready: { owner: "Luxshan2000", repo: "ielts-prep", branch: "main", license: "CC0-1.0", licenseUrl: "https://creativecommons.org/publicdomain/zero/1.0/", attribution: "BandReady Core" },
  "ielts-ai-dataset": { owner: "LuchoBazz", repo: "ielts-ai-dataset", branch: "main", license: "CC-BY-4.0", licenseUrl: "https://creativecommons.org/licenses/by/4.0/", attribution: "IELTS AI Dataset by LuchoBazz (AI-generated)" },
};
const asObject = (v: unknown): Record<string, unknown> => v && typeof v === "object" && !Array.isArray(v) ? v as Record<string, unknown> : {};
const arr = (v: unknown): unknown[] => Array.isArray(v) ? v : [];
const str = (v: unknown): string => typeof v === "string" || typeof v === "number" ? String(v) : "";
const answers = (v: unknown): string[] => arr(v).map((value) => str(typeof value === "object" ? asObject(value).text ?? asObject(value).value : value)).filter(Boolean);
const fileUrl = (s: SourceConfig, path: string) => `https://github.com/${s.owner}/${s.repo}/blob/${s.branch}/${path}`;

async function fetchText(url: string, timeout = 15000): Promise<string> {
  const parsed = new URL(url);
  if (parsed.protocol !== "https:" || !["api.github.com", "raw.githubusercontent.com"].includes(parsed.hostname)) throw new Error("Source host blocked");
  const response = await fetch(url, { signal: AbortSignal.timeout(timeout), headers: { "User-Agent": "English-Skill-Lab-Importer", Accept: "application/vnd.github+json" }, cache: "no-store" });
  if (!response.ok) throw new Error(`Source HTTP ${response.status}`);
  const size = Number(response.headers.get("content-length") ?? 0);
  if (size > 5_000_000) throw new Error("Source file too large");
  const text = await response.text();
  if (text.length > 5_000_000) throw new Error("Source file too large");
  return text;
}

export interface SourceConnector {
  checkAvailability(): Promise<boolean>;
  fetchManifest(): Promise<{ version: string; paths: string[] }>;
  fetchChanges(cursor?: string | null): Promise<{ version: string; paths: string[] }>;
  downloadContent(path: string, version?: string): Promise<string>;
  parseContent(path: string, raw: string): unknown[];
  normalizeContent(path: string, data: unknown, version: string): NormalizedExam[];
  validateContent(exam: NormalizedExam): string[];
  sync(cursor?: string | null): Promise<{ version: string; exams: NormalizedExam[] }>;
}

function aiQuestions(groups: unknown[], prefix: string): ExamQuestion[] {
  const result: ExamQuestion[] = [];
  for (const item of groups) {
    const group = asObject(item);
    const groupQuestions = arr(group.questions);
    const sharedPrompt = groupQuestions.some((v) => !str(asObject(v).text)) ? str(asObject(groupQuestions.find((v) => str(asObject(v).text))).text) : "";
    for (const [questionIndex, raw] of groupQuestions.entries()) {
      const q = asObject(raw);
      const prompt = str(q.text) || sharedPrompt;
      const displayedPrompt = sharedPrompt ? `${prompt}\n[Blank ${questionIndex + 1}]` : prompt;
      const gaps = arr(q.completion_gaps).map(asObject).filter((gap) => str(gap.answer));
      const direct = str(q.answer);
      const base = { type: str(group.question_type) || "short-answer", instructions: str(group.instructions), options: arr(q.options).map((v) => typeof v === "object" ? `${str(asObject(v).key || asObject(v).label)} — ${str(asObject(v).text)}` : str(v)).filter(Boolean), explanation: str(q.explanation), wordLimit: str(group.word_limit) || undefined };
      if (gaps.length) gaps.forEach((gap, i) => result.push({ ...base, id: `${prefix}:${str(q.id)}:${str(gap.id) || i}`, number: Number(q.question_order) || result.length + 1, prompt: `${displayedPrompt} — ${str(gap.gap_text)}`, answers: [str(gap.answer)] }));
      else if (direct) result.push({ ...base, id: `${prefix}:${str(q.id)}`, number: Number(q.question_order) || result.length + 1, prompt: displayedPrompt, answers: [direct, ...answers(q.accepted_answers)].filter((v, i, all) => all.indexOf(v) === i) });
      else if (!arr(q.completion_gaps).length) result.push({ ...base, id: `${prefix}:${str(q.id)}`, number: Number(q.question_order) || result.length + 1, prompt: displayedPrompt, answers: [] });
    }
  }
  return result;
}

function bandQuestions(groups: unknown[], prefix: string): ExamQuestion[] {
  return groups.flatMap((item) => {
    const group = asObject(item);
    return arr(group.questions).map((raw) => {
      const q = asObject(raw);
      return { id: `${prefix}:${str(group.id)}:${str(q.number)}`, number: Number(q.number) || 1, type: str(group.type), prompt: str(q.prompt), instructions: str(group.instructions_extra), options: arr(q.options || group.options).map((v) => typeof v === "object" ? `${str(asObject(v).key)} — ${str(asObject(v).text)}` : str(v)), answers: arr(q.answers).map((v) => str(asObject(v).value || v)).filter(Boolean), explanation: str(q.explanation), wordLimit: str(group.word_limit) || undefined, mediaReference: str(asObject(group.layout).image) || undefined };
    });
  });
}

export function normalizeSource(sourceId: SourceId, path: string, data: unknown, version: string): NormalizedExam[] {
  const s = sources[sourceId], row = asObject(data);
  if (row.license && row.license !== s.license) throw new Error(`Unapproved item license: ${str(row.license)}`);
  const base = { sourceUrl: fileUrl(s, path), attribution: s.attribution, license: s.license, licenseUrl: s.licenseUrl, aiGenerated: sourceId === "ielts-ai-dataset", upstreamVersion: version, format: str(row.test_type || row.format) || "Academic", mode: path.includes("synthetic-official-mocks") ? "synthetic_mock" : "practice", difficulty: str(row.difficulty || row.band_target), durationMinutes: Number.parseInt(str(row.duration), 10) || 20 };
  if (sourceId === "ielts-ai-dataset") {
    if (path.endsWith("/manifest.json")) {
      const sections = arr(row.sections).map((item, i) => { const section = asObject(item); return { id: str(section.id) || `${i}`, title: str(section.title) || `Part ${i+1}`, passage: "", transcript: str(section.transcript), questions: aiQuestions(arr(section.question_groups), str(section.id) || `${i}`) }; });
      const complete = sections.length === 4 && sections.reduce((n, s) => n + s.questions.length, 0) === 40;
      return [{ ...base, mode: complete && path.includes("synthetic-official-mocks") ? "synthetic_mock" : "practice", externalId: str(row.id) || path, skill: "Listening", title: str(row.title) || path, content: { sections, prompt: "" } }];
    }
    if (path.includes("/reading/")) {
      const sections = arr(row.passages).map((item, i) => { const p = asObject(item); return { id: str(p.id) || `${i}`, title: str(p.title) || `Passage ${i+1}`, passage: str(p.content), transcript: "", questions: aiQuestions(arr(p.question_groups || p.groups), str(p.id) || `${i}`) }; });
      const complete = sections.length === 3 && sections.reduce((n, s) => n + s.questions.length, 0) === 40;
      return [{ ...base, mode: complete && path.includes("synthetic-official-mocks") ? "synthetic_mock" : "practice", externalId: str(row.id) || path, skill: "Reading", title: str(row.title) || path, content: { sections, prompt: "" } }];
    }
    if (path.includes("/writing/")) return arr(row.tasks).map((item, i) => { const task = asObject(item); return { ...base, mode: "practice", externalId: str(task.id) || `${path}:${i}`, skill: "Writing" as const, title: str(task.title) || `${str(row.title)} Task ${i+1}`, durationMinutes: Number.parseInt(str(task.suggested_time), 10) || (i ? 40 : 20), content: { sections: [], prompt: str(task.prompt), taskType: str(task.task_type), minimumWords: Number(task.min_words) || undefined, figureDescription: str(task.figure_description) || undefined, mediaReference: str(task.image_url) || undefined } }; });
  }
  if (path.endsWith("reading_passages.jsonl")) {
    const passage = asObject(row.passage_json);
    const text = arr(passage.texts).flatMap((t) => arr(asObject(t).paragraphs).map((p) => str(asObject(p).text))).join("\n\n");
    const section = { id: str(row.id), title: str(row.title), passage: text, transcript: "", questions: bandQuestions(arr(passage.question_groups), str(row.id)) };
    return [{ ...base, externalId: str(row.id), skill: "Reading", title: str(row.title), topic: str(row.topic_id), content: { sections: [section], prompt: "" } }];
  }
  if (path.endsWith("listening_scripts.jsonl")) {
    const script = asObject(row.script_json);
    const transcript = arr(script.lines).map((v) => `${str(asObject(v).speaker)}: ${str(asObject(v).text)}`).join("\n");
    const questions = arr(script.questions).map((v) => { const q = asObject(v); return { id: `${str(row.id)}:${str(q.n)}`, number: Number(q.n) || 1, type: str(q.type), prompt: str(q.prompt), instructions: str(q.instruction), options: Object.entries(asObject(q.options)).map(([key, value]) => `${key} — ${str(value)}`), answers: arr(q.answers).flatMap((a) => Array.isArray(a) ? a.map(str) : [str(a)]).filter(Boolean), explanation: str(q.explanation) }; });
    return [{ ...base, externalId: str(row.id), skill: "Listening", title: str(row.title), topic: str(row.topic_id), content: { sections: [{ id: str(row.id), title: str(row.title), passage: "", transcript, questions }], prompt: "" } }];
  }
  if (path.endsWith("writing_prompts.jsonl")) return [{ ...base, externalId: str(row.id), skill: "Writing", title: str(row.id).replaceAll("_", " "), topic: str(row.topic_id), durationMinutes: str(row.task_type).includes("task1") ? 20 : 40, content: { sections: [], prompt: str(row.prompt_text), taskType: str(row.task_type), minimumWords: str(row.task_type).includes("task1") ? 150 : 250, visual: row.chart_spec || undefined } }];
  if (path.endsWith("speaking_cards.jsonl")) {
    const p = asObject(row.payload_json), part = Number(row.part) || 1;
    const questionTexts = part === 2 ? [str(asObject(p.cue_card).topic), ...arr(asObject(p.cue_card).bullets).map(str)] : part === 3 ? arr(p.part3_themes).flatMap((v) => arr(asObject(v).questions).map(str)) : arr(p.questions).map(str);
    return [{ ...base, externalId: str(row.id), skill: "Speaking", title: str(row.title), topic: str(row.topic_id), durationMinutes: part === 2 ? 3 : part === 1 ? 4 : 5, content: { sections: [{ id: str(row.id), title: `Part ${part}`, passage: "", transcript: "", questions: questionTexts.map((prompt, i) => ({ id: `${str(row.id)}:${i}`, number: i+1, type: "speaking", prompt, instructions: "", options: [], answers: [], explanation: "" })) }], prompt: str(row.title), speakingPart: part } }];
  }
  return [];
}

export function createConnector(sourceId: SourceId): SourceConnector {
  const s = sources[sourceId];
  const selected = (path: string) => sourceId === "bandready" ? /^content\/core-en\/data\/(reading_passages|listening_scripts|writing_prompts|speaking_cards)\.jsonl$/.test(path) : /^datasets\/(practice-drills|synthetic-official-mocks)\/(reading|writing)\/[^/]+\.json$/.test(path) || /^datasets\/(practice-drills|synthetic-official-mocks)\/listening\/[^/]+\/manifest\.json$/.test(path);
  return {
    async checkAvailability() { try { await this.fetchManifest(); return true; } catch { return false; } },
    async fetchManifest() {
      const repo = JSON.parse(await fetchText(`https://api.github.com/repos/${s.owner}/${s.repo}/branches/${s.branch}`));
      const version = str(repo.commit?.sha);
      if (!/^[a-f0-9]{40}$/.test(version)) throw new Error("Invalid upstream commit");
      if (sourceId === "bandready") {
        const pack = JSON.parse(await fetchText(`https://raw.githubusercontent.com/${s.owner}/${s.repo}/${version}/content/core-en/manifest.json`));
        if (pack.license !== s.license) throw new Error("BandReady pack license changed; review required");
      } else {
        const license = await fetchText(`https://raw.githubusercontent.com/${s.owner}/${s.repo}/${version}/LICENSE`);
        if (!license.startsWith("Creative Commons Attribution 4.0 International Public License")) throw new Error("Dataset license changed; review required");
      }
      const tree = JSON.parse(await fetchText(`https://api.github.com/repos/${s.owner}/${s.repo}/git/trees/${version}?recursive=1`));
      if (tree.truncated) throw new Error("Source tree truncated");
      const paths = (tree.tree as TreeEntry[]).filter((e) => e.type === "blob" && selected(e.path) && (e.size ?? 0) < 5_000_000).map((e) => e.path);
      return { version, paths };
    },
    async fetchChanges(cursor) { const m = await this.fetchManifest(); return cursor === m.version ? { ...m, paths: [] } : m; },
    downloadContent(path, version) { if (!selected(path)) throw new Error("Unsupported source path"); return fetchText(`https://raw.githubusercontent.com/${s.owner}/${s.repo}/${version || s.branch}/${path}`); },
    parseContent(path, raw) { return path.endsWith(".jsonl") ? raw.split(/\r?\n/).map((line, index) => ({ line, index })).filter(({ line }) => line.trim() && !line.startsWith("//")).map(({ line, index }) => { try { return JSON.parse(line); } catch (error) { return { __parseError: String(error), __line: index + 1 }; } }) : [JSON.parse(raw)]; },
    normalizeContent(path, data, version) { return normalizeSource(sourceId, path, data, version); },
    validateContent(exam) { return validateExam(exam); },
    async sync(cursor) { const manifest = await this.fetchChanges(cursor); const exams: NormalizedExam[] = []; for (const path of manifest.paths) for (const row of this.parseContent(path, await this.downloadContent(path, manifest.version))) { if (asObject(row).__parseError) throw new Error(`Malformed JSONL ${path}:${asObject(row).__line}`); exams.push(...this.normalizeContent(path, row, manifest.version)); } return { version: manifest.version, exams }; },
  };
}
export type { SourceId };
