import type { SupabaseClient } from "@supabase/supabase-js";
import { AiArtLimitError, generateAiArt } from "./news/ai-art";
import { topicIllustration, wordIllustration } from "./topic-illustration";

const DEFAULT_SUPABASE_URL = "https://vpkhriywprepuhrbarye.supabase.co";
const BUCKET = "ielts-images";

function supabaseBaseUrl(): string {
  const envUrl = typeof process !== "undefined" ? process.env.NEXT_PUBLIC_SUPABASE_URL?.trim() : "";
  return (envUrl || DEFAULT_SUPABASE_URL).replace(/\/+$/, "");
}

export type CourseBookArtFolder = "units" | "lessons" | "exercises" | "themes";

export function courseBookStorageUrl(folder: CourseBookArtFolder, slug: string): string {
  return `${supabaseBaseUrl()}/storage/v1/object/public/${BUCKET}/course-book/${folder}/${slug}.jpg`;
}

export function isCourseBookAiUrl(url: string | undefined | null): boolean {
  return Boolean(url && url.includes(`/storage/v1/object/public/${BUCKET}/course-book/`));
}

export function inferUnitSlugFromLesson(lessonSlug?: string | null): string | null {
  if (!lessonSlug) return null;
  const stripped = lessonSlug.replace(/-(?:vocabulary|grammar|listening|reading|writing|speaking)(?:-\d+)?$/i, "");
  return stripped !== lessonSlug ? stripped : null;
}

const ADVANCED_UNIT_RULES: [RegExp, string][] = [
  [/urban\s+and\s+rural|đô\s+thị\s+và\s+nông\s+thôn|\bl3u01\b/i, "mindsetadvanced-l3u01"],
  [/\bhealth\b|sức\s+khỏe\s+cộng\s+đồng|\bl3u02\b/i, "mindsetadvanced-l3u02"],
  [/art\s+and\s+architecture|nghệ\s+thuật\s+và\s+kiến\s+trúc|\bl3u03\b/i, "mindsetadvanced-l3u03"],
  [/finance\s+and\s+business|tài\s+chính\s+và\s+kinh\s+doanh|\bl3u04\b/i, "mindsetadvanced-l3u04"],
  [/\bhistory\b|lịch\s+sử\s+và\s+tư\s+liệu|\bl3u05\b/i, "mindsetadvanced-l3u05"],
  [/science\s+and\s+technology|khoa\s+học\s+và\s+công\s+nghệ|\bl3u06\b/i, "mindsetadvanced-l3u06"],
  [/television,?\s+news|truyền\s+hình,?\s+tin\s+tức|\bl3u07\b/i, "mindsetadvanced-l3u07"],
  [/\bculture\b|văn\s+hóa\s+và\s+bản\s+sắc|\bl3u08\b/i, "mindsetadvanced-l3u08"],
];

function inferSkillSuffix(text: string): string | null {
  if (/·\s*vocabulary|\bvocabulary\s*&\s*pronunciation/i.test(text)) return "vocabulary";
  if (/·\s*grammar|\bgrammar\s*&\s*academic/i.test(text)) return "grammar";
  if (/·\s*listening|\blistening:/i.test(text)) return "listening";
  if (/·\s*reading|\breading:/i.test(text)) return "reading";
  if (/·\s*(?:academic\s+)?writing|\bwriting\s+task/i.test(text)) return "writing";
  if (/·\s*speaking|\bspeaking\s+part/i.test(text)) return "speaking";
  return null;
}

export function inferBookSlugsFromTopic(topic: string): { unitSlug: string | null; lessonSlug: string | null } {
  const unitSlug = ADVANCED_UNIT_RULES.find(([pattern]) => pattern.test(topic))?.[1] ?? null;
  if (!unitSlug) return { unitSlug: null, lessonSlug: null };
  const skill = inferSkillSuffix(topic);
  return { unitSlug, lessonSlug: skill ? `${unitSlug}-${skill}` : null };
}

export type CourseBookArtOptions = {
  topic: string;
  word?: string;
  unitSlug?: string | null;
  lessonSlug?: string | null;
  imageUrl?: string | null;
  variant?: "unit" | "lesson" | "exercise";
};

