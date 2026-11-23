import { segments, type Highlight, type Segment } from "@/lib/highlights";

/** Render a visible slice while retaining its offsets in the saved question text. */
export function questionHighlightSlice(source: string, start: number, end: number, highlights: Highlight[], paragraph = 0): Segment[] {
  if (start < 0 || end > source.length || start >= end) return [];
  return segments(source, paragraph, highlights).flatMap((part) => {
    const from = Math.max(start, part.start);
    const to = Math.min(end, part.start + part.text.length);
    return from < to ? [{ text: source.slice(from, to), start: from, highlight: part.highlight }] : [];
  });
}
