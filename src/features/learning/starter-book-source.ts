import u01 from "../../../content/ielts-starter-4-5-supplement/units/U01/unit.json";
import u02 from "../../../content/ielts-starter-4-5-supplement/units/U02/unit.json";
import u03 from "../../../content/ielts-starter-4-5-supplement/units/U03/unit.json";
import u04 from "../../../content/ielts-starter-4-5-supplement/units/U04/unit.json";
import u05 from "../../../content/ielts-starter-4-5-supplement/units/U05/unit.json";
import u06 from "../../../content/ielts-starter-4-5-supplement/units/U06/unit.json";
import u07 from "../../../content/ielts-starter-4-5-supplement/units/U07/unit.json";
import u08 from "../../../content/ielts-starter-4-5-supplement/units/U08/unit.json";
import overview from "../../data/ielts-starter-supplement.json";

export type SourceItem = {
  id?: string; question?: string; question_en?: string; question_vi?: string;
  answer?: string; options?: string[]; explanation_en?: string; explanation_vi?: string;
  open?: boolean; answer_type?: string;
};
export type SourceGroup = {
  id: string; skill: string; title: string; instruction_en?: string; instruction_vi?: string;
  items: SourceItem[]; diagram_id?: string; map_id?: string; visual?: string;
};
export type SourcePage = {
  kind: "source-detail"; unitIndex: number; lessonIndex: number;
  lessonId: string; title: string; subtitle?: string; groupId?: string;
  type: "passage" | "audio" | "visual" | "model" | "group" | "vocabulary" | "technique" | "notes" | "bundle";
  paragraphs?: string[]; audioUrl?: string; imageUrl?: string; items?: SourceItem[];
  itemStart?: number;
  words?: [string, string][]; steps?: string[]; visual?: Record<string, unknown>;
  leadNote?: string;
  extraVisuals?: { visual: Record<string, unknown>; imageUrl?: string }[];
  sections?: SourcePage[];
};

type Source = Record<string, unknown> & { activities: SourceGroup[] };
const sources = [u01, u02, u03, u04, u05, u06, u07, u08] as unknown as Source[];
const skillCode: Record<string, string> = { Reading: "R", Listening: "L", Writing: "W", Speaking: "S" };
const assetPaths = [
  [], [],
  ["U03_chart-pie.png", "U03_chart-line.png", "U03_chart-final.png", "U03_chart-bar.png"],
  ["U04_pie-takeaway.png", "U04_exam-chart.png", "U04_bar-stores.png", "U04_bar-cafes.png"],
  [],
  ["U06_map-park.png", "U06_map-building.png"],
  ["U07_Flowchart_A.png", "U07_Flowchart_C.png", "U07_Flowchart_D.png", "U07_Flowchart_E.png"],
  [],
];

function entries(value: unknown): [string, Record<string, unknown>][] {
  return value && typeof value === "object" && !Array.isArray(value) ? Object.entries(value as Record<string, Record<string, unknown>>) : [];
}
function chunk<T>(items: T[], size: number): T[][] {
  return Array.from({ length: Math.ceil(items.length / size) }, (_, index) => items.slice(index * size, (index + 1) * size));
}
function prose(value: unknown): string[] {
  return typeof value === "string" ? value.split(/\n\s*\n|\n/).map((part) => part.trim()).filter(Boolean) : [];
}
function sourceText(value: Record<string, unknown>): string[] {
  if (typeof value.text === "string") return prose(value.text);
  if (Array.isArray(value.paragraphs)) return value.paragraphs.map((p: { id?: string; text: string }) => `${p.id ? `[${p.id}] ` : ""}${p.text}`);
  if (typeof value.transcript === "string") return prose(value.transcript);
  if (typeof value.script === "string") return prose(value.script);
  if (Array.isArray(value.dialogue)) return value.dialogue.map((line: [string, string]) => `${line[0]}: ${line[1]}`);
  return [];
}
function addText(pages: SourcePage[], base: Omit<SourcePage, "kind" | "paragraphs">, paragraphs: string[], perPage: number) {
  chunk(paragraphs, perPage).forEach((part, index) => pages.push({ ...base, kind: "source-detail", title: index ? `${base.title} · tiếp` : base.title, paragraphs: part }));
}

