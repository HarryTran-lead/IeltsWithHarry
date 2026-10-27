export type Cue = { start: number; end: number; text: string };
export type VideoQuestion = { prompt: string; options: string[]; answer: number };
export type VideoLesson = { id: string; title: string; youtube_id: string; cefr: string; topic: string; transcript: Cue[]; questions: VideoQuestion[]; rights_source: string; rights_license: string; published: boolean };

export function youtubeId(input: string): string | null {
  try {
    const url = new URL(input.trim());
    if (url.protocol !== "https:") return null;
    const host = url.hostname.toLowerCase();
    const id = host === "youtu.be" ? url.pathname.slice(1) :
      ["youtube.com", "www.youtube.com", "m.youtube.com"].includes(host) ?
        url.pathname === "/watch" ? url.searchParams.get("v") : url.pathname.startsWith("/shorts/") || url.pathname.startsWith("/embed/") ? url.pathname.split("/")[2] : null : null;
    return id && /^[A-Za-z0-9_-]{11}$/.test(id) ? id : null;
  } catch { return null; }
}

function timestamp(value: string): number | null {
  const match = /^(?:(\d{1,2}):)?([0-5]?\d):([0-5]\d)[,.](\d{3})$/.exec(value.trim());
  if (!match) return null;
  return Number(match[1] ?? 0) * 3600 + Number(match[2]) * 60 + Number(match[3]) + Number(match[4]) / 1000;
}

/** Import only a transcript whose rights were checked by an administrator. */
export function parseCaptions(input: string): Cue[] {
  const normalized = input.replace(/^\uFEFF/, "").replace(/\r\n?/g, "\n").trim();
  if (!normalized || normalized.length > 400_000) throw new Error("Subtitle file is empty or too large (400 KB maximum).");
  const blocks = normalized.replace(/^WEBVTT[^\n]*\n/, "").split(/\n\s*\n/);
  const cues: Cue[] = [];
  for (const block of blocks) {
    const lines = block.split("\n").map((line) => line.trim()).filter(Boolean);
    if (!lines.length || lines[0].startsWith("NOTE") || lines[0].startsWith("STYLE")) continue;
    const index = lines.findIndex((line) => line.includes(" --> "));
    if (index < 0 || index > 1) throw new Error(`Invalid cue near: ${lines[0].slice(0, 40)}`);
    const times = lines[index].split(/\s+-->\s+/);
    const start = timestamp(times[0]);
    const end = timestamp(times[1]?.split(/\s+/)[0] ?? "");
    const text = lines.slice(index + 1).join(" ").replace(/<[^>]*>/g, "").trim();
    if (start === null || end === null || end <= start || !text || text.length > 800 || (cues.length && start < cues[cues.length - 1].end)) throw new Error(`Invalid or overlapping cue near: ${lines[0].slice(0, 40)}`);
    cues.push({ start, end, text });
  }
  if (!cues.length || cues.length > 3000) throw new Error("The subtitle file must contain 1–3000 timed cues.");
  return cues;
}

export function validateQuestions(value: string): VideoQuestion[] {
  const rows = JSON.parse(value) as unknown;
  if (!Array.isArray(rows) || rows.length > 50) throw new Error("Questions must be a JSON array of at most 50 items.");
  return rows.map((row) => {
    if (!row || typeof row !== "object") throw new Error("Invalid question.");
    const q = row as Record<string, unknown>;
    if (typeof q.prompt !== "string" || !q.prompt.trim() || !Array.isArray(q.options) || q.options.length < 2 || q.options.length > 5 || q.options.some((option) => typeof option !== "string" || !option.trim()) || !Number.isInteger(q.answer) || Number(q.answer) < 0 || Number(q.answer) >= q.options.length) throw new Error("Each question needs a prompt, 2–5 options and a zero-based answer index.");
    return { prompt: q.prompt.trim(), options: q.options as string[], answer: Number(q.answer) };
  });
}

export function wordDifferences(expected: string, actual: string): { word: string; kind: "correct" | "missing" | "incorrect" }[] {
  const words = (text: string) => text.toLowerCase().match(/[\p{L}\p{N}']+/gu) ?? [];
  const target = words(expected), typed = words(actual);
  const dp = Array.from({ length: target.length + 1 }, () => Array<number>(typed.length + 1).fill(0));
  for (let i = target.length - 1; i >= 0; i--) for (let j = typed.length - 1; j >= 0; j--) dp[i][j] = target[i] === typed[j] ? 1 + dp[i + 1][j + 1] : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const result: { word: string; kind: "correct" | "missing" | "incorrect" }[] = [];
  let i = 0, j = 0;
  while (i < target.length || j < typed.length) {
    if (i < target.length && j < typed.length && target[i] === typed[j]) { result.push({ word: target[i++], kind: "correct" }); j++; }
    else if (j < typed.length && (i === target.length || dp[i][j + 1] >= dp[i + 1][j])) result.push({ word: typed[j++], kind: "incorrect" });
    else result.push({ word: target[i++], kind: "missing" });
  }
  return result;
}