export function courseBookArtCandidates(options: CourseBookArtOptions): string[] {
  const { topic, word, imageUrl, variant } = options;
  const art = word ? wordIllustration(word, topic) : topicIllustration(topic);
  const fallbackSvg = art.src;
  if (word) return [fallbackSvg];
  const inferred = inferBookSlugsFromTopic(topic);
  const lessonSlug = options.lessonSlug || inferred.lessonSlug;
  const unitSlug = options.unitSlug || inferUnitSlugFromLesson(lessonSlug) || inferred.unitSlug;
  const effectiveVariant = variant ?? (lessonSlug ? "lesson" : unitSlug ? "unit" : undefined);

  const candidates: string[] = [];
  const push = (url?: string | null) => {
    if (url && !candidates.includes(url)) candidates.push(url);
  };

  if (imageUrl) push(imageUrl);

  if (effectiveVariant === "exercise") {
    if (lessonSlug) {
      push(courseBookStorageUrl("exercises", lessonSlug));
      push(courseBookStorageUrl("lessons", lessonSlug));
    }
    if (unitSlug) push(courseBookStorageUrl("units", unitSlug));
    if (inferred.unitSlug && inferred.unitSlug !== unitSlug) {
      push(courseBookStorageUrl("units", inferred.unitSlug));
    }
  } else if (effectiveVariant === "lesson") {
    if (lessonSlug) push(courseBookStorageUrl("lessons", lessonSlug));
    if (unitSlug) push(courseBookStorageUrl("units", unitSlug));
    if (inferred.unitSlug && inferred.unitSlug !== unitSlug) {
      push(courseBookStorageUrl("units", inferred.unitSlug));
    }
  } else if (effectiveVariant === "unit") {
    if (unitSlug) push(courseBookStorageUrl("units", unitSlug));
    if (inferred.unitSlug && inferred.unitSlug !== unitSlug) {
      push(courseBookStorageUrl("units", inferred.unitSlug));
    }
  }

  push(courseBookStorageUrl("themes", art.theme));
  push(fallbackSvg);
  return candidates;
}

export const VOCAB_THEME_SCENES: Record<string, string> = {
  art: "Fine arts and architecture: a sunlit art studio and contemporary museum gallery with paintings, sculptures, easel, and classical architectural arches",
  history: "World history and heritage: an ancient civilization archaeological site, historical archive manuscripts, antique compass, and museum artifacts",
  business: "Business, work and careers: a modern collaborative office, financial district skyline, startup team meeting table, and sustainable commerce",
  shopping: "Shopping, consumer market and fashion: a lively boutique street market, artisan clothing display, eco-friendly packaging, and retail promenade",
  health: "Health, medicine and wellbeing: a bright community wellness center, fresh organic produce, stethoscope, and people exercising in a green park",
  food: "Food, nutrition and culinary culture: a warm farm-to-table kitchen and vibrant market table with fresh vegetables, fruits, grains, and artisan bread",
  travel: "Travel, tourism and transport: a scenic high-speed train, airport terminal overlooking mountains and coast, vintage suitcase, and world travel route",
  city: "Urban life and modern city: a vibrant sustainable city square with green tramways, bike lanes, historic and modern buildings, and lively street cafes",
  home: "Home, housing and family life: a cozy sunlit modern living room and garden terrace with bookshelves, plants, and warm residential architecture",
  education: "Education, university and knowledge: a sunlit university library and modern seminar classroom with books, globe, laptops, and campus courtyard",
  science: "Science, research and data: a modern scientific research laboratory with microscopes, glassware, botanical specimens, and astronomical telescope",
  technology: "Digital technology and innovation: a futuristic innovation lab with robotics, clean energy circuits, smart devices, and fiber-optic light streams",
  nature: "Nature, environment and climate: a breathtaking diverse ecosystem with lush forest, crystal river, mountain peaks, wildlife, and renewable wind turbines",
  media: "Media, news and communication: a modern broadcast television studio, journalism newsroom desk, documentary camera, and global communication satellites",
  culture: "World culture, festivals and traditions: a colorful cultural heritage square with traditional lanterns, musical instruments, crafts, and historic pavilion",
  hobbies: "Hobbies, leisure, sports and music: an acoustic guitar, easel, running track, camera, and outdoor recreation in a sunny park",
  time: "Time, schedule and daily routine: a classic brass clock, morning coffee desk with planner notebook, hourglass, and changing seasons outside a window",
  people: "People, psychology, society and community: a warm community gathering in a sunlit courtyard, diverse neighbors conversing, and social connection",
  goals: "Goals, future plans and ambition: a mountain summit trail at sunrise, compass, architectural blueprint, and stepping stones toward a bright horizon",
  language: "Language, linguistics and communication: an open illustrated book with floating visual motifs, fountain pen, headphones, and library study desk",
  general: "Academic English learning and global discovery: a warm study desk overlooking a world cityscape with open books, globe, fountain pen, and notebook",
};

