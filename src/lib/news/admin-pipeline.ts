import { parseQuizReason, quizReasonLabels } from "./question-factory-v2/operations";
import type { AiUsageKey, AiUsageOutcome } from "./ai-usage";

/** Background jobs recorded in news_enrichment_attempts. */
export const attemptKindLabels: Record<string, string> = {
  quiz: "Quiz AI",
  image: "Ảnh bìa",
  body: "Toàn văn",
  inline_image: "Ảnh giữa bài",
  real_cover_upgrade: "Đổi bìa AI sang ảnh thật",
  vocabulary: "Từ vựng",
};
export function attemptKindLabel(kind: string) { return attemptKindLabels[kind] ?? kind; }

export const attemptStatusLabels: Record<string, string> = {
  running: "Đang chạy", success: "Thành công", error: "Lỗi", none: "Không tìm thấy kết quả",
};

/** Plain Vietnamese for a stored attempt message; the raw text stays available as detail. */
export function humanizeAttempt(message: string | null | undefined): string {
  if (!message) return "";
  const ready = /^V2 READY; questions=(\d+); requests=(\d+)/.exec(message);
  if (ready) return `Tạo xong ${ready[1]} câu hỏi bằng ${ready[2]} request.`;
  if (/^V2 request budget reserved/.test(message)) return "Lượt tạo bị gián đoạn giữa chừng (máy chủ dừng trước khi ghi kết quả).";
  if (/^Admin /.test(message)) return message;
  const reason = parseQuizReason(message);
  if (reason) {
    const retry = /retry=(\d+)\/(\d+)/.exec(message);
    const requests = /requests=(\d+)/.exec(message);
    const parts = [quizReasonLabels[reason]];
    if (requests) parts.push(`${requests[1]} request`);
    if (retry) parts.push(`đã thử lại ${retry[1]}/${retry[2]} lần`);
    return parts.join(" · ");
  }
  if (/HTTP 503|high demand|UNAVAILABLE/i.test(message)) return "Gemini quá tải (503), hệ thống tự thử lại sau.";
  if (/HTTP 429|quota/i.test(message)) return "Hết hạn mức Gemini, chờ hạn mức mới.";
  if (/timed out|TimeoutError|fetch failed/i.test(message)) return "Gemini không phản hồi kịp (hết thời gian chờ).";
  if (/not configured/i.test(message)) return "Chưa cấu hình khóa Gemini cho việc này.";
  return message;
}

export type PipelineAttempt = { kind: string; status: string; attempted_at: string; retry_after: string; error_message: string | null };
export type QuizState = "ready" | "running" | "waiting" | "held" | "queued" | "short";
export type PipelineArticle = {
  id: string; title: string; publisher: string; category: string; published_at: string; provider: string;
  hot: boolean; hasBody: boolean; image: boolean; translation: boolean; vocabulary: number;
  quiz: { count: number; generated_at: string; model: string } | null;
  quizState: QuizState; quizRetryAt: string | null;
  attempts: PipelineAttempt[];
};

/** A quiz row held this far ahead is waiting for an admin rather than an automatic retry. */
export const HELD_AFTER_MS = 30 * 86400000;
const STALE_RUN_MS = 15 * 60000;

export function quizState(hasQuiz: boolean, attempt: PipelineAttempt | undefined, now = new Date()): QuizState {
  if (hasQuiz) return "ready";
  if (!attempt) return "queued";
  const retry = Date.parse(attempt.retry_after);
  if (attempt.status === "running" && Date.parse(attempt.attempted_at) > now.getTime() - STALE_RUN_MS) return "running";
  if (parseQuizReason(attempt.error_message) === "too_short") return "short";
  if (retry > now.getTime() + HELD_AFTER_MS) return "held";
  if (retry > now.getTime()) return "waiting";
  return "queued";
}
export const quizStateLabels: Record<QuizState, string> = {
  ready: "Có quiz", running: "Đang tạo", waiting: "Chờ thử lại", held: "Dừng, cần admin", queued: "Trong hàng chờ", short: "Bài quá ngắn",
};

