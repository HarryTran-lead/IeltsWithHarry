import { createHash } from "node:crypto";
import { passageForScore, passageScore } from "../passage-difficulty";
import { quizExcerpt } from "../enrichment";
import { MIN_BLOCK, selectQuestionTypes, targetQuestionCount, type AdaptiveQuestion } from "../adaptive-quiz";
import type { BlindVerdict, Candidate, FactoryResult, Generation, BlindReview, PassageMap, PassageStyle, QuizFailureReason, TokenUsage } from "./types";
import { FACTORY_VERSION } from "./types";
import { choiceTypes, gapTypes, sharesOptionPool, type IeltsQuestionType } from "../ielts-passage";
import { ArticleRequestBudget, FactoryProviderError, alternateV2Model, strictGeminiJson, v2Model, type FactoryProviderKind } from "./provider";
import { MAP_SYSTEM, batchSchema, batchSystem, blindQaPayload, blindQaSystem, mapSchema, planBatches, qaSchema, repairPayload, repairSchema, repairSystem, typeCounts } from "./prompts";
import { BLOCKING_QA_ISSUES, PARAGRAPH_MAP_ISSUES, isVietnameseNote, validateBlindReview, validateGeneration, validatePassageMap } from "./validate";

type Provider = typeof strictGeminiJson;
const providerReasons: Record<FactoryProviderKind, QuizFailureReason> = {
  quota: "quota", unavailable: "unavailable", configuration: "config",
  rejected: "rejected", incomplete: "incomplete", provider: "internal",
};
const successCache = new Map<string, FactoryResult>();
const inFlight = new Map<string, Promise<FactoryResult>>();
const MAX_CACHE = 64;
function fingerprint(articleId: string, title: string, article: string, guidance: string, model: string) {
  return createHash("sha256").update(JSON.stringify([FACTORY_VERSION, model, articleId, title, article, guidance])).digest("hex");
}
const PASSAGE_LEVEL: Record<PassageStyle, 1 | 2 | 3> = { factual: 1, sections: 2, argument: 3 };
function passageLevelOf(style: unknown) {
  return typeof style === "string" && Object.hasOwn(PASSAGE_LEVEL, style) ? PASSAGE_LEVEL[style as PassageStyle] : undefined;
}
/**
 * Written items other than notes carry their block's word limit as a [W1]/[W2] tag, as notes already do, so
 * the paper can print ONE WORD ONLY or NO MORE THAN TWO WORDS for the block (one block per form).
 */
function withWordLimitTags(items: Candidate[]): Candidate[] {
  const limits = new Map<string, number>();
  for (const item of items) {
    if (item.correct_index >= 0 || item.type === "note_completion" || /\n\[W[123]\]$/.test(item.prompt)) continue;
    const length = item.answer.trim().split(/\s+/).filter(Boolean).length;
    limits.set(item.type, Math.min(3, Math.max(limits.get(item.type) ?? 1, length)));
  }
  return items.map((item) => limits.has(item.type) && item.type !== "note_completion" && item.correct_index < 0
    && !/\n\[W[123]\]$/.test(item.prompt) ? { ...item, prompt: `${item.prompt}\n[W${limits.get(item.type)}]` } : item);
}
function toLegacy(item: Candidate): AdaptiveQuestion {
  return {
    type: item.type, prompt: item.prompt, options: item.options,
    correct_index: item.correct_index < 0 ? null : item.correct_index,
    accepted_answers: item.correct_index < 0 ? [item.answer] : null,
    supporting_sentence: item.supporting_sentence,
    explanation: item.explanation,
    option_notes: item.correct_index < 0 || !item.option_notes.length ? null : item.option_notes,
  };
}
/** Fewest questions a published set needs. */
const MIN_SET = 6;
/** Largest share of a set that may be direct-lookup (P1) items: two in six, three in nine. */
export const DIRECT_SHARE = 1 / 3;
const directLimit = (size: number) => Math.floor(size * DIRECT_SHARE + 1e-9);
/**
 * Chooses the published set. Groups are atomic; harder groups come first and direct-lookup (P1) items stay
 * within DIRECT_SHARE. Like an IELTS passage, each form becomes one block of at least MIN_BLOCK items, and the
 * blocks follow `order` (the template's form order), with reading order inside a block.
 */
