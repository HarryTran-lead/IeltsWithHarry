import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";

// Copies authored/public catalog data from production into the isolated dev project.
// There are deliberately no auth, profile, attempt, progress, chat, or admin tables here.
const SOURCE_REF = "vpkhriywprepuhrbarye";
const TARGET_REF = "bhactqaxcvusmpeooxwi";
const apply = process.argv.includes("--apply");
const sourceUrl = process.env.IELTS_CONTENT_SOURCE_URL;
const targetUrl = process.env.IELTS_CONTENT_TARGET_URL;
const sourceKey = process.env.IELTS_CONTENT_SOURCE_SERVICE_KEY;
const targetKey = process.env.IELTS_CONTENT_TARGET_SERVICE_KEY;
if (new URL(sourceUrl ?? "https://invalid.local").hostname !== `${SOURCE_REF}.supabase.co`
  || new URL(targetUrl ?? "https://invalid.local").hostname !== `${TARGET_REF}.supabase.co`
  || !sourceKey || !targetKey) {
  throw new Error("Content sync requires the exact production source and isolated development target credentials.");
}

const source = createClient(sourceUrl, sourceKey, { auth: { persistSession: false, autoRefreshToken: false } });
const target = createClient(targetUrl, targetKey, { auth: { persistSession: false, autoRefreshToken: false } });
const PAGE = 250;
const WRITE_BATCH = 50;
const report = [];

async function rows(client, table, orderBy = "id", configure = (query) => query) {
  const result = [];
  for (let offset = 0; ; offset += PAGE) {
    const query = configure(client.from(table).select("*").order(orderBy).range(offset, offset + PAGE - 1));
    const { data, error } = await query;
    if (error) throw new Error(`${table} read failed: ${error.message}`);
    result.push(...data);
    if (data.length < PAGE) return result;
  }
}

async function write(table, records, conflict = "id", batchSize = WRITE_BATCH) {
  if (!records.length) return;
  if (!apply) return;
  for (let index = 0; index < records.length; index += batchSize) {
    const { error } = await target.from(table).upsert(records.slice(index, index + batchSize), { onConflict: conflict });
    if (error) throw new Error(`${table} write failed at row ${index}: ${error.message}`);
  }
}

async function copy(table, key = "id", configure) {
  const records = await rows(source, table, key, configure);
  await write(table, records, key);
  report.push({ table, rows: records.length });
}

// Course IDs match across projects because the original dev bootstrap preserved them.
for (const [table, key] of [
  ["learning_stages", "id"], ["courses", "id"], ["units", "id"], ["lessons", "id"],
  ["lesson_materials", "lesson_id"], ["lesson_blocks", "id"],
  ["exercise_questions", "id"], ["exercise_answer_keys", "question_id"],
  ["vocabulary_entries", "id"], ["vocabulary_bank_entries", "source_id"],
  ["package_lesson_content", "lesson_id"], ["package_assessments", "id"],
]) await copy(table, key);

// News source IDs differ between projects. Preserve the dev IDs so existing dev
// articles and learning content remain valid; only published, nonsensitive news
// and its rights-checked body/quiz metadata cross the boundary.
const productionNewsSources = await rows(source, "news_sources");
const developmentNewsSources = await rows(target, "news_sources");
const devNewsSourceByName = new Map(developmentNewsSources.map((item) => [`${item.name}:${item.feed_url ?? ""}`, item]));
const newsSourceIds = new Map();
const mappedNewsSources = productionNewsSources.map((item) => {
  const existing = devNewsSourceByName.get(`${item.name}:${item.feed_url ?? ""}`);
  newsSourceIds.set(item.id, existing?.id ?? item.id);
  return { ...item, id: existing?.id ?? item.id, enabled: existing?.enabled ?? item.enabled,
    etag: existing?.etag ?? item.etag, last_modified: existing?.last_modified ?? item.last_modified,
    last_checked_at: existing?.last_checked_at ?? item.last_checked_at };
});
await write("news_sources", mappedNewsSources);
report.push({ table: "news_sources", rows: mappedNewsSources.length });

const newsArticles = await rows(source, "news_articles", "id", (query) => query.eq("publication_status", "published").eq("sensitive", false));
const articleIds = new Set(newsArticles.map((item) => item.id));
await write("news_articles", newsArticles.map((item) => ({ ...item, source_id: newsSourceIds.get(item.source_id) })));
report.push({ table: "news_articles", rows: newsArticles.length });
for (const [table, key, parent] of [
  ["news_article_bodies", "article_id", "article_id"],
  ["news_article_images", "article_id", "article_id"],
  ["news_auto_quiz_sets", "article_id", "article_id"],
  ["news_auto_illustrations", "article_id", "article_id"],
]) {
  const records = (await rows(source, table, key)).filter((item) => articleIds.has(item[parent]));
  await write(table, records, key);
  report.push({ table, rows: records.length });
}
const autoQuestions = (await rows(source, "news_auto_questions")).filter((item) => articleIds.has(item.article_id));
await write("news_auto_questions", autoQuestions);
report.push({ table: "news_auto_questions", rows: autoQuestions.length });
const autoQuestionIds = new Set(autoQuestions.map((item) => item.id));
const autoKeys = (await rows(source, "news_auto_answer_keys", "question_id")).filter((item) => autoQuestionIds.has(item.question_id));
await write("news_auto_answer_keys", autoKeys, "question_id");
report.push({ table: "news_auto_answer_keys", rows: autoKeys.length });

