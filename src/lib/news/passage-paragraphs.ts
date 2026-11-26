/**
 * Feed articles often put every sentence or list item in its own paragraph. IELTS passages have about
 * 9–15 paragraphs of 60–100 words (Cambridge 15–18), and the reader, translation pairs and paragraph
 * matching questions all label paragraphs from the stored text. New articles are therefore stored with
 * short paragraphs joined into passage-sized ones. Only line breaks change, plus "; " between list items
 * that are folded into their lead-in sentence and the removal of paragraphs repeated word for word.
 */
export const PARAGRAPH_MIN_WORDS = 70;
export const PARAGRAPH_MAX_WORDS = 140;
/** The passage map labels at most twelve paragraphs (A–L). */
export const MAX_PARAGRAPHS = 12;

const wordCount = (text: string) => text.match(/[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*/gu)?.length ?? 0;
const endsSentence = (text: string) => /[.!?…]["'”’)\]]*$/.test(text);

/** A short line with no closing punctuation that starts with a capital: a subheading, kept on its own. */
function isHeading(block: string, next: string | undefined) {
  return Boolean(next) && wordCount(block) <= 10 && !endsSentence(block) && !/[:;,]$/.test(block) && /^\p{Lu}/u.test(block);
}

/** An item of a list introduced by a line ending in ":": short, and starting in lower case, a digit or a bullet. */
function isListItem(block: string) {
  return wordCount(block) <= 45 && /^[\p{Ll}\d•\-–]/u.test(block);
}

type Unit = { text: string; heading: boolean };

function units(text: string): Unit[] {
  const blocks = text.replace(/\r\n?/g, "\n").split(/\n\s*\n/)
    .map((block) => block.split("\n").map((line) => line.trim()).filter(Boolean).join(" ").trim())
    .filter(Boolean)
    // Some page extractions repeat a paragraph word for word; the copy is dropped.
    .filter((block, index, all) => wordCount(block) < 12 || all.indexOf(block) === index);
  const out: Unit[] = [];
  for (let index = 0; index < blocks.length; index++) {
    let block = blocks[index];
    if (block.endsWith(":")) {
      // Fold the list that follows into its lead-in sentence.
      const items: string[] = [];
      while (index + 1 < blocks.length && isListItem(blocks[index + 1])) items.push(blocks[++index].replace(/^[•\-–]\s*/, "").replace(/[;,]$/, ""));
      if (items.length) {
        const last = items.length - 1;
        items[last] = endsSentence(items[last]) ? items[last] : `${items[last]}.`;
        block = `${block} ${items.join("; ")}`;
      }
    }
    out.push({ text: block, heading: isHeading(block, blocks[index + 1]) });
  }
  return out;
}

/** Joins short paragraphs into passage-sized ones; subheadings stay on their own line. */
export function mergeShortParagraphs(text: string, min = PARAGRAPH_MIN_WORDS, max = PARAGRAPH_MAX_WORDS): string {
  const paragraphs: { text: string; heading: boolean }[] = [];
  let current: string[] = [];
  const flush = () => { if (current.length) paragraphs.push({ text: current.join(" "), heading: false }); current = []; };
  for (const unit of units(text)) {
    if (unit.heading) { flush(); paragraphs.push(unit); continue; }
    const size = wordCount(current.join(" "));
    // A speaker's lead-in ("X, Director at Y, said:") starts a new paragraph rather than ending the last one.
    const leadIn = /[:,]$/.test(unit.text) && wordCount(unit.text) <= 25;
    if (current.length && (size >= min || (leadIn && size >= min / 2))) flush();
    else if (current.length && size + wordCount(unit.text) > max) flush();
    current.push(unit.text);
  }
  flush();
  // A short closing paragraph joins the one before it.
  const lastIndex = paragraphs.length - 1;
  if (lastIndex > 0 && !paragraphs[lastIndex].heading && !paragraphs[lastIndex - 1].heading
    && wordCount(paragraphs[lastIndex].text) < min / 2) {
    paragraphs[lastIndex - 1].text += ` ${paragraphs[lastIndex].text}`;
    paragraphs.pop();
  }
  // Long articles keep the passage within the twelve paragraph labels by joining the shortest neighbours.
  const body = () => paragraphs.filter((paragraph) => !paragraph.heading);
  while (body().length > MAX_PARAGRAPHS) {
    let best = -1; let bestSize = Infinity;
    for (let index = 0; index < paragraphs.length - 1; index++) {
      if (paragraphs[index].heading || paragraphs[index + 1].heading) continue;
      const size = wordCount(paragraphs[index].text) + wordCount(paragraphs[index + 1].text);
      if (size < bestSize) { best = index; bestSize = size; }
    }
    if (best < 0) break;
    paragraphs[best].text += ` ${paragraphs[best + 1].text}`;
    paragraphs.splice(best + 1, 1);
  }
  return paragraphs.map((paragraph) => paragraph.text).join("\n\n");
}
