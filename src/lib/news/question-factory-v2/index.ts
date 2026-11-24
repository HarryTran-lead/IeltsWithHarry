import { createHash } from "node:crypto";
import { quizExcerpt } from "../enrichment";
import { selectQuestionTypes, targetQuestionCount, type AdaptiveQuestion } from "../adaptive-quiz";
import type { Candidate, FactoryResult, Generation, BlindReview, QuizFailureReason, TokenUsage } from "./types";
import { FACTORY_VERSION } from "./types";
import { ArticleRequestBudget, FactoryProviderError, alternateV2Model, strictGeminiJson, v2Model, type FactoryProviderKind } from "./provider";
import { blindQaPayload, blindQaSystem, generationPrompt, generationSchema, qaSchema } from "./prompts";
import { validateBlindReview, validateGeneration } from "./validate";

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
function toLegacy(item: Candidate): AdaptiveQuestion {
  return {
    type: item.type, prompt: item.prompt, options: item.options,
    correct_index: item.correct_index < 0 ? null : item.correct_index,
    accepted_answers: item.correct_index < 0 ? [item.answer] : null,
    supporting_sentence: item.supporting_sentence,
    explanation: item.explanation,
    option_notes: item.correct_index < 0 ? null : item.option_notes,
  };
}
function selectPublished(items: Candidate[], target: number) {
  const groups = new Map<string, Candidate[]>();
  for (const item of items) groups.set(item.group_id, [...(groups.get(item.group_id) ?? []), item]);
  const selected: Candidate[] = [];
  // Whole groups are atomic; never publish a broken matching, note or flow set.
  for (const group of groups.values()) {
    const type = group[0].type;
    if ((type.startsWith("matching_") || ["summary_completion", "note_completion", "table_completion", "flow_chart_completion"].includes(type))
      && group.length < 2) continue;
    if (type === "matching_headings" && group[0].options.length <= group.length) continue;
    if (type === "flow_chart_completion"
      && group.some((item, index) => !new RegExp(`^Step ${index + 1}:`, "i").test(item.prompt))) continue;
    if (selected.length + group.length > target) continue;
    selected.push(...group);
  }
  return selected;
}
function result(state: FactoryResult["state"], model: string, fingerprintValue: string,
  budget: ArticleRequestBudget, generationTokens: TokenUsage | null, qaTokens: TokenUsage | null,
  candidates: number, deterministic: number, accepted: Candidate[], issues: string[], imageQuery = "",
  providerFailure: { reason: QuizFailureReason; retryAfterMs: number | null } | null = null): FactoryResult {
  const failure: QuizFailureReason | null = state === "READY" ? null : providerFailure?.reason
    ?? (issues.includes("PASSAGE_TOO_SHORT") ? "too_short" : "quality");
  return {
    state, model, questions: state === "READY" ? accepted.map(toLegacy) : [],
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
/** Generation and blind QA, each up to 3 attempts on two models. */
export const MAX_ARTICLE_REQUESTS = 2 * 2 * OUTAGE_ATTEMPTS_PER_MODEL;
/** Retry pauses grow from the base delay; no retry starts unless a full request still fits the run budget. */
export const v2Timing = { outageRetryDelayMs: 1000, runBudgetMs: 120_000, requestTimeoutMs: 46_000 };

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
 * One generation and one independent blind QA. A Google outage at either step is retried like the legacy
 * generator (3 attempts per model, then the other Flash-Lite model) within MAX_ARTICLE_REQUESTS.
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
  const run = async () => {
    const budget = new ArticleRequestBudget(MAX_ARTICLE_REQUESTS);
    const deadline = Date.now() + v2Timing.runBudgetMs;
    const target = targetQuestionCount(excerpt);
    if (target < 6) return result("PENDING_QUALITY", model, key, budget, null, null, 0, 0, [], ["PASSAGE_TOO_SHORT"]);
    const selected = selectQuestionTypes(excerpt, excerpt.match(/[\p{L}\p{N}]+/gu)?.length ?? 0, articleId);
    let generationTokens: TokenUsage | null = null;
    let qaTokens: TokenUsage | null = null;
    let candidateCount = 0;
    let deterministicPass = 0;
    let usedModel = model;
    try {
      const { reply: generated, model: generationModel } = await withOutageRetry((attemptModel) => provider<Generation>(
        generationPrompt(selected, target, customPrompt),
        `TITLE: ${title}\n\nARTICLE:\n${fullArticle}`,
        generationSchema(selected), budget, fetcher, 16000, attemptModel,
      ), modelOrder(model), deadline);
      usedModel = generationModel;
      generationTokens = generated.usage;
      candidateCount = Array.isArray(generated.data?.questions) ? generated.data.questions.length : 0;
      const structural = validateGeneration(generated.data, fullArticle, selected);
      deterministicPass = structural.valid.length;
      if (structural.valid.length < 6)
        return result("PENDING_QUALITY", usedModel, key, budget, generationTokens, null,
          candidateCount, deterministicPass, [], [...structural.issues, "TOO_FEW_STRUCTURAL"]);
      // QA starts with the model that answered generation.
      const { reply: reviewed } = await withOutageRetry((attemptModel) => provider<BlindReview>(
        blindQaSystem, blindQaPayload(fullArticle, structural.valid), qaSchema, budget, fetcher, 6000, attemptModel,
      ), modelOrder(usedModel), deadline);
      qaTokens = reviewed.usage;
      const qa = validateBlindReview(reviewed.data, structural.valid);
      const chosen = selectPublished(qa.accepted, target);
      const skills = new Set(chosen.map((item) => item.skill));
      const areas = new Set(chosen.map((item) => item.supporting_sentence));
      const direct = chosen.filter((item) => item.difficulty === "P1").length;
      const issues = [...qa.issues];
      if (chosen.length < 6) issues.push("TOO_FEW_APPROVED");
      if (direct > Math.floor(chosen.length / 4)) issues.push("TOO_MANY_DIRECT");
      if (skills.size < 2 || areas.size < 2) issues.push("LOW_DIVERSITY");
      const state = issues.length ? "PENDING_QUALITY" : "READY";
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
  const promise = run();
  inFlight.set(key, promise);
  try { return await promise; }
  finally { inFlight.delete(key); }
}