export function buildThemeArtPrompt(theme: string): string {
  const scene = VOCAB_THEME_SCENES[theme] ?? VOCAB_THEME_SCENES.general;
  return [
    `Editorial coursebook illustration for English vocabulary topic "${theme}": ${scene}.`,
    `Rich modern digital painting, warm natural light, clean composition.`,
    `No text, no letters, no words, no numbers, no logos, no watermark.`,
  ].join(" ");
}

export const ADVANCED_UNIT_SCENES: Record<string, string> = {
  "mindsetadvanced-l3u01": "Urban and rural life contrast: a modern sustainable city tramway and skyline connected by a bridge to a scenic green countryside village and farmland",
  "mindsetadvanced-l3u02": "Public health and community wellbeing: a sunny green city park with joggers, cyclists, fresh fruit market stall, and a modern community clinic",
  "mindsetadvanced-l3u03": "Art and architecture: a restored historic brick heritage building blended with a contemporary glass museum atrium and outdoor sculpture courtyard",
  "mindsetadvanced-l3u04": "Finance and business prosperity: a vibrant sustainable business district, artisan workshop, and modern collaborative office with green terraces",
  "mindsetadvanced-l3u05": "History and archives: a grand sunlit historical archive and museum gallery with ancient maps, manuscripts, artifacts, and glass display cases",
  "mindsetadvanced-l3u06": "Science and technology innovation: a modern research laboratory and smart classroom with robotics, renewable energy models, and optical instruments",
  "mindsetadvanced-l3u07": "Television, news and current affairs: a modern broadcast newsroom studio with cameras, world map screens, documentary editing desk, and field reporters",
  "mindsetadvanced-l3u08": "Culture and heritage identity: an international cultural festival square and museum pavilion with traditional lanterns, crafts, music, and architecture",
};

export function cleanUnitTheme(unitTitle: string): string {
  return unitTitle.replace(/^Unit \d+\s*·\s*/i, "").replace(/\s*\([^)]*\)\s*$/, "").trim();
}

export function buildUnitArtPrompt(unit: { slug: string; title: string }): string {
  const theme = cleanUnitTheme(unit.title);
  const scene = ADVANCED_UNIT_SCENES[unit.slug] ?? theme;
  return [
    `Editorial coursebook chapter opener illustration for "${theme}": ${scene}.`,
    `Rich modern digital painting, warm natural light, wide scenic composition.`,
    `No text, no letters, no logos, no watermark.`,
  ].join(" ");
}

export function buildLessonArtPrompt(
  unit: { slug: string; title: string },
  lesson: { slug: string; title: string; skill: string },
  content: Record<string, unknown> = {},
): string {
  const theme = cleanUnitTheme(unit.title);
  const vocab = (Array.isArray(content.vocabulary) ? content.vocabulary : Array.isArray(content.expansion_words) ? content.expansion_words : []) as { en?: string }[];
  const examples = Array.isArray(content.examples) ? (content.examples as string[]) : [];
  const audios = Array.isArray(content.audios) ? (content.audios as { title?: string }[]) : [];
  const passages = Array.isArray(content.passages) ? (content.passages as { title?: string }[]) : [];
  const questions = Array.isArray(content.questions) ? (content.questions as (string | { prompt?: string })[]) : [];
  const advancedEssay = content.advanced_essay as { prompt?: string } | undefined;

  let detail = "";
  if (lesson.skill === "Vocabulary") {
    const words = vocab.slice(0, 4).map((w) => w.en).filter(Boolean).join(", ");
    detail = `visualizing concepts of ${words || theme} in a real-world ${theme.toLowerCase()} setting`;
  } else if (lesson.skill === "Grammar") {
    const grammarTitle = typeof content.grammar_title === "string" ? content.grammar_title : "comparison and evaluation";
    detail = `academic analysis scene illustrating "${grammarTitle}" in the context of ${theme.toLowerCase()}: ${(examples[0] ?? "").slice(0, 90)}`;
  } else if (lesson.skill === "Listening") {
    const audioTitle = (audios[0]?.title || lesson.title).replace(/^Listening:\s*/i, "");
    detail = `scene of "${audioTitle}" (${theme.toLowerCase()}), people in a realistic briefing, studio, or field discussion`;
  } else if (lesson.skill === "Reading") {
    const passageTitle = (typeof content.passage_title === "string" && content.passage_title) || passages[0]?.title || lesson.title;
    detail = `editorial magazine scene for article "${passageTitle}" (${theme.toLowerCase()})`;
  } else if (lesson.skill === "Writing") {
    const rawTask = (typeof content.task === "string" && content.task) || advancedEssay?.prompt || "";
    const task = rawTask.replace(/^IELTS Academic Writing Task \d\.\s*/i, "").slice(0, 110);
    detail = `editorial scene illustrating ${task || theme}`;
  } else if (lesson.skill === "Speaking") {
    const prompts = questions.map((item) => (typeof item === "string" ? item : item.prompt ?? "")).filter(Boolean);
    const q = prompts[2] || prompts[0] || theme;
    detail = `two articulate people having an engaging conversation in a cozy study lounge about: ${q.slice(0, 100)}`;
  } else {
    detail = `scene illustrating ${lesson.title} in ${theme.toLowerCase()}`;
  }

  return [
    `Editorial coursebook illustration for an IELTS Band 6-7 lesson on ${theme}: ${detail}.`,
    `Show the concrete scene, environment and objects, warm modern digital painting, rich details, soft natural lighting.`,
    `No text, no letters, no words, no numbers, no charts with labels, no logos, no watermark.`,
  ].join(" ");
}