function visualForGroup(source: Source, group: SourceGroup): Record<string, unknown> | undefined {
  const id = group.diagram_id ?? group.map_id ?? group.visual?.split("+")[0];
  if (!id) return undefined;
  return Object.fromEntries([...entries(source.process_diagrams), ...entries(source.maps), ...entries(source.visuals)])[id];
}

function imageForVisual(unitId: string, id: string): string | undefined {
  const unit = Number(unitId.slice(1));
  const name = unit === 3 ? { "chart-pie": "U03_chart-pie.png", "chart-line": "U03_chart-line.png", "chart-final": "U03_chart-final.png", "chart-bar": "U03_chart-bar.png" }[id] : unit === 4 ? { "pie-takeaway": "U04_pie-takeaway.png", "exam-chart": "U04_exam-chart.png", "bar-stores": "U04_bar-stores.png", "bar-cafes": "U04_bar-cafes.png" }[id] : undefined;
  return name ? `/starter-supplement/${unitId}/assets/${name}` : undefined;
}

/** Place small neighbouring exercises together; each section retains its own practice link. */
function packShortPages(pages: SourcePage[]): SourcePage[] {
  const result: SourcePage[] = [];
  let queue: SourcePage[] = [];
  let weight = 0;
  let category = "";
  const flush = () => {
    if (!queue.length) return;
    result.push(queue.length === 1 ? queue[0] : { ...queue[0], type: "bundle", title: queue.map((part) => part.title).join(" · "), sections: queue });
    queue = []; weight = 0; category = "";
  };
  for (const page of pages) {
    const categoryOfPage = page.type === "group" && !page.visual && !page.imageUrl && (page.items?.length ?? 0) <= 4 ? "group"
      : page.type === "audio" && (page.paragraphs?.length ?? 0) <= 12 ? "audio"
      : page.type === "passage" && (page.paragraphs?.length ?? 0) <= 2 ? "passage" : "";
    const cost = categoryOfPage === "group" ? (page.items?.length ?? 0) * 2 + 2 : categoryOfPage === "audio" ? page.paragraphs?.length ?? 0 : (page.paragraphs?.join(" ").length ?? 0) / 60;
    const limit = categoryOfPage === "group" ? 14 : categoryOfPage === "audio" ? 20 : 12;
    if (!categoryOfPage || (queue.length && (category !== categoryOfPage || weight + cost > limit || queue.length >= (category === "group" ? 3 : 2)))) flush();
    if (categoryOfPage) { queue.push(page); weight += cost; category = categoryOfPage; }
    else result.push(page);
  }
  flush();
  return result;
}