export function selectPublished(items: Candidate[], target: number, order: IeltsQuestionType[] = []) {
  const groups = new Map<string, Candidate[]>();
  for (const item of items) groups.set(item.group_id, [...(groups.get(item.group_id) ?? []), item]);
  let selected: Candidate[] = [];
  const usable = [...groups.values()].filter((group) => {
    const type = group[0].type;
    // Whole groups are atomic; never publish a broken matching, note or flow set.
    if ((type.startsWith("matching_") || ["summary_completion", "note_completion", "table_completion", "flow_chart_completion", "summary_word_list"].includes(type))
      && group.length < 2) return false;
    // A Choose TWO question is published whole or not at all.
    if (type === "mcq_multiple" && group.length !== 2) return false;
    if (type === "matching_headings" && group[0].options.length <= group.length) return false;
    return !(type === "flow_chart_completion" && group.some((item, index) => !new RegExp(`^Step ${index + 1}:`, "i").test(item.prompt)));
  });
  const directIn = (group: Candidate[]) => group.filter((item) => item.difficulty === "P1").length;
  const countOf = (type: IeltsQuestionType) => selected.filter((item) => item.type === type).length;
  // Harder groups first; direct-lookup (P1) items only while they stay within DIRECT_SHARE of the set.
  const ranked = [...usable.filter((group) => !directIn(group)), ...usable.filter(directIn)];
  const taken = new Set<Candidate[]>();
  const take = (allowed: (group: Candidate[]) => boolean) => {
    for (const group of ranked) {
      if (taken.has(group) || !allowed(group) || selected.length + group.length > target) continue;
      // Like Cambridge papers, a block holds at most two Choose TWO questions.
      if (group[0].type === "mcq_multiple" && countOf("mcq_multiple") >= 4) continue;
      const direct = selected.filter((item) => item.difficulty === "P1").length;
      if (directIn(group) && direct + directIn(group) > directLimit(Math.max(selected.length + group.length, MIN_SET))) continue;
      selected.push(...group);
      taken.add(group);
    }
  };
  // First an equal share per form, so one form cannot crowd another below a full block; then fill the target.
  const share = Math.ceil(target / Math.max(1, new Set(usable.map((group) => group[0].type)).size));
  take((group) => countOf(group[0].type) + group.length <= share);
  take(() => true);
  // A form left with one or two items is a stray block: drop it while the rest still makes a set, then refill.
  const dropped = new Set<IeltsQuestionType>();
  for (const type of new Set(selected.map((item) => item.type))) {
    const count = countOf(type);
    if (count >= MIN_BLOCK || selected.length - count < MIN_SET) continue;
    dropped.add(type);
    selected = selected.filter((item) => item.type !== type);
  }
  if (dropped.size) {
    for (const group of ranked) if (dropped.has(group[0].type)) taken.add(group);
    // Refill only blocks already in the set, so the refill cannot start a new stray block.
    const kept = new Set(selected.map((item) => item.type));
    take((group) => kept.has(group[0].type));
  }
  // Blocks in template order; inside a block, the order Cambridge papers use (see TEXT_ORDER_ITEMS).
  const position = new Map(items.map((item, index) => [item.id, index]));
  const firstSeen = [...new Set(selected.sort((a, b) => (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0)).map((item) => item.type))];
  const rank = (type: IeltsQuestionType) => order.includes(type) ? order.indexOf(type) : order.length + firstSeen.indexOf(type);
  const groupStart = new Map<string, number>();
  for (const item of selected) groupStart.set(item.group_id, Math.min(groupStart.get(item.group_id) ?? Infinity, evidenceStart(item)));
  const textKey = (item: Candidate) => TEXT_ORDER_ITEMS.has(item.type) ? evidenceStart(item)
    : TEXT_ORDER_GROUPS.has(item.type) ? groupStart.get(item.group_id) ?? Infinity : 0;
  return selected.sort((a, b) => rank(a.type) - rank(b.type) || textKey(a) - textKey(b)
    || (position.get(a.id) ?? 0) - (position.get(b.id) ?? 0));
}
/**
 * Answer order measured on 120 Cambridge passages (2026-11-27): for these forms the answers follow
 * the passage (0–20% of consecutive answers measured out of order, within the error of locating them), while
 * matching information and matching features run in any order (about 35%, the same as no order). Items that
 * stand alone are sorted by their evidence; a summary, notes, table or flow chart is one connected text, so
 * its group moves as a whole by its first evidence and keeps its own sequence, as does a Choose TWO pair.
 */
