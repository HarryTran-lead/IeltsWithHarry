export const highlightColors = ["sun", "mint", "rose"] as const;
export type HighlightColor = (typeof highlightColors)[number];
/** A highlighted character range inside one paragraph of a passage. */
export type Highlight = { id: string; p: number; start: number; end: number; color: HighlightColor };
export type Segment = { text: string; start: number; highlight?: Highlight };
export type HighlightCache = { updatedAt: string; highlights: Highlight[] };

/** Adds a highlight, trimming or splitting the ones it overlaps so ranges in a paragraph never overlap. */
export function addHighlight(list: Highlight[], next: Highlight): Highlight[] {
  const kept: Highlight[] = [];
  for (const item of list) {
    if (item.p !== next.p || item.end <= next.start || item.start >= next.end) { kept.push(item); continue; }
    if (item.start < next.start) kept.push({ ...item, end: next.start });
    if (item.end > next.end) kept.push({ ...item, id: `${item.id}-r`, start: next.end });
  }
  return [...kept, next].sort((a, b) => a.p - b.p || a.start - b.start);
}

/** Splits a paragraph into plain and highlighted runs, in order. */
export function segments(text: string, paragraph: number, list: Highlight[]): Segment[] {
  const own = list.filter((item) => item.p === paragraph && item.start < item.end && item.end <= text.length).sort((a, b) => a.start - b.start);
  const out: Segment[] = [];
  let cursor = 0;
  for (const item of own) {
    if (item.start < cursor) continue;
    if (item.start > cursor) out.push({ text: text.slice(cursor, item.start), start: cursor });
    out.push({ text: text.slice(item.start, item.end), start: item.start, highlight: item });
    cursor = item.end;
  }
  if (cursor < text.length) out.push({ text: text.slice(cursor), start: cursor });
  return out;
}

/** Reads stored highlights, dropping anything malformed or outside the current paragraphs. */
export function parseHighlights(raw: string | null, paragraphs: string[]): Highlight[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    if (!Array.isArray(value)) return [];
    return value.filter((item): item is Highlight => {
      if (!item || typeof item !== "object") return false;
      const { id, p, start, end, color } = item as Record<string, unknown>;
      return typeof id === "string" && Number.isInteger(p) && Number.isInteger(start) && Number.isInteger(end)
        && highlightColors.includes(color as HighlightColor) && (p as number) >= 0 && (p as number) < paragraphs.length
        && (start as number) >= 0 && (start as number) < (end as number) && (end as number) <= paragraphs[p as number].length;
    });
  } catch {
    return [];
  }
}

/** Local copy is scoped to an account. The timestamp lets a pending offline edit win over an older server copy. */
export function parseHighlightCache(raw: string | null, paragraphs: string[]): HighlightCache {
  if (!raw) return { updatedAt: "", highlights: [] };
  try {
    const value: unknown = JSON.parse(raw);
    if (!value || typeof value !== "object" || Array.isArray(value)) return { updatedAt: "", highlights: [] };
    const cache = value as Record<string, unknown>;
    return {
      updatedAt: typeof cache.updatedAt === "string" && !Number.isNaN(Date.parse(cache.updatedAt)) ? cache.updatedAt : "",
      highlights: parseHighlights(JSON.stringify(cache.highlights), paragraphs),
    };
  } catch {
    return { updatedAt: "", highlights: [] };
  }
}

/** Shrinks a range so it neither starts nor ends on whitespace. */
export function trimRange(text: string, start: number, end: number): [number, number] {
  while (start < end && /\s/.test(text[start])) start++;
  while (end > start && /\s/.test(text[end - 1])) end--;
  return [start, end];
}