/** Every authored item has a printed page. The original 2-page lesson spread stays in place. */
export function starterPagesForLesson(unitIndex: number, lessonIndex: number, lessonId: string, skill: string): SourcePage[] {
  const source = sources[unitIndex];
  if (!source) return [];
  const pages: SourcePage[] = [];
  const base = { unitIndex, lessonIndex, lessonId };
  const unitId = `U${String(unitIndex + 1).padStart(2, "0")}`;
  const examNote = source.exam_skills && typeof source.exam_skills === "object" ? (source.exam_skills as Record<string, string>)[skillCode[skill]] : undefined;
  if (examNote) pages.push({ ...base, kind: "source-detail", type: "notes", title: `Kỹ năng thi ${skill}`, paragraphs: [examNote] });
  const addEntries = (value: unknown, type: SourcePage["type"], perPage: number, urls?: Map<string, string>) => {
    entries(value).forEach(([id, item]) => addText(pages, { ...base, type, title: String(item.title ?? `${skill} ${id}`), subtitle: [id, item.subtitle_vi, item.note].filter(Boolean).join(" · "), audioUrl: urls?.get(String(item.title)) }, sourceText(item), perPage));
  };

  if (skill === "Reading") {
    addEntries(source.passages, "passage", 5);
    const outcomes = source.reading_learning_outcomes;
    if (Array.isArray(outcomes) && outcomes.length) pages.push({ ...base, kind: "source-detail", type: "notes", title: "Mục tiêu đọc hiểu", paragraphs: outcomes.map(String) });
  }
  if (skill === "Listening") {
    const tracks = entries(source.tracks ?? source.listening);
    const files = (overview.units[unitIndex]?.tracks ?? []) as { title: string; url: string }[];
    const urls = new Map(files.map((file) => [file.title, file.url]));
    tracks.forEach(([id, item]) => {
      const title = String(item.title ?? `Track ${id}`);
      addText(pages, { ...base, type: "audio", title, subtitle: id, audioUrl: urls.get(title) }, sourceText(item), 24);
    });
  }
  if (skill === "Writing") {
    for (const [id, item] of [...entries(source.process_diagrams), ...entries(source.maps).filter(([key]) => !key.startsWith("S-")), ...entries(source.visuals)]) {
      pages.push({ ...base, kind: "source-detail", type: "visual", title: String(item.title ?? id), subtitle: id, visual: item, imageUrl: imageForVisual(unitId, id) });
    }
    for (const file of assetPaths[unitIndex] ?? []) pages.push({ ...base, kind: "source-detail", type: "visual", title: file.replace(/\.png$/i, "").replace(/[_-]/g, " "), imageUrl: `/starter-supplement/${unitId}/assets/${file}` });
    const models = Array.isArray(source.writing_models) ? source.writing_models as Record<string, unknown>[] : [];
    models.forEach((model, index) => {
      const title = String(model.title ?? `Bài mẫu Writing ${index + 1}`);
      addText(pages, { ...base, type: "model", title, subtitle: typeof model.question === "string" ? model.question : undefined }, sourceText(model), 3);
      if (index === 0 && (unitIndex === 2 || unitIndex === 3)) {
        const id = unitIndex === 2 ? "chart-final" : "pie-takeaway";
        const diagram = Object.fromEntries(entries(source.visuals))[id];
        const modelPage = pages.find((page) => page.type === "model" && page.title === title);
        if (modelPage && diagram) { modelPage.visual = diagram; modelPage.imageUrl = imageForVisual(unitId, id); }
      }
      if (typeof model.vi === "string") addText(pages, { ...base, type: "model", title: `${title} · tiếng Việt` }, prose(model.vi), 3);
    });
    if (typeof source.model_writing_task1 === "string") {
      addText(pages, { ...base, type: "model", title: "Bài mẫu Writing Task 1", visual: Object.fromEntries(entries(source.process_diagrams))["W-B"] }, prose(source.model_writing_task1), 3);
    }
    if (typeof source.writing_task1_model_en === "string") addText(pages, { ...base, type: "model", title: "Bài mẫu Writing Task 1", subtitle: typeof source.writing_task1_model_vi === "string" ? source.writing_task1_model_vi : undefined, visual: Object.fromEntries(entries(source.maps))["W-B"] }, prose(source.writing_task1_model_en), 3);
    if (typeof source.writing_task1_model_vi === "string") addText(pages, { ...base, type: "model", title: "Bài mẫu Writing Task 1 · tiếng Việt" }, prose(source.writing_task1_model_vi), 3);
  }
  if (skill === "Speaking") {
    for (const [id, item] of entries(source.maps).filter(([key]) => key.startsWith("S-"))) pages.push({ ...base, kind: "source-detail", type: "visual", title: String(item.title ?? id), subtitle: id, visual: item });
    const models = Array.isArray(source.speaking_models) ? source.speaking_models as Record<string, unknown>[] : [];
    models.forEach((model, index) => {
      const title = String(model.title ?? `Bài mẫu Speaking ${index + 1}`);
      addText(pages, { ...base, type: "model", title, subtitle: typeof model.cue === "string" ? model.cue : undefined }, sourceText(model), 3);
      if (typeof model.vi === "string") addText(pages, { ...base, type: "model", title: `${title} · tiếng Việt` }, prose(model.vi), 3);
    });
  }
  if (skill === "Vocabulary" && Array.isArray(source.vocabulary)) {
    chunk(source.vocabulary as [string, string][], 14).forEach((words, index) => pages.push({ ...base, kind: "source-detail", type: "vocabulary", title: `Từ vựng · ${index * 14 + 1}–${index * 14 + words.length}`, words }));
  }
  if (skill === "Grammar" && Array.isArray(source.techniques)) {
    chunk(source.techniques as [string, string, string][], 3).forEach((techniques, index) => pages.push({ ...base, kind: "source-detail", type: "technique", title: `Chiến lược học · ${index + 1}`, steps: techniques.map(([title, en, vi]) => `${title}\n${en}\n${vi}`) }));
  }
  const groups = source.activities.filter((group) => group.skill === skillCode[skill]);
  for (const group of groups) chunk(group.items, 7).forEach((items, index) => pages.push({ ...base, kind: "source-detail", type: "group", title: index ? `${group.title} · tiếp` : group.title, subtitle: [group.instruction_en, group.instruction_vi].filter(Boolean).join(" · "), groupId: group.id, items, itemStart: index * 7 + 1, visual: visualForGroup(source, group), imageUrl: imageForVisual(unitId, group.visual?.split("+")[0] ?? ""), extraVisuals: group.visual?.includes("+") ? group.visual.split("+").slice(1).map((ref) => ({ visual: Object.fromEntries(entries(source.visuals))[ref], imageUrl: imageForVisual(unitId, ref) })).filter((entry) => entry.visual) : undefined }));
  // The exam tip belongs with the first passage or track, instead of occupying a page by itself.
  if (pages[0]?.type === "notes" && pages[1] && !pages[1].visual && !pages[1].imageUrl) {
    pages[1] = { ...pages[1], leadNote: pages[0].paragraphs?.join(" ") };
    pages.shift();
  }
  return packShortPages(pages);
}