const TEXT_ORDER_ITEMS = new Set<IeltsQuestionType>(["tfng", "ynng", "mcq", "sentence_completion", "short_answer", "matching_sentence_endings"]);
const TEXT_ORDER_GROUPS = new Set<IeltsQuestionType>(["mcq_multiple", "summary_completion", "summary_word_list", "note_completion", "table_completion", "flow_chart_completion"]);
function evidenceStart(item: Candidate) {
  const start = item.evidence_spans?.[0]?.start;
  return typeof start === "number" && start >= 0 ? start : Infinity;
}
function result(state: FactoryResult["state"], model: string, fingerprintValue: string,
  budget: ArticleRequestBudget, generationTokens: TokenUsage | null, qaTokens: TokenUsage | null,
  candidates: number, deterministic: number, accepted: Candidate[], issues: string[], imageQuery = "",
  providerFailure: { reason: QuizFailureReason; retryAfterMs: number | null } | null = null): FactoryResult {
  const failure: QuizFailureReason | null = state === "READY" ? null : providerFailure?.reason
    ?? (issues.includes("PASSAGE_TOO_SHORT") ? "too_short" : "quality");
  return {
    state, model, questions: state === "READY" ? withWordLimitTags(accepted).map(toLegacy) : [],
    imageQuery: state === "READY" ? imageQuery.replace(/[^\p{L}\p{N} -]/gu, " ").trim().slice(0, 80) : "",
    audit: {
      version: FACTORY_VERSION, fingerprint: fingerprintValue, requests: budget.used,
      retryable: failure === "quota" || failure === "unavailable", failure,
      retry_after_ms: providerFailure?.retryAfterMs ?? null,
      generation_tokens: generationTokens, qa_tokens: qaTokens,
      candidate_count: candidates, deterministic_pass: deterministic,
      qa_pass: accepted.length, issues,
    },
  };
}

/** Like the legacy generator: retry a Google outage up to 3 times per model, then the other Flash-Lite model. */
export const OUTAGE_ATTEMPTS_PER_MODEL = 3;
/** Hard cap for one article: map, up to three question batches and QA with outage retries, plus repair and cross QA. */
export const MAX_ARTICLE_REQUESTS = 30;
/** Evidence offsets come from the exact supporting sentence, so the model never has to count characters. */
export function withEvidenceSpans(item: Candidate, article: string): Candidate {
  const quote = typeof item?.supporting_sentence === "string" ? item.supporting_sentence : "";
  const start = quote ? article.indexOf(quote) : -1;
  return { ...item, evidence_spans: start >= 0 ? [{ start, end: start + quote.length, quote }] : [] };
}
const GAP = "______";
/** Most candidates one article may request across all batches. */
const MAX_CANDIDATES = 20;
/** Spare candidates beyond the published target, so checks can drop items without failing the set. */
export function spareItems(target: number) { return Math.max(3, Math.ceil(target * 0.5)); }
const GAP_VARIANTS = /\[\s*(?:gap|blank)\s*\]|\(\s*(?:gap|blank)?\s*\)|\[\s*\]|\{\s*gap\s*\}|(?:_\s){2,}_|—{2,}|–{2,}/gi;
const UNDERSCORE_GAP = /_{3,}/g;
/**
 * Fixes presentation slips that do not change what an item tests, so a correct question is not thrown away:
 * a choice item's redundant text answer, stray shape fields on written items, and non-standard gap markers.
 * Anything about content (evidence, key, wording) is still left to validation and blind QA.
 */