export function buildExerciseArtPrompt(
  unit: { slug: string; title: string },
  lesson: { slug: string; title: string; skill: string },
  content: Record<string, unknown> = {},
): string {
  const theme = cleanUnitTheme(unit.title);
  const vocab = (Array.isArray(content.vocabulary) ? content.vocabulary : Array.isArray(content.expansion_words) ? content.expansion_words : []) as { en?: string; example?: string }[];
  const examples = Array.isArray(content.examples) ? (content.examples as string[]) : [];
  const activities = Array.isArray(content.activities) ? (content.activities as { prompt?: string }[]) : [];
  const audios = Array.isArray(content.audios) ? (content.audios as { title?: string }[]) : [];
  const passages = Array.isArray(content.passages) ? (content.passages as { title?: string }[]) : [];
  const speakingExt = Array.isArray(content.speaking_extensions) ? (content.speaking_extensions as { question?: string }[]) : [];
  const advancedEssay = content.advanced_essay as { prompt?: string } | undefined;

  let detail = "";
  if (lesson.skill === "Vocabulary") {
    const words = vocab.slice(4, 9).map((w) => w.en).filter(Boolean).join(", ");
    const ex = vocab[1]?.example ?? "";
    detail = `interactive practice scene showing ${words || theme} in action (${ex.slice(0, 80)})`;
  } else if (lesson.skill === "Grammar") {
    const ex = examples[1] || activities[0]?.prompt || "";
    detail = `real-world scenario for grammar practice in ${theme.toLowerCase()}: ${ex.slice(0, 100)}`;
  } else if (lesson.skill === "Listening") {
    const audio2 = audios[1]?.title || audios[0]?.title || "field recording";
    detail = `field investigation and audio recording scenario for "${audio2}" in ${theme.toLowerCase()}`;
  } else if (lesson.skill === "Reading") {
    const passage2 = passages[1]?.title || passages[2]?.title || (typeof content.passage_title === "string" ? content.passage_title : theme);
    detail = `detailed documentary illustration for reading passage "${passage2}" in ${theme.toLowerCase()}`;
  } else if (lesson.skill === "Writing") {
    const essay = advancedEssay?.prompt || (typeof content.task === "string" ? content.task : theme);
    detail = `thought-provoking editorial illustration for essay topic: ${essay.slice(0, 110)}`;
  } else if (lesson.skill === "Speaking") {
    const ext = speakingExt[0]?.question || "discussing future trends";
    detail = `seminar roundtable discussion scene exploring: ${ext.slice(0, 100)} (${theme.toLowerCase()})`;
  } else {
    detail = `practice scenario for ${lesson.title} in ${theme.toLowerCase()}`;
  }

  return [
    `Vivid workbook exercise illustration for ${theme} (${lesson.skill} practice): ${detail}.`,
    `Show a clear, expressive scene with concrete objects and architecture, modern editorial painting style, natural daylight.`,
    `No text, no letters, no captions, no numbers, no logos, no watermark.`,
  ].join(" ");
}