export function starterSourceTotals() {
  return { groups: sources.reduce((sum, unit) => sum + unit.activities.length, 0), items: sources.reduce((sum, unit) => sum + unit.activities.reduce((n, group) => n + group.items.length, 0), 0) };
}

/** The previous printed edition's page count, used only to move saved positions into this layout. */
export function starterPageCountV2(unitIndex: number, skill: string): number {
  const source = sources[unitIndex];
  if (!source) return 0;
  const textCount = (value: unknown, size: number) => Math.ceil((typeof value === "string" ? prose(value) : sourceText(value as Record<string, unknown>)).length / size);
  let count = source.exam_skills && typeof source.exam_skills === "object" && (source.exam_skills as Record<string, string>)[skillCode[skill]] ? 1 : 0;
  if (skill === "Reading") count += entries(source.passages).reduce((sum, [, item]) => sum + textCount(item, 2), 0) + (Array.isArray(source.reading_learning_outcomes) && source.reading_learning_outcomes.length ? 1 : 0);
  if (skill === "Listening") count += entries(source.tracks ?? source.listening).reduce((sum, [, item]) => sum + textCount(item, 10), 0);
  if (skill === "Writing") {
    count += entries(source.process_diagrams).length + entries(source.maps).filter(([id]) => !id.startsWith("S-")).length + entries(source.visuals).length + (assetPaths[unitIndex]?.length ?? 0);
    for (const model of (source.writing_models ?? []) as Record<string, unknown>[]) count += textCount(model, 3) + (typeof model.vi === "string" ? textCount(model.vi, 3) : 0);
    for (const value of [source.model_writing_task1, source.writing_task1_model_en, source.writing_task1_model_vi]) if (typeof value === "string") count += textCount(value, 3);
  }
  if (skill === "Speaking") {
    count += entries(source.maps).filter(([id]) => id.startsWith("S-")).length;
    for (const model of (source.speaking_models ?? []) as Record<string, unknown>[]) count += textCount(model, 3) + (typeof model.vi === "string" ? textCount(model.vi, 3) : 0);
  }
  if (skill === "Vocabulary" && Array.isArray(source.vocabulary)) count += Math.ceil(source.vocabulary.length / 14);
  if (skill === "Grammar" && Array.isArray(source.techniques)) count += Math.ceil(source.techniques.length / 3);
  count += source.activities.filter((group) => group.skill === skillCode[skill]).reduce((sum, group) => sum + Math.ceil(group.items.length / 4), 0);
  return count;
}