export function normalizeCandidate(item: Candidate): Candidate {
  if (!item || typeof item !== "object") return item;
  if (choiceTypes.has(item.type)) {
    // Per-option notes are an optional extra for learners (the explanation stays required), so notes
    // that do not line up with the options or are not Vietnamese are dropped and the item is kept.
    const notesMismatch = !Array.isArray(item.option_notes) || !Array.isArray(item.options) || item.option_notes.length !== item.options.length
      || !item.option_notes.every(isVietnameseNote);
    // Choose TWO prints its key word in capitals, as Cambridge papers do.
    const prompt = item.type === "mcq_multiple" && typeof item.prompt === "string" ? item.prompt.replace(/\b(which|choose)\s+two\b/i, (_, word: string) => `${word} TWO`) : item.prompt;
    return { ...item, prompt, answer: "", ...(notesMismatch ? { option_notes: [] } : {}) };
  }
  let prompt = typeof item.prompt === "string" ? item.prompt.replace(GAP_VARIANTS, GAP) : item.prompt;
  if (gapTypes.has(item.type) && typeof prompt === "string" && item.type !== "diagram_label_completion") {
    // Outside note completion, "[W1]" is the word-limit tag misused as the gap itself.
    if (item.type !== "note_completion" && !UNDERSCORE_GAP.test(prompt) && /\[W[123]\]/.test(prompt))
      prompt = prompt.replace(/\[W[123]\]/, GAP).replace(/\s*\[W[123]\]/g, "");
    UNDERSCORE_GAP.lastIndex = 0;
    const gaps = prompt.match(UNDERSCORE_GAP)?.length ?? 0;
    // A sentence-ending ellipsis next to a real gap is punctuation, not a second gap.
    if (gaps === 1) prompt = prompt.replace(/\s*(?:…|\.{3,})/g, "");
    // A prompt that spells out its own answer becomes a gap at that place.
    else if (gaps === 0 && typeof item.answer === "string" && item.answer.trim()) {
      const at = prompt.toLowerCase().indexOf(item.answer.trim().toLowerCase());
      if (at >= 0 && prompt.toLowerCase().indexOf(item.answer.trim().toLowerCase(), at + 1) < 0)
        prompt = prompt.slice(0, at) + GAP + prompt.slice(at + item.answer.trim().length);
    }
  }
  return { ...item, prompt, options: [], option_notes: [], correct_index: -1 };
}
/** Rejected items from the latest run per article, kept in memory only for the cron-only diagnostic run. */
const rejectedSamples = new Map<string, string[]>();
export function lastRejectedSamples(articleId: string) { return rejectedSamples.get(articleId) ?? []; }
function sampleRejected(articleId: string, items: Candidate[], issues: string[]) {
  const errors = new Map(issues.map((issue) => /^([^:]+):([A-Z_,]+)$/.exec(issue)).filter(Boolean).map((match) => [match![1], match![2]]));
  rejectedSamples.set(articleId, items.filter((item) => errors.has(item?.id)).slice(0, 8).map((item) =>
    `${item.id} [${item.type}] ${errors.get(item.id)} | prompt=${String(item.prompt ?? "").slice(0, 220)} | answer=${String(item.answer ?? "")} | key=${item.correct_index} | options=${JSON.stringify(item.options ?? []).slice(0, 160)} | notes=${JSON.stringify(item.option_notes ?? []).slice(0, 160)} | evidence=${String(item.supporting_sentence ?? "").slice(0, 160)}`));
  if (rejectedSamples.size > 50) rejectedSamples.delete(rejectedSamples.keys().next().value!);
}
/**
 * Matching items in one group must share one option list. When the model reorders or varies the list,
 * every item takes the first item's list and its key follows the same answer text; an item whose answer
 * is not in that list is left as is for validation to reject.
 */
export function unifyMatchingPools(items: Candidate[]): Candidate[] {
  const pools = new Map<string, string[]>();
  return items.map((item) => {
    if (typeof item?.type !== "string" || !sharesOptionPool(item.type) || !Array.isArray(item.options)) return item;
    const pool = pools.get(item.group_id);
    if (!pool) { pools.set(item.group_id, item.options); return item; }
    const answer = item.options[item.correct_index];
    const index = typeof answer === "string" ? pool.findIndex((option) => option.trim().toLowerCase() === answer.trim().toLowerCase()) : -1;
    if (index < 0) return item;
    const notes = Array.isArray(item.option_notes) && item.option_notes.length === item.options.length
      ? pool.map((option) => item.option_notes[item.options.findIndex((own) => own.trim().toLowerCase() === option.trim().toLowerCase())])
      : [];
    return { ...item, options: pool, correct_index: index, option_notes: notes.every((note) => typeof note === "string") ? notes : [] };
  });
}
/** Single-item forms used to top up a set that is short after checks; groups need two or more items. */
const TOP_UP_FORMS: IeltsQuestionType[] = ["tfng", "mcq", "sentence_completion", "short_answer", "ynng", "mcq_multiple"];
/**
 * How many items each top-up form asks for: forms still short of a full block (MIN_BLOCK plus one spare for QA)
 * come first, so the set keeps two or three real blocks instead of one large one; the rest is shared evenly.
 * Choose TWO is asked for in whole questions of two items.
 */
