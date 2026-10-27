import { aiArtSlots, generateAiArt } from "../news/ai-art";
import { balancedCatalog, catalogGroups, type CatalogSkill } from "./catalog";
import type { bankClient } from "./server";

export const ieltsCoverBucket = "ielts-images";

export type CoverExamRow = {
  id: string;
  skill: "Reading" | "Listening" | "Writing";
  practice_type: string;
  title: string;
  topic: string | null;
  created_at: string;
  prompt_preview?: string | null;
};

/** Removes exam-type boilerplate so the generator draws the topic itself. */
export function cleanExamTitle(title: string) {
  return title
    .replace(/^IELTS\s+(?:Academic|General(?:\s+Training)?|Advanced)?\s*(?:Reading|Listening|Writing)\s*(?:Mastery|Practice)?\s*:\s*/i, "")
    .replace(/^Writing\s+Task\s+[12]\s*:\s*/i, "")
    .replace(/^(?:Advantages\s+Disadvantages|Adv\s+Disadv|Two\s+Part|Opinion|Discussion|Problem\s+Solution|Positive\s+Negative|Direct\s+Question|Agree\s+Disagree)\s+/i, "")
    .replace(/^(?:Lecture|Tutorial(?:\s+feedback)?|Section\s+\d+|Passage\s+\d+|Part\s+\d+)\s*:\s*/i, "")
    .replace(/\s*\(Band\s*\d+(?:\.\d+)?\)\s*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** First topic sentence of a Writing prompt, without the standard IELTS instructions. */
function cleanPromptPreview(prompt?: string | null) {
  if (!prompt) return "";
  const body = prompt
    .replace(/^Write about the following topic:\s*/i, "")
    .split(/\n+/)[0]
    ?.replace(/\b(?:Discuss both|Do the advantages|To what extent|Why is this|What are the|Give reasons for your answer).*$/i, "")
    .replace(/\s+/g, " ")
    .trim();
  return body ? body.slice(0, 110) : "";
}

/** Concrete visual subject passed to `generateAiArt` for an IELTS exam card. */
export function ieltsCoverSubject(exam: Pick<CoverExamRow, "title" | "topic" | "prompt_preview">) {
  const headline = cleanExamTitle(exam.title);
  const topic = (exam.topic ?? "").replace(/^topic_/, "").replace(/_/g, " ").trim();
  const detail = cleanPromptPreview(exam.prompt_preview);
  return [headline, detail, topic ? `(${topic})` : ""].filter(Boolean).join(" — ").slice(0, 140);
}

/**
 * Orders unillustrated exams so that the first page of Reading, Listening and
 * Writing Task 2 is filled first (interleaving one exam per skill from newest to
 * oldest), followed by General Training Task 1 and the remaining pages.
 */
export function orderCoverCandidates<T extends CoverExamRow>(exams: T[]): T[] {
  const reading = balancedCatalog(
    exams.filter((exam) => exam.skill === "Reading"),
    catalogGroups.Reading.map((group) => group.id),
  );
  const listening = balancedCatalog(
    exams.filter((exam) => exam.skill === "Listening"),
    catalogGroups.Listening.map((group) => group.id),
  );
  const writingTask2 = exams.filter((exam) => exam.skill === "Writing" && exam.practice_type === "task2");
  const writingTask1Gt = exams.filter((exam) => exam.skill === "Writing" && exam.practice_type === "task1_general");
  const buckets = [reading, listening, writingTask2, writingTask1Gt];
  const ordered: T[] = [];
  for (let index = 0; ordered.length < exams.length; index++) {
    let added = false;
    for (const bucket of buckets) {
      if (index < bucket.length) {
        ordered.push(bucket[index]);
        added = true;
      }
    }
    if (!added) break;
  }
  return ordered;
}

type BankDb = ReturnType<typeof bankClient>;

/** Generates and uploads one AI cover illustration for `exam`, returning its public URL. */
export async function createExamCover(client: BankDb, exam: CoverExamRow, fetcher: typeof fetch = fetch): Promise<string> {
  const subject = ieltsCoverSubject(exam);
  const headline = cleanExamTitle(exam.title) || exam.title;
  const art = await generateAiArt(headline, subject, exam.id, fetcher);
  const path = `covers/${exam.id}.${art.extension}`;
  const storage = client.storage.from(ieltsCoverBucket);
  const { error: uploadError } = await storage.upload(path, art.bytes, {
    contentType: art.contentType,
    upsert: true,
    cacheControl: "31536000",
  });
  if (uploadError) throw new Error(`IELTS cover upload failed: ${uploadError.message}`);
  const publicUrl = storage.getPublicUrl(path).data.publicUrl;
  const { error: updateError } = await client.from("ielts_exams").update({ cover_image_url: publicUrl }).eq("id", exam.id);
  if (updateError) throw new Error(`IELTS cover save failed: ${updateError.message}`);
  return publicUrl;
}

/**
 * Generates AI cover illustrations for published Reading, Listening and Writing
 * (Task 2 / General Training Task 1) exams that do not yet have one.
 */
export async function enrichIeltsCovers(client: BankDb, fetcher: typeof fetch = fetch) {
  const result = { checked: 0, added: 0, remaining: 0, errors: [] as string[] };
  const { data: rows, error } = await client
    .from("ielts_exams")
    .select("id,skill,practice_type,title,topic,created_at,ielts_exam_versions!ielts_published_version_fk(content)")
    .eq("status", "published")
    .is("cover_image_url", null)
    .in("skill", ["Reading", "Listening", "Writing"] as CatalogSkill[])
    .neq("practice_type", "task1_academic")
    .order("created_at", { ascending: false })
    .order("id", { ascending: true });
  if (error) throw new Error(error.message);

  const candidates: CoverExamRow[] = (rows ?? []).flatMap((row) => {
    const version = Array.isArray(row.ielts_exam_versions) ? row.ielts_exam_versions[0] : row.ielts_exam_versions;
    const content = (version?.content && typeof version.content === "object" ? version.content : {}) as Record<string, unknown>;
    // Skip any exam that already has a source figure or chart visual.
    if (content.imageUrl || content.visual) return [];
    return [{
      id: String(row.id),
      skill: row.skill as CoverExamRow["skill"],
      practice_type: String(row.practice_type),
      title: String(row.title),
      topic: (row.topic as string | null) ?? null,
      created_at: String(row.created_at),
      prompt_preview: typeof content.prompt === "string" ? content.prompt.slice(0, 280) : null,
    }];
  });

  const ordered = orderCoverCandidates(candidates);
  const limit = aiArtSlots();
  for (const exam of ordered.slice(0, limit)) {
    result.checked++;
    try {
      await createExamCover(client, exam, fetcher);
      result.added++;
    } catch (cause) {
      result.errors.push(`${exam.id}: ${cause instanceof Error ? cause.message : String(cause)}`);
    }
  }
  result.remaining = Math.max(0, ordered.length - result.added);
  return result;
}