const learning = await rows(source, "news_learning_articles");
const devLearning = await rows(target, "news_learning_articles");
const devLearningBySlug = new Map(devLearning.map((item) => [item.slug, item]));
const learningIds = new Map(learning.map((item) => [item.id, devLearningBySlug.get(item.slug)?.id ?? item.id]));
await write("news_learning_articles", learning.map((item) => ({ ...item, id: learningIds.get(item.id),
  published: devLearningBySlug.get(item.slug)?.published ?? false })));
const devWords = await rows(target, "news_vocabulary");
const devWordByPosition = new Map(devWords.map((item) => [`${item.article_id}:${item.word.toLowerCase()}`, item.id]));
const sourceWords = await rows(source, "news_vocabulary");
await write("news_vocabulary", sourceWords.map((item) => ({ ...item, article_id: learningIds.get(item.article_id),
  id: devWordByPosition.get(`${learningIds.get(item.article_id)}:${item.word.toLowerCase()}`) ?? item.id })));
const devQuestions = await rows(target, "news_questions");
const devQuestionByPosition = new Map(devQuestions.map((item) => [`${item.article_id}:${item.sort_order}`, item.id]));
const sourceQuestions = await rows(source, "news_questions");
const questionIds = new Map(sourceQuestions.map((item) => [item.id,
  devQuestionByPosition.get(`${learningIds.get(item.article_id)}:${item.sort_order}`) ?? item.id]));
await write("news_questions", sourceQuestions.map((item) => ({ ...item, article_id: learningIds.get(item.article_id), id: questionIds.get(item.id) })));
const learningKeys = await rows(source, "news_answer_keys", "question_id");
await write("news_answer_keys", learningKeys.map((item) => ({ ...item, question_id: questionIds.get(item.question_id) })), "question_id");
await write("news_learning_articles", learning.map((item) => ({ ...item, id: learningIds.get(item.id) })));
report.push({ table: "news_learning_articles", rows: learning.length });
report.push({ table: "news_vocabulary", rows: sourceWords.length });
report.push({ table: "news_questions", rows: sourceQuestions.length });
report.push({ table: "news_answer_keys", rows: learningKeys.length });

await copy("ielts_sources", "id");
const sourceExams = await rows(source, "ielts_exams");
const devExams = await rows(target, "ielts_exams");
const devExamByNatural = new Map(devExams.map((item) => [`${item.source_id}:${item.external_id}`, item]));
const examIds = new Map(sourceExams.map((item) => [item.id,
  devExamByNatural.get(`${item.source_id}:${item.external_id}`)?.id ?? item.id]));
await write("ielts_exams", sourceExams.map((item) => {
  const existing = devExamByNatural.get(`${item.source_id}:${item.external_id}`);
  return { ...item, id: examIds.get(item.id), status: existing?.status ?? "needs_review",
    current_version_id: existing?.current_version_id ?? null,
    published_version_id: existing?.published_version_id ?? null };
}));
const sourceVersions = (await rows(source, "ielts_exam_versions")).sort((a, b) =>
  a.exam_id.localeCompare(b.exam_id) || a.revision - b.revision);
const devVersions = await rows(target, "ielts_exam_versions");
const devVersionByHash = new Map(devVersions.map((item) => [`${item.exam_id}:${item.content_hash}`, item]));
const usedVersionIds = new Set(devVersions.map((item) => item.id));
const maxRevision = new Map();
for (const item of devVersions) maxRevision.set(item.exam_id, Math.max(maxRevision.get(item.exam_id) ?? 0, item.revision));
const versionIds = new Map();
const newVersions = [];
for (const item of sourceVersions) {
  const examId = examIds.get(item.exam_id);
  const fingerprint = `${examId}:${item.content_hash}`;
  const existing = devVersionByHash.get(fingerprint);
  if (existing) { versionIds.set(item.id, existing.id); continue; }
  const id = usedVersionIds.has(item.id) ? randomUUID() : item.id;
  const revision = (maxRevision.get(examId) ?? 0) + 1;
  maxRevision.set(examId, revision);
  usedVersionIds.add(id);
  newVersions.push({ ...item, id, exam_id: examId, revision });
  versionIds.set(item.id, id);
  devVersionByHash.set(fingerprint, { id });
}
await write("ielts_exam_versions", newVersions, "id", 20);
await write("ielts_exams", sourceExams.map((item) => {
  const current = item.current_version_id ? versionIds.get(item.current_version_id) : null;
  const published = item.published_version_id ? versionIds.get(item.published_version_id) : null;
  if (item.current_version_id && !current || item.published_version_id && !published) throw new Error(`Missing version for ${item.external_id}`);
  return { ...item, id: examIds.get(item.id), current_version_id: current, published_version_id: published };
}));
report.push({ table: "ielts_exams", rows: sourceExams.length });
report.push({ table: "ielts_exam_versions", rows: sourceVersions.length, added: newVersions.length });

await copy("youtube_listening_lessons", "id");
console.log(JSON.stringify({ mode: apply ? "applied" : "dry-run", source: SOURCE_REF, target: TARGET_REF, report }, null, 2));