export const pipelineFilters = {
  all: "Tất cả",
  missing_quiz: "Thiếu quiz",
  quiz_held: "Quiz dừng, cần admin",
  missing_image: "Thiếu ảnh",
  missing_translation: "Thiếu bản dịch",
  missing_vocabulary: "Thiếu từ vựng",
  hot: "Tin hot",
  complete: "Đủ ảnh + quiz",
} as const;
export type PipelineFilter = keyof typeof pipelineFilters;
export function isPipelineFilter(value: unknown): value is PipelineFilter {
  return typeof value === "string" && Object.hasOwn(pipelineFilters, value);
}

export function matchesPipeline(article: PipelineArticle, filter: PipelineFilter, query = "") {
  const text = query.trim().toLocaleLowerCase("vi");
  if (text && !`${article.title} ${article.publisher} ${article.category}`.toLocaleLowerCase("vi").includes(text)) return false;
  switch (filter) {
    case "missing_quiz": return !article.quiz && article.quizState !== "short";
    case "quiz_held": return article.quizState === "held";
    case "missing_image": return !article.image;
    case "missing_translation": return article.hasBody && !article.translation;
    case "missing_vocabulary": return article.hasBody && article.vocabulary === 0;
    case "hot": return article.hot;
    case "complete": return Boolean(article.quiz) && article.image;
    default: return true;
  }
}

export type UsageRow = { day: string; key_name: AiUsageKey; model: string; outcome: AiUsageOutcome; requests: number };
export type UsageSummary = { key: AiUsageKey; total: number; ok: number; unavailable: number; quota: number; error: number; models: { model: string; total: number }[] };
export const usageKeyLabels: Record<AiUsageKey, string> = {
  quiz: "Khóa tạo quiz (NEWS_QUIZ)",
  article: "Khóa viết bài, ảnh, dịch (NEWS_ARTICLE)",
  shared: "Khóa chung GEMINI_API_KEY",
  custom: "Khóa riêng khác",
};
/** Free Tier requests per day per model shown as a reference; Google may change it per project. */
export const FREE_TIER_RPD_REFERENCE = 500;

export function summarizeUsage(rows: UsageRow[]): UsageSummary[] {
  const byKey = new Map<AiUsageKey, UsageSummary & { modelMap: Map<string, number> }>();
  for (const row of rows) {
    const entry = byKey.get(row.key_name) ?? { key: row.key_name, total: 0, ok: 0, unavailable: 0, quota: 0, error: 0, models: [], modelMap: new Map() };
    entry.total += row.requests;
    entry[row.outcome] += row.requests;
    entry.modelMap.set(row.model, (entry.modelMap.get(row.model) ?? 0) + row.requests);
    byKey.set(row.key_name, entry);
  }
  return [...byKey.values()].map(({ modelMap, ...entry }) => ({
    ...entry, models: [...modelMap].map(([model, total]) => ({ model, total })).sort((a, b) => b.total - a.total),
  })).sort((a, b) => b.total - a.total);
}

/** Today's date in Pacific time, the day Google's daily quotas count in. */
export function pacificDay(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
}
/** Calendar day in Vietnam time (YYYY-MM-DD). */
export function vietnamDay(value: string | Date) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
}

export const pipelineActions = ["quiz_now", "quiz_unlock", "quiz_remove", "question_remove", "translation_reset", "vocabulary_reset"] as const;
export type PipelineAction = typeof pipelineActions[number];
export function isPipelineAction(value: unknown): value is PipelineAction {
  return typeof value === "string" && (pipelineActions as readonly string[]).includes(value);
}
/** Fewest questions a published set may keep after an admin removes one. */
export const MIN_QUIZ_QUESTIONS = 6;