export function topUpCounts(forms: IeltsQuestionType[], passing: Map<IeltsQuestionType, number>, missing: number) {
  const counts = forms.map(() => 0);
  const order = forms.map((type, index) => ({ type, index })).sort((a, b) => (passing.get(a.type) ?? 0) - (passing.get(b.type) ?? 0) || a.index - b.index);
  const step = (type: IeltsQuestionType) => type === "mcq_multiple" ? 2 : 1;
  let left = missing;
  for (const { type, index } of order) {
    let need = Math.max(0, MIN_BLOCK + 1 - (passing.get(type) ?? 0));
    while (need > 0 && left >= step(type)) { counts[index] += step(type); left -= step(type); need -= step(type); }
  }
  for (let guard = 0; left > 0 && guard < 20; guard++) {
    const next = order.find(({ type }) => step(type) <= left);
    if (!next) break;
    counts[next.index] += step(next.type);
    left -= step(next.type);
    order.push(order.shift()!);
  }
  return counts;
}
/** Rounds 3 and 4 run only when the round before them added a checked item (the article still has material). */
const MAX_TOP_UPS = 4;
/** Repair rounds for rejected items while the set is short of its target. */
const MAX_REPAIR_ROUNDS = 2;
/** Checked items to hold beyond the target before QA, so later drops do not sink the set. */
const TOP_UP_MARGIN = 2;
/** Keeps ids and group ids from different batches apart without splitting a group inside one batch. */
function separateBatch(items: Candidate[], batch: number, usedIds: Set<string>, usedGroups: Set<string>) {
  const groupNames = new Map<string, string>();
  const renamed = items.filter((item) => item && typeof item === "object").map((item) => {
    const group = String(item.group_id ?? "");
    if (!groupNames.has(group)) groupNames.set(group, usedGroups.has(group) ? `${group}-b${batch}` : group);
    let id = String(item.id ?? "");
    if (usedIds.has(id)) id = `${id}-b${batch}`;
    usedIds.add(id);
    return { ...item, id, group_id: groupNames.get(group)! };
  });
  for (const name of groupNames.values()) usedGroups.add(name);
  return renamed;
}
/** Items an independent second model must also answer: deep inference and every Not Given key. */
export function riskyItem(item: Candidate) {
  return item.difficulty === "P3"
    || ((item.type === "tfng" || item.type === "ynng") && item.options[item.correct_index] === "Not Given");
}
function addUsage(a: TokenUsage | null, b: TokenUsage | null): TokenUsage | null {
  if (!a || !b) return a ?? b;
  const sum = (x: number | null, y: number | null) => x === null && y === null ? null : (x ?? 0) + (y ?? 0);
  return { prompt: sum(a.prompt, b.prompt), candidates: sum(a.candidates, b.candidates), total: sum(a.total, b.total) };
}
/** Retry pauses grow from the base delay; no retry starts unless a full request still fits the run budget. */
// The enrich route may run 180 s; the factory keeps 30 s for publishing and the rest of the run.
export const v2Timing = { outageRetryDelayMs: 1000, runBudgetMs: 150_000, requestTimeoutMs: 46_000 };

/**
 * Calls one step (generation or QA). Only an outage (5xx, timeout, network error) with no reply is retried;
 * every other failure, and a retry that would overrun the run budget, ends the step.
 */
async function withOutageRetry<T>(call: (model: string) => Promise<T>, models: string[], deadline: number) {
  let last: unknown = new FactoryProviderError("unavailable", "Gemini unavailable");
  for (const [index, model] of models.entries()) {
    for (let attempt = 0; attempt < OUTAGE_ATTEMPTS_PER_MODEL; attempt++) {
      if (index > 0 || attempt > 0) {
        const pause = v2Timing.outageRetryDelayMs * 2 ** Math.max(0, attempt - 1);
        if (Date.now() + pause + v2Timing.requestTimeoutMs > deadline) throw last;
        await new Promise((resolve) => setTimeout(resolve, pause));
      }
      try { return { reply: await call(model), model }; }
      catch (cause) {
        if (!(cause instanceof FactoryProviderError && cause.kind === "unavailable")) throw cause;
        last = cause;
      }
    }
  }
  throw last;
}
const modelOrder = (first: string) => [...new Set([first, alternateV2Model(first)])];

/**
 * Split factory: a small passage-map request, question batches of at most five items, then independent blind
 * QA. Small replies are less likely to be refused when Gemini is busy, and a failed batch keeps the others.
 * A Google outage at any step is retried like the legacy generator (3 attempts per model, then the other
 * Flash-Lite model) within MAX_ARTICLE_REQUESTS and the run time budget.
 */