export async function enrichCourseBookArt(client: SupabaseClient, maxSlots = 1): Promise<{ generated: number }> {
  const { data: courses } = await client.from("courses").select("id,slug,stage_id").eq("stage_id", "ielts-advanced").limit(1);
  const course = courses?.[0];
  if (!course) return { generated: 0 };

  const { data: units } = await client.from("units").select("id,slug,title,sort_order").eq("course_id", course.id).order("sort_order");
  if (!units?.length) return { generated: 0 };

  const [unitFiles, lessonFiles, exerciseFiles, themeFiles] = await Promise.all([
    client.storage.from(BUCKET).list("course-book/units", { limit: 200 }),
    client.storage.from(BUCKET).list("course-book/lessons", { limit: 200 }),
    client.storage.from(BUCKET).list("course-book/exercises", { limit: 200 }),
    client.storage.from(BUCKET).list("course-book/themes", { limit: 100 }),
  ]);
  const hasUnit = new Set((unitFiles.data ?? []).map((f) => f.name));
  const hasLesson = new Set((lessonFiles.data ?? []).map((f) => f.name));
  const hasExercise = new Set((exerciseFiles.data ?? []).map((f) => f.name));
  const hasTheme = new Set((themeFiles.data ?? []).map((f) => f.name));

  let generated = 0;

  for (const unit of units) {
    if (generated >= maxSlots) break;
    const fileName = `${unit.slug}.jpg`;
    if (hasUnit.has(fileName)) continue;
    try {
      const art = await generateAiArt(buildUnitArtPrompt(unit), cleanUnitTheme(unit.title), `unit:${unit.slug}`);
      const path = `course-book/units/${fileName}`;
      const { error } = await client.storage.from(BUCKET).upload(path, art.bytes, { contentType: art.contentType, upsert: true, cacheControl: "31536000" });
      if (!error) generated++;
    } catch (error) {
      if (error instanceof AiArtLimitError) return { generated };
    }
  }
  if (generated >= maxSlots) return { generated };

  for (const theme of Object.keys(VOCAB_THEME_SCENES)) {
    if (generated >= maxSlots) break;
    const fileName = `${theme}.jpg`;
    if (hasTheme.has(fileName)) continue;
    try {
      const art = await generateAiArt(buildThemeArtPrompt(theme), theme, `theme:${theme}`);
      const path = `course-book/themes/${fileName}`;
      const { error } = await client.storage.from(BUCKET).upload(path, art.bytes, { contentType: art.contentType, upsert: true, cacheControl: "31536000" });
      if (!error) generated++;
    } catch (error) {
      if (error instanceof AiArtLimitError) return { generated };
    }
  }
  if (generated >= maxSlots) return { generated };

  const { data: lessons } = await client
    .from("lessons")
    .select("id,unit_id,slug,title,skill,sort_order")
    .in("unit_id", units.map((u) => u.id))
    .order("sort_order");
  if (!lessons?.length) return { generated };

  const { data: pkgRows } = await client
    .from("package_lesson_content")
    .select("lesson_id,content")
    .in("lesson_id", lessons.map((l) => l.id));
  const pkgMap = new Map((pkgRows ?? []).map((row) => [row.lesson_id, (row.content ?? {}) as Record<string, unknown>]));
  const unitMap = new Map(units.map((u) => [u.id, u]));

  for (const lesson of lessons) {
    if (generated >= maxSlots) break;
    const unit = unitMap.get(lesson.unit_id);
    if (!unit) continue;
    const content = pkgMap.get(lesson.id) ?? {};
    const fileName = `${lesson.slug}.jpg`;

    if (!hasLesson.has(fileName)) {
      try {
        const art = await generateAiArt(buildLessonArtPrompt(unit, lesson, content), cleanUnitTheme(unit.title), `lesson:${lesson.slug}`);
        const path = `course-book/lessons/${fileName}`;
        const { error } = await client.storage.from(BUCKET).upload(path, art.bytes, { contentType: art.contentType, upsert: true, cacheControl: "31536000" });
        if (!error) {
          const publicUrl = client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
          content.image_url = publicUrl;
          await client.from("package_lesson_content").update({ content, updated_at: new Date().toISOString() }).eq("lesson_id", lesson.id);
          generated++;
        }
      } catch (error) {
        if (error instanceof AiArtLimitError) return { generated };
      }
    }
    if (generated >= maxSlots) break;

    if (!hasExercise.has(fileName)) {
      try {
        const art = await generateAiArt(buildExerciseArtPrompt(unit, lesson, content), cleanUnitTheme(unit.title), `exercise:${lesson.slug}`);
        const path = `course-book/exercises/${fileName}`;
        const { error } = await client.storage.from(BUCKET).upload(path, art.bytes, { contentType: art.contentType, upsert: true, cacheControl: "31536000" });
        if (!error) {
          const publicUrl = client.storage.from(BUCKET).getPublicUrl(path).data.publicUrl;
          content.exercise_image_url = publicUrl;
          await client.from("package_lesson_content").update({ content, updated_at: new Date().toISOString() }).eq("lesson_id", lesson.id);
          generated++;
        }
      } catch (error) {
        if (error instanceof AiArtLimitError) return { generated };
      }
    }
  }
  return { generated };
}
