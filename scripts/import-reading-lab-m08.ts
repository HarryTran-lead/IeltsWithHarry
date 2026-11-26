/** Import the owner-approved M08 Reading set. Dry-run by default.
 *
 * Usage: node --env-file=.env.production.local --import tsx scripts/import-reading-lab-m08.ts
 *   --root C:/private/ielts-reading-lab-private --origin https://harryup.vercel.app
 * Add --write-drafts to save unpublished exam versions. Publication requires the
 * separate rights evidence review and an explicit --publish pass.
 */
import { readFileSync, existsSync } from "node:fs";
import { join, resolve } from "node:path";
import { createClient } from "@supabase/supabase-js";
import { contentHash, contentSchema, publicContent, scoreAnswers, validateExam, type NormalizedExam } from "../src/lib/ielts-bank/schema";

async function main() {
const args = process.argv.slice(2);
const value = (flag: string) => { const index = args.indexOf(flag); return index < 0 ? "" : args[index + 1] ?? ""; };
const root = resolve(value("--root"));
const origin = value("--origin").replace(/\/$/, "");
const writeDrafts = args.includes("--write-drafts");
const publish = args.includes("--publish");
const attestation = value("--rights-document");
const reviewer = value("--reviewer-id");
if (!value("--root") || !/^https:\/\/[^/]+$/.test(origin)) throw Error("Supply --root and HTTPS --origin");
if (publish && (writeDrafts || !attestation || !args.includes("--commercial-and-modification-confirmed")))
  throw Error("Publication requires --rights-document and explicit commercial/modification confirmation");
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
if ((writeDrafts || publish) && (!url || !key)) throw Error("Supabase service credentials missing");
const db = url && key ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } }) : null;
const sourceId = "manual";
const packageName = "IELTS_Reading_Codex_Staging_S04_1_FULL_PRIVATE_Handoff.zip";
const packageSha = process.env.READING_LAB_SOURCE_SHA256 ?? "";
const results: { id: string; questions: number; evidence: number; media: number; score: number; warnings: string[] }[] = [];
let reviewerId = "";
if (publish) {
  if (!db || !/^[0-9a-f]{64}$/.test(packageSha)) throw Error("Supply READING_LAB_SOURCE_SHA256");
  if (!reviewer) throw Error("Supply --reviewer-id of the project owner/admin who confirmed rights");
  const { data: admin, error } = await db.from("admin_users").select("user_id").eq("user_id", reviewer).maybeSingle();
  if (error || !admin) throw Error("Reviewer must be an existing admin");
  reviewerId = admin.user_id;
  const { data: document, error: documentError } = await db.storage.from("rights-evidence").download(attestation.replace(/^rights-evidence\//, ""));
  if (documentError || !document) throw Error("Rights document must exist in private rights-evidence storage");
}

for (let number = 2; number <= 37; number++) {
  const id = `M08_${String(number).padStart(2, "0")}`;
  const raw = JSON.parse(readFileSync(join(root, "private", `${id}_CANDIDATE_PRIVATE_S03.json`), "utf8")) as { exam: NormalizedExam };
  const offsets = JSON.parse(readFileSync(join(root, "offsets", `${id}_EVIDENCE_OFFSETS_S03.json`), "utf8")) as { evidenceOffsets: unknown[] };
  const original = raw.exam;
  const parsed = contentSchema.parse(original.content);
  const mediaUrls = new Set<string>();
  for (const section of parsed.sections) for (const question of section.questions) {
    if (!question.mediaReference) continue;
    if (!/^assets\/[A-Za-z0-9_-]+\.svg$/.test(question.mediaReference)) throw Error(`${id}: unexpected media reference`);
    const name = question.mediaReference.slice(7).replace(/\.svg$/, ".png");
    if (!existsSync(join(root, "assets", id, name))) throw Error(`${id}: missing image ${name}`);
    question.mediaUrl = `${origin}/reading-lab/assets/${id}/${name}`;
    mediaUrls.add(question.mediaUrl);
  }
  const exam: NormalizedExam = {
    ...original, externalId: `reading-lab-${id.toLowerCase().replace("_", "-")}`,
    title: original.title,
    sourceUrl: `${origin}/app/reading/lab`, licenseUrl: `${origin}/reading-lab/rights`,
    license: "Owner-authorized", attribution: "Harry Up original AI-assisted Reading set",
    content: parsed,
  };
  const questions = parsed.sections.flatMap((section) => section.questions);
  const sheet = Object.fromEntries(questions.map((question) => [question.id,
    question.type === "multiple_answers" ? question.answers.join(",") : question.answers[0] ?? ""]));
  const scored = scoreAnswers(parsed, sheet);
  if (scored.total !== questions.length || scored.score !== questions.length) throw Error(`${id}: answer key self-score ${scored.score}/${questions.length}`);
  if (publicContent(parsed).sections.some((section) => section.questions.some((question) => question.answers.length || question.fiveStep)))
    throw Error(`${id}: learner answer leakage`);
  const warnings = validateExam(exam);
  if (warnings.length) throw Error(`${id}: ${warnings.join(", ")}`);
  const content = { ...parsed, readingLabOffsets: offsets.evidenceOffsets };
  const hash = contentHash(content);
  results.push({ id, questions: questions.length, evidence: offsets.evidenceOffsets.length, media: mediaUrls.size, score: scored.score, warnings });
  if (writeDrafts) {
    if (!db) throw Error("Supabase unavailable");
    const { error } = await db.rpc("ielts_upsert_import", {
      p_source: sourceId, p_external: exam.externalId,
      p_meta: { skill: exam.skill, format: exam.format, mode: exam.mode, title: exam.title,
        duration_minutes: exam.durationMinutes, license: exam.license, license_url: exam.licenseUrl,
        source_url: exam.sourceUrl, attribution: exam.attribution, ai_generated: exam.aiGenerated },
      p_content: content, p_hash: hash, p_upstream: "m08-s04.1-owner-reviewed", p_warnings: [],
    });
    if (error) throw Error(`${id}: draft import failed: ${error.message}`);
    const { error: titleError } = await db.from("ielts_exams").update({ title: exam.title })
      .eq("source_id", sourceId).eq("external_id", exam.externalId).is("published_version_id", null);
    if (titleError) throw Error(`${id}: title update failed: ${titleError.message}`);
  }
  if (publish) {
    if (!db) throw Error("Supabase unavailable");
    const { data: saved, error } = await db.from("ielts_exams")
      .select("id,current_version_id,published_version_id,status")
      .eq("source_id", sourceId).eq("external_id", exam.externalId).single();
    if (error || !saved?.current_version_id) throw Error(`${id}: draft missing`);
    const { data: version, error: versionError } = await db.from("ielts_exam_versions")
      .select("content_hash,warnings").eq("id", saved.current_version_id).single();
    if (versionError || version?.content_hash !== hash || version.warnings.length) throw Error(`${id}: draft mismatch`);
    if (saved.published_version_id === saved.current_version_id) continue;
    for (const url of mediaUrls) {
      const response = await fetch(url, { method: "HEAD", signal: AbortSignal.timeout(15000) });
      if (!response.ok || !response.headers.get("content-type")?.startsWith("image/")) throw Error(`${id}: production image unavailable: ${url}`);
    }
    const rights = [{ asset_kind: "text" as const, asset_url: null },
      ...[...mediaUrls].map((url) => ({ asset_kind: "image" as const, asset_url: url }))].map((item) => ({
        ...item, content_kind: "ielts_exam", content_id: saved.id,
        source_package_name: packageName, source_package_sha256: packageSha,
        author_name: "Harry Up", rights_holder: "Harry Up",
        permission_document_ref: attestation, permission_scope: "Owner confirmed web publication, commercial use, and translation/modification of Reading M08 text and images.",
        web_publication_allowed: true, commercial_use_allowed: true, modification_translation_allowed: true,
        reviewed_by: reviewerId,
      }));
    const { data: existingRights, error: lookupError } = await db.from("content_rights_evidence")
      .select("asset_kind,asset_url,permission_document_ref").eq("content_kind", "ielts_exam").eq("content_id", saved.id);
    if (lookupError) throw Error(`${id}: rights lookup failed: ${lookupError.message}`);
    const missingRights = rights.filter((right) => !existingRights?.some((existing) =>
      existing.asset_kind === right.asset_kind && existing.asset_url === right.asset_url && existing.permission_document_ref === attestation));
    const { error: rightsError } = missingRights.length
      ? await db.from("content_rights_evidence").insert(missingRights)
      : { error: null };
    if (rightsError) throw Error(`${id}: rights evidence failed: ${rightsError.message}`);
    const { error: readyError } = await db.from("ielts_exams").update({ status: "ready" }).eq("id", saved.id).eq("current_version_id", saved.current_version_id);
    if (readyError) throw Error(`${id}: ready failed: ${readyError.message}`);
    const { error: publishError } = await db.from("ielts_exams").update({ status: "published", published_version_id: saved.current_version_id })
      .eq("id", saved.id).eq("current_version_id", saved.current_version_id);
    if (publishError) throw Error(`${id}: publication failed: ${publishError.message}`);
    const { error: logError } = await db.from("ielts_review_log").insert({ exam_id: saved.id, version_id: saved.current_version_id,
      actor_id: reviewerId, action: "publish", note: `Owner approval and rights document: ${attestation}` });
    if (logError) throw Error(`${id}: published but review log failed: ${logError.message}`);
  }
}
const totals = results.reduce((total, item) => ({ exams: total.exams + 1, questions: total.questions + item.questions,
  evidence: total.evidence + item.evidence, media: total.media + item.media }), { exams: 0, questions: 0, evidence: 0, media: 0 });
console.log(JSON.stringify({ mode: publish ? "published" : writeDrafts ? "drafts" : "dry-run", ...totals }));
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