export async function generateNewsQuizV2(
  title: string, fullArticle: string, articleId: string, fetcher: typeof fetch = fetch,
  customPrompt = "", provider: Provider = strictGeminiJson,
): Promise<FactoryResult> {
  const excerpt = quizExcerpt(fullArticle);
  const model = v2Model();
  const key = fingerprint(articleId, title, fullArticle, customPrompt, model);
  const cached = successCache.get(key);
  if (cached) return { ...cached, audit: { ...cached.audit, requests: 0 } };
  const pending = inFlight.get(key);
  if (pending) return pending;
  // The IELTS passage the article reads like, from the passage map; reported with the result.
  let passageLevel: 1 | 2 | 3 | undefined;
  let difficultyScore: number | undefined;
  const runInner = async () => {
    const budget = new ArticleRequestBudget(MAX_ARTICLE_REQUESTS);
    const deadline = Date.now() + v2Timing.runBudgetMs;
    const timeLeft = () => Date.now() + v2Timing.requestTimeoutMs <= deadline;
    const target = targetQuestionCount(excerpt);
    if (target < 6) return result("PENDING_QUALITY", model, key, budget, null, null, 0, 0, [], ["PASSAGE_TOO_SHORT"]);
    const excerptWords = excerpt.match(/[\p{L}\p{N}]+/gu)?.length ?? 0;
    let selected = selectQuestionTypes(excerpt, excerptWords, articleId);
    let generationTokens: TokenUsage | null = null;
    let qaTokens: TokenUsage | null = null;
    let candidateCount = 0;
    let deterministicPass = 0;
    let usedModel = model;
    try {
      // Step 1: the passage map alone, a small reply.
      const { reply: mapped, model: mapModel } = await withOutageRetry((attemptModel) => provider<{ passage_map?: PassageMap; image_query?: string }>(
        MAP_SYSTEM, `TITLE: ${title}\n\nARTICLE:\n${fullArticle}`, mapSchema, budget, fetcher, 4000, attemptModel,
      ), modelOrder(model), deadline);
      usedModel = mapModel;
      generationTokens = mapped.usage;
      const passageMap = mapped.data?.passage_map as PassageMap;
      // The passage map says which IELTS passage the article reads like; the forms follow that passage's templates.
      // The 0–100 difficulty score decides; the map's style alone is the fallback when it gave no rating.
      const score = passageScore(passageMap?.difficulty, passageMap?.passage_style, fullArticle);
      difficultyScore = score ?? undefined;
      passageLevel = score !== null ? passageForScore(score) : passageLevelOf(passageMap?.passage_style);
      if (passageLevel) selected = selectQuestionTypes(excerpt, excerptWords, articleId, passageLevel, Boolean(passageMap?.writer_view?.trim()));
      const paragraphMapUsable = !validatePassageMap(passageMap, fullArticle)
        .some((issue) => issue === "PASSAGE_MAP_SCHEMA" || PARAGRAPH_MAP_ISSUES.has(issue));
      // Step 2: small batches of at most five items; an outage in one batch keeps the others.
      const questions: Candidate[] = [];
      const usedIds = new Set<string>();
      const usedGroups = new Set<string>();
      let batchOutage: unknown = null;
      const runBatch = async (index: number, types: IeltsQuestionType[], counts: number[]) => {
        const tested = questions.map((item) => item.supporting_sentence).filter(Boolean).slice(0, 20);
        try {
          const { reply } = await withOutageRetry((attemptModel) => provider<{ questions?: Candidate[] }>(
            batchSystem(types, counts, customPrompt, tested, paragraphMapUsable),
            `TITLE: ${title}\n\nARTICLE:\n${fullArticle}\n\nPASSAGE MAP (metadata, not learner content):\n${JSON.stringify(passageMap ?? {})}`,
            batchSchema(types), budget, fetcher, 6000, attemptModel,
          ), modelOrder(usedModel), deadline);
          generationTokens = addUsage(generationTokens, reply.usage);
          const items = Array.isArray(reply.data?.questions) ? reply.data.questions : [];
          questions.push(...unifyMatchingPools(separateBatch(items, index, usedIds, usedGroups).map(normalizeCandidate))
            .map((item) => withEvidenceSpans(item, fullArticle)));
        } catch (cause) {
          if (!(cause instanceof FactoryProviderError) || cause.kind !== "unavailable") throw cause;
          batchOutage = cause;
        }
      };
      // Ask for a few spare items: one rejected item must not sink a set that only just reaches six.
      const batches = planBatches(selected, typeCounts(selected, Math.min(MAX_CANDIDATES, target + spareItems(target))));
      for (const [index, batch] of batches.entries()) {
        if (!timeLeft()) break;
        await runBatch(index, batch.types, batch.counts);
      }
      // Top up within the set's own single-item forms while the checked set is short of the target plus a margin.
      const topUpForms = TOP_UP_FORMS.filter((type) => selected.includes(type));
      let passingBefore = -1;
      for (let round = 0; round < MAX_TOP_UPS && topUpForms.length && timeLeft(); round++) {
        const checked = validateGeneration({ passage_map: passageMap, questions, image_query: "" }, fullArticle, selected).valid;
        const passing = checked.length;
        // Keep a margin: blind QA and the cross-model check may still drop items.
        if (passing >= target + TOP_UP_MARGIN) break;
        // A round that added nothing means the article has no more distinct material: stop asking.
        if (round >= 2 && passing <= passingBefore) break;
        passingBefore = passing;
        const missing = Math.min(5, target + TOP_UP_MARGIN - passing);
        const passingByForm = new Map<IeltsQuestionType, number>();
        for (const item of checked) passingByForm.set(item.type, (passingByForm.get(item.type) ?? 0) + 1);
        const counts = topUpCounts(topUpForms, passingByForm, missing);
        const asked = topUpForms.filter((_, index) => counts[index] > 0);
        if (!asked.length) break;
        await runBatch(batches.length + round, asked, counts.filter((count) => count > 0));
      }
      const generated = { data: { passage_map: passageMap, questions, image_query: mapped.data?.image_query ?? "" } as Generation };
      candidateCount = questions.length;
      const structural = validateGeneration(generated.data, fullArticle, selected);
      deterministicPass = structural.valid.length;
      sampleRejected(articleId, questions, structural.issues);
      if (structural.valid.length < 6) {
        // Too few items because Google failed a batch is an outage, not an article problem.
        if (batchOutage) throw batchOutage;
        return result("PENDING_QUALITY", usedModel, key, budget, generationTokens, null,
          candidateCount, deterministicPass, [], [...structural.issues, "TOO_FEW_STRUCTURAL"]);
      }
      // QA starts with the model that answered generation.
      const { reply: reviewed } = await withOutageRetry((attemptModel) => provider<BlindReview>(
        blindQaSystem, blindQaPayload(fullArticle, structural.valid), qaSchema, budget, fetcher, 6000, attemptModel,
      ), modelOrder(usedModel), deadline);
      qaTokens = reviewed.usage;
      const qa = validateBlindReview(reviewed.data, structural.valid);
      const issues = [...qa.issues];
      const blocked = qa.issues.some((issue) => BLOCKING_QA_ISSUES.has(issue));
      // Optional quality steps get one attempt each; an outage there skips the step, never the article.
      const optional = async <T>(label: string, call: () => Promise<T>) => {
        try { return await call(); }
        catch (cause) {
          if (!(cause instanceof FactoryProviderError) || cause.kind === "configuration") throw cause;
          issues.push(`${label}_SKIPPED:${cause.kind}`);
          return null;
        }
      };
      let approved = qa.accepted;
      // Repair: while the set is short of its target, fix rejected items (up to two rounds) and QA only the fixes.
      let pending = (() => {
        const approvedIds = new Set(approved.map((item) => item.id));
        return structural.valid.filter((item) => !approvedIds.has(item.id));
      })();
      let verdicts = new Map<string, BlindVerdict | undefined>(pending.map((item) => [item.id,
        (Array.isArray(reviewed.data?.reviews) ? reviewed.data.reviews : []).find((verdict) => verdict?.id === item.id)]));
      for (let round = 0; round < MAX_REPAIR_ROUNDS && !blocked && pending.length && timeLeft()
        && selectPublished(approved, target, selected).length < target; round++) {
        const approvedIds = new Set(approved.map((item) => item.id));
        const rejected = pending;
        const repaired = await optional("REPAIR", () => provider<{ questions?: Candidate[] }>(
          repairSystem(selected, target, customPrompt), repairPayload(fullArticle, rejected, verdicts),
          repairSchema(selected), budget, fetcher, 12000, usedModel));
        if (!repaired) break;
        qaTokens = addUsage(qaTokens, repaired.usage);
        const rejectedIds = new Set(rejected.map((item) => item.id));
        const fixes = (Array.isArray(repaired.data?.questions) ? repaired.data.questions : [])
          .filter((item) => rejectedIds.has(item?.id)).map((item) => withEvidenceSpans(normalizeCandidate(item), fullArticle));
        const recheck = validateGeneration({ passage_map: generated.data.passage_map, questions: [...approved, ...fixes], image_query: "" },
          fullArticle, selected);
        const fixed = recheck.valid.filter((item) => !approvedIds.has(item.id));
        issues.push(`REPAIR:${fixed.length}/${rejected.length}`);
        const fixReview = fixed.length && timeLeft() ? await optional("REPAIR_QA", () => provider<BlindReview>(
          blindQaSystem, blindQaPayload(fullArticle, fixed), qaSchema, budget, fetcher, 6000, alternateV2Model(usedModel))) : null;
        if (!fixReview) break;
        qaTokens = addUsage(qaTokens, fixReview.usage);
        const fixedIds = new Set(validateBlindReview(fixReview.data, fixed).accepted.map((item) => item.id));
        approved = recheck.valid.filter((item) => approvedIds.has(item.id) || fixedIds.has(item.id));
        // The next round works on the fixes QA still rejected, with that QA's reasons.
        pending = fixed.filter((item) => !fixedIds.has(item.id));
        verdicts = new Map(pending.map((item) => [item.id,
          (Array.isArray(fixReview.data?.reviews) ? fixReview.data.reviews : []).find((verdict) => verdict?.id === item.id)]));
      }
      let chosen = selectPublished(approved, target, selected);
      // Cross QA: a second model must independently agree on every risky item that would be published.
      // A Choose TWO question is checked whole: the examiner needs both of its items.
      const riskyGroups = new Set(chosen.filter(riskyItem).map((item) => item.group_id));
      const risky = chosen.filter((item) => riskyItem(item) || (item.type === "mcq_multiple" && riskyGroups.has(item.group_id)));
      if (!blocked && risky.length && timeLeft()) {
        const cross = await optional("CROSS_QA", () => provider<BlindReview>(
          blindQaSystem, blindQaPayload(fullArticle, risky), qaSchema, budget, fetcher, 6000, alternateV2Model(usedModel)));
        if (cross) {
          qaTokens = addUsage(qaTokens, cross.usage);
          const agreed = new Set(validateBlindReview(cross.data, risky).accepted.map((item) => item.id));
          const dropped = new Set(risky.filter((item) => !agreed.has(item.id)).map((item) => item.id));
          if (dropped.size) {
            issues.push(`CROSS_QA_DROPPED:${dropped.size}`);
            chosen = selectPublished(approved.filter((item) => !dropped.has(item.id)), target, selected);
          }
        }
      }
      const skills = new Set(chosen.map((item) => item.skill));
      const areas = new Set(chosen.map((item) => item.supporting_sentence));
      const direct = chosen.filter((item) => item.difficulty === "P1").length;
      // Per-item rejections only drop that item; these gates decide whether the set is publishable.
      const gates: string[] = [];
      if (blocked) gates.push("QA_BLOCKED");
      if (chosen.length < 6) gates.push("TOO_FEW_APPROVED");
      // Like an IELTS passage, a set has two or three forms, each a full block.
      const blockSizes = [...new Set(chosen.map((item) => item.type))].map((type) => chosen.filter((item) => item.type === type).length);
      if (blockSizes.length < 2) gates.push("ONE_FORM");
      if (blockSizes.some((size) => size < MIN_BLOCK)) gates.push("SHORT_BLOCK");
      if (direct > directLimit(chosen.length)) gates.push("TOO_MANY_DIRECT");
      if (skills.size < 2 || areas.size < 2) gates.push("LOW_DIVERSITY");
      issues.push(...gates);
      const state = gates.length ? "PENDING_QUALITY" : "READY";
      const output = result(state, usedModel, key, budget, generationTokens, qaTokens,
        candidateCount, deterministicPass, chosen, [...structural.issues, ...issues], generated.data.image_query);
      if (state === "READY") {
        if (successCache.size >= MAX_CACHE) successCache.delete(successCache.keys().next().value!);
        successCache.set(key, output);
      }
      return output;
    } catch (cause) {
      const kind = cause instanceof FactoryProviderError ? cause.kind : "provider";
      return result(kind === "quota" ? "PENDING_QUOTA" : "PENDING_PROVIDER",
        usedModel, key, budget, generationTokens, qaTokens, candidateCount, deterministicPass,
        [], [cause instanceof Error ? cause.message : "Unknown provider failure"], "",
        { reason: providerReasons[kind], retryAfterMs: cause instanceof FactoryProviderError ? cause.retryAfterMs : null });
    }
  };
  const run = async (): Promise<FactoryResult> => {
    const output = await runInner();
    return passageLevel ? { ...output, passageLevel, ...(difficultyScore !== undefined ? { passageScore: difficultyScore } : {}) } : output;
  };
  const promise = run();
  inFlight.set(key, promise);
  try { return await promise; }
  finally { inFlight.delete(key); }
}
