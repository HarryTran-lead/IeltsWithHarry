"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ExternalLink, RefreshCcw, Search, Sparkles, Trash2, Unlock, X } from "lucide-react";
import { AdminCardHead, AdminNotice, AdminStat } from "./admin-ui";
import {
  FREE_TIER_RPD_REFERENCE, attemptKindLabel, attemptKindLabels, attemptStatusLabels, humanizeAttempt, matchesPipeline,
  pipelineFilters, quizStateLabels, usageKeyLabels,
  type PipelineAction, type PipelineArticle, type PipelineFilter, type QuizState, type UsageSummary,
} from "@/lib/news/admin-pipeline";
import { typeLabels } from "@/lib/news/practice-stats";
import { LoadingBlock } from "@/components/layout/loading-block";

function when(value: string | null | undefined) {
  return value ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "—";
}
async function readJson<T>(response: Response): Promise<T> {
  const data = await response.json().catch(() => ({})) as T & { error?: string; message?: string };
  if (!response.ok) throw new Error(data.error ?? data.message ?? "Không đọc được dữ liệu.");
  return data;
}
function message(cause: unknown, fallback: string) { return cause instanceof Error ? cause.message : fallback; }

const quizTone: Record<QuizState, string> = { ready: "ok", running: "info", waiting: "warn", held: "bad", queued: "muted", short: "muted" };
function Badge({ tone, children, title }: { tone: string; children: React.ReactNode; title?: string }) {
  return <span className={`np-badge is-${tone}`} title={title}>{children}</span>;
}
function Check({ ok, label, detail }: { ok: boolean; label: string; detail?: string }) {
  return <Badge tone={ok ? "ok" : "muted"} title={detail}>{ok ? "✓" : "—"} {label}</Badge>;
}

type Usage = {
  pacificToday: string; tracking: boolean; today: UsageSummary[];
  calls: { day: string; ok: number; unavailable: number; quota: number; error: number }[];
  trend: { day: string; articles: number; hot: number; quizzes: number }[];
};
type Detail = {
  article: { id: string; title: string; publisher: string; canonical_url: string; published_at: string };
  quiz: { model: string; generated_at: string; question_count: number } | null;
  archive: { archived_at: string; question_count: number; model: string } | null;
  questions: { id: string; sort_order: number; question_type: string; prompt: string; options: string[]; supporting_sentence: string;
    key: { correct_index: number | null; accepted_answers: string[] | null; explanation: string; option_notes: string[] | null } | null }[];
  vocabulary: { word: string; part_of_speech: string; meaning_vi: string; example: string }[];
  translation: { model: string | null; updated_at: string | null; retry_after: string | null; paragraphs: { en: string; vi: string | null }[] };
  words: number;
};

/** Gemini calls per key today and the last seven days of articles and quizzes. */
function UsagePanel({ usage }: { usage: Usage | null }) {
  if (!usage) return null;
  return <section className="card admin-news-panel">
    <AdminCardHead title="Request Gemini hôm nay" description={`Ngày tính hạn mức của Google (giờ Thái Bình Dương): ${usage.pacificToday}. Tham khảo Free Tier: khoảng ${FREE_TIER_RPD_REFERENCE} request/ngày cho mỗi model, mỗi khóa; con số chính xác xem trong Google AI Studio.`}/>
    {!usage.tracking && <AdminNotice tone="info">Bắt đầu đếm từ bản cập nhật này; các lượt gọi trước đó không có số liệu.</AdminNotice>}
    <div className="admin-stats-row">
      {usage.today.length ? usage.today.map((row) => <AdminStat key={row.key} label={usageKeyLabels[row.key]} value={row.total}
        tone={row.unavailable + row.quota + row.error > row.ok ? "coral" : "teal"}
        hint={<>Thành công {row.ok} · quá tải {row.unavailable} · hết hạn mức {row.quota} · lỗi khác {row.error}<br/>{row.models.map((model) => `${model.model}: ${model.total}`).join(" · ")}</>}/>)
        : <AdminStat label="Hôm nay" value={0} hint="Chưa có lượt gọi Gemini nào."/>}
    </div>
    <div className="np-trend">
      <div className="admin-table-wrap"><table className="admin-data-table np-small-table">
        <thead><tr><th>Ngày (giờ VN)</th><th>Bài xuất bản</th><th>Tin hot</th><th>Quiz mới</th></tr></thead>
        <tbody>{usage.trend.map((day) => <tr key={day.day}><td>{day.day}</td><td>{day.articles}</td><td>{day.hot}</td><td>{day.quizzes}</td></tr>)}</tbody>
      </table></div>
      {usage.calls.length > 0 && <div className="admin-table-wrap"><table className="admin-data-table np-small-table">
        <thead><tr><th>Ngày (giờ Google)</th><th>Thành công</th><th>Quá tải</th><th>Hết hạn mức</th><th>Lỗi khác</th></tr></thead>
        <tbody>{usage.calls.map((day) => <tr key={day.day}><td>{day.day}</td><td>{day.ok}</td><td>{day.unavailable}</td><td>{day.quota}</td><td>{day.error}</td></tr>)}</tbody>
      </table></div>}
    </div>
  </section>;
}

/** Everything the background jobs produced for one article, with admin actions. */
function ArticleDetail({ id, onClose, act, busy }: { id: string; onClose: () => void; act: (action: PipelineAction, articleId: string, questionId?: string) => Promise<boolean>; busy: boolean }) {
  const [detail, setDetail] = useState<Detail | null>(null);
  const [tab, setTab] = useState<"quiz" | "translation" | "vocabulary">("quiz");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    try { setDetail(await readJson<Detail>(await fetch(`/api/news/admin-pipeline?view=article&id=${id}`, { cache: "no-store" }))); }
    catch (cause) { setError(message(cause, "Không đọc được bài.")); }
  }, [id]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  async function run(action: PipelineAction, questionId?: string) { if (await act(action, id, questionId)) await load(); }
  if (error) return <section className="card admin-news-panel"><AdminNotice tone="error">{error}</AdminNotice></section>;
  if (!detail) return <section className="card admin-news-panel"><LoadingBlock label="Đang tải chi tiết bài…"/></section>;
  const translated = detail.translation.paragraphs.filter((part) => part.vi).length;
  return <section className="card admin-news-panel np-detail" aria-label="Chi tiết bài">
    <div className="np-detail-head">
      <div><h3>{detail.article.title}</h3>
        <small>{detail.article.publisher} · {when(detail.article.published_at)} · {detail.words} từ · <a href={detail.article.canonical_url} target="_blank" rel="noopener noreferrer">Nguồn gốc <ExternalLink size={12}/></a></small></div>
      <button type="button" className="button subtle" onClick={onClose} aria-label="Đóng chi tiết"><X size={15}/></button>
    </div>
    <div className="admin-chips" role="tablist">
      <button type="button" role="tab" aria-selected={tab === "quiz"} className={tab === "quiz" ? "active" : ""} onClick={() => setTab("quiz")}>Quiz ({detail.questions.length})</button>
      <button type="button" role="tab" aria-selected={tab === "translation"} className={tab === "translation" ? "active" : ""} onClick={() => setTab("translation")}>Bản dịch ({translated}/{detail.translation.paragraphs.length})</button>
      <button type="button" role="tab" aria-selected={tab === "vocabulary"} className={tab === "vocabulary" ? "active" : ""} onClick={() => setTab("vocabulary")}>Từ vựng ({detail.vocabulary.length})</button>
    </div>
    {tab === "quiz" && <>
      <div className="np-detail-actions">
        {detail.quiz ? <>
          <span>{detail.quiz.question_count} câu · {detail.quiz.model} · tạo lúc {when(detail.quiz.generated_at)}</span>
          <button type="button" className="button subtle" disabled={busy} onClick={() => void run("quiz_remove")}><Trash2 size={14}/> Gỡ cả bộ</button>
        </> : <>
          <span>Bài chưa có quiz.{detail.archive ? ` Bản đã gỡ: ${detail.archive.question_count} câu, lưu lúc ${when(detail.archive.archived_at)}.` : ""}</span>
          <button type="button" className="button primary" disabled={busy} onClick={() => void run("quiz_now")}><Sparkles size={14}/> {busy ? "Đang tạo… (tới 2 phút)" : "Tạo quiz ngay"}</button>
          <button type="button" className="button subtle" disabled={busy} onClick={() => void run("quiz_unlock")}><Unlock size={14}/> Mở khóa cho lịch tự động</button>
        </>}
      </div>
      <ol className="np-questions">{detail.questions.map((question) => <li key={question.id}>
        <div className="np-question-head"><small>{typeLabels[question.question_type as keyof typeof typeLabels] ?? question.question_type}</small>
          <button type="button" className="button subtle" disabled={busy} onClick={() => void run("question_remove", question.id)} title="Gỡ câu này khỏi bộ quiz">Gỡ câu</button></div>
        <strong>{question.prompt}</strong>
        {question.options.length > 0 ? <ul>{question.options.map((option, index) => <li key={index} className={index === question.key?.correct_index ? "is-correct" : ""}>
          {option}{index === question.key?.correct_index ? " ✓" : ""}{question.key?.option_notes?.[index] && <small> — {question.key.option_notes[index]}</small>}</li>)}</ul>
          : <p>Đáp án: <b>{question.key?.accepted_answers?.join(" / ") ?? "—"}</b></p>}
        <p className="np-evidence">Dẫn chứng: “{question.supporting_sentence}”</p>
        {question.key?.explanation && <p>{question.key.explanation}</p>}
      </li>)}</ol>
    </>}
    {tab === "translation" && <>
      <div className="np-detail-actions">
        <span>{detail.translation.updated_at ? `Dịch bằng ${detail.translation.model ?? "Gemini"} lúc ${when(detail.translation.updated_at)}` : detail.translation.retry_after ? `Đang dịch dở, thử tiếp sau ${when(detail.translation.retry_after)}` : "Chưa có bản dịch."}</span>
        <button type="button" className="button subtle" disabled={busy} onClick={() => void run("translation_reset")}><RefreshCcw size={14}/> Dịch lại</button>
      </div>
      <div className="np-translation">{detail.translation.paragraphs.map((part, index) => <div key={index}><p>{part.en}</p><p className={part.vi ? "" : "is-missing"}>{part.vi ?? "Chưa dịch"}</p></div>)}</div>
    </>}
    {tab === "vocabulary" && <>
      <div className="np-detail-actions">
        <span>{detail.vocabulary.length ? `${detail.vocabulary.length} từ khóa` : "Chưa có từ vựng."}</span>
        <button type="button" className="button subtle" disabled={busy} onClick={() => void run("vocabulary_reset")}><RefreshCcw size={14}/> Chọn lại từ vựng</button>
      </div>
      <div className="admin-table-wrap"><table className="admin-data-table">
        <thead><tr><th>Từ</th><th>Loại</th><th>Nghĩa</th><th>Ví dụ</th></tr></thead>
        <tbody>{detail.vocabulary.map((word) => <tr key={word.word}><td><strong>{word.word}</strong></td><td>{word.part_of_speech}</td><td>{word.meaning_vi}</td><td className="is-muted">{word.example}</td></tr>)}</tbody>
      </table></div>
    </>}
  </section>;
}

const confirmText: Partial<Record<PipelineAction, string>> = {
  quiz_remove: "Gỡ cả bộ quiz của bài này? Bộ cũ được lưu bản sao; lịch sử làm bài của học viên vẫn giữ nguyên.",
  question_remove: "Gỡ câu hỏi này khỏi bộ quiz?",
  translation_reset: "Xóa bản dịch hiện tại để dịch lại?",
  vocabulary_reset: "Xóa danh sách từ vựng hiện tại để chọn lại?",
  quiz_now: "Tạo quiz ngay cho bài này? Lượt này dùng khoảng 5–10 request Gemini và bỏ qua giới hạn hằng ngày.",
};

/** In-depth Daily News management: every article's image, quiz, translation and vocabulary. */
export function AdminNewsPipeline() {
  const [articles, setArticles] = useState<PipelineArticle[] | null>(null);
  const [usage, setUsage] = useState<Usage | null>(null);
  const [filter, setFilter] = useState<PipelineFilter>("all");
  const [query, setQuery] = useState("");
  const [days, setDays] = useState(7);
  const [selected, setSelected] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const [list, stats] = await Promise.all([
        fetch(`/api/news/admin-pipeline?view=list&days=${days}`, { cache: "no-store" }).then((response) => readJson<{ articles: PipelineArticle[] }>(response)),
        fetch("/api/news/admin-pipeline?view=usage", { cache: "no-store" }).then((response) => readJson<Usage>(response)),
      ]);
      setArticles(list.articles); setUsage(stats);
    } catch (cause) { setError(message(cause, "Không đọc được dữ liệu Daily News.")); }
  }, [days]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  const act = useCallback(async (action: PipelineAction, articleId: string, questionId?: string) => {
    const prompt = confirmText[action];
    if (prompt && !window.confirm(prompt)) return false;
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/news/admin-pipeline", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action, articleId, questionId }) });
      const data = await response.json().catch(() => ({})) as { message?: string; error?: string; status?: string };
      if (!response.ok || data.status === "failed") throw new Error(humanizeAttempt(data.error ?? data.message) || "Không thực hiện được.");
      setNotice(data.message ?? "Đã xong.");
      await load();
      return true;
    } catch (cause) { setError(message(cause, "Không thực hiện được.")); await load(); return true; }
    finally { setBusy(false); }
  }, [load]);

  const counts = useMemo(() => Object.fromEntries((Object.keys(pipelineFilters) as PipelineFilter[])
    .map((key) => [key, (articles ?? []).filter((article) => matchesPipeline(article, key)).length])) as Record<PipelineFilter, number>, [articles]);
  const visible = useMemo(() => (articles ?? []).filter((article) => matchesPipeline(article, filter, query)), [articles, filter, query]);

  return <div className="np-pipeline">
    {notice && <AdminNotice tone="success">{notice}</AdminNotice>}
    {error && <AdminNotice tone="error">{error}</AdminNotice>}
    <UsagePanel usage={usage}/>
    <section className="card admin-news-panel">
      <AdminCardHead title="Bài & quy trình xử lý" count={articles ? visible.length : undefined}
        description="Mỗi bài đã xuất bản: ảnh, quiz, bản dịch và từ vựng. Bấm vào bài để xem câu hỏi, bản dịch, từ vựng và thao tác.">
        <button type="button" className="button subtle" disabled={busy} onClick={() => void load()}><RefreshCcw size={15}/> Tải lại</button>
      </AdminCardHead>
      <div className="np-toolbar">
        <label className="np-search"><Search size={15} aria-hidden="true"/><input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm theo tiêu đề, nguồn, chủ đề" aria-label="Tìm bài"/></label>
        <select value={days} onChange={(event) => setDays(Number(event.target.value))} aria-label="Khoảng thời gian">
          <option value={1}>24 giờ qua</option><option value={3}>3 ngày</option><option value={7}>7 ngày</option><option value={14}>14 ngày</option>
        </select>
      </div>
      <div className="admin-chips" role="group" aria-label="Lọc bài">
        {(Object.keys(pipelineFilters) as PipelineFilter[]).map((key) => <button type="button" key={key} className={filter === key ? "active" : ""} aria-pressed={filter === key} onClick={() => setFilter(key)}>
          {pipelineFilters[key]} <span className="np-chip-count">{counts[key]}</span></button>)}
      </div>
      {!articles ? <LoadingBlock label="Đang tải danh sách bài…"/> : visible.length === 0 ? <p className="np-empty">Không có bài nào khớp bộ lọc.</p> :
        <div className="admin-table-wrap"><table className="admin-data-table np-table">
          <thead><tr><th>Bài</th><th>Ảnh</th><th>Quiz</th><th>Dịch</th><th>Từ vựng</th><th className="is-actions">Thao tác</th></tr></thead>
          <tbody>{visible.map((article) => {
            const quizAttempt = article.attempts.find((attempt) => attempt.kind === "quiz");
            return <tr key={article.id} className={selected === article.id ? "is-selected" : ""}>
              <td><button type="button" className="np-title" onClick={() => setSelected(selected === article.id ? null : article.id)}>
                <strong>{article.title}</strong></button>
                <small>{article.hot && <Badge tone="hot">Hot</Badge>} {article.publisher} · {article.category} · {when(article.published_at)}</small></td>
              <td><Check ok={article.image} label="Ảnh"/></td>
              <td><Badge tone={quizTone[article.quizState]} title={quizAttempt?.error_message ?? undefined}>{quizStateLabels[article.quizState]}{article.quiz ? ` · ${article.quiz.count} câu` : ""}</Badge>
                {!article.quiz && quizAttempt && <small title={quizAttempt.error_message ?? undefined}>{humanizeAttempt(quizAttempt.error_message)}{article.quizState === "waiting" ? ` · thử lại ${when(article.quizRetryAt)}` : ""}</small>}</td>
              <td><Check ok={article.translation} label="Dịch"/></td>
              <td><Badge tone={article.vocabulary ? "ok" : "muted"}>{article.vocabulary ? `${article.vocabulary} từ` : "—"}</Badge></td>
              <td className="is-actions"><div className="admin-news-actions">
                <button type="button" className="button subtle" onClick={() => setSelected(selected === article.id ? null : article.id)}>{selected === article.id ? "Đóng" : "Chi tiết"}</button>
                {!article.quiz && article.quizState !== "running" && article.quizState !== "short" && <button type="button" className="button subtle" disabled={busy} onClick={() => void act("quiz_now", article.id)}><Sparkles size={13}/> Tạo quiz</button>}
                {article.quizState === "held" && <button type="button" className="button subtle" disabled={busy} onClick={() => void act("quiz_unlock", article.id)}><Unlock size={13}/> Mở khóa</button>}
              </div></td>
            </tr>;
          })}</tbody>
        </table></div>}
    </section>
    {selected && <ArticleDetail key={selected} id={selected} onClose={() => setSelected(null)} act={act} busy={busy}/>}
  </div>;
}

type LogRow = { article_id: string; kind: string; status: string; attempted_at: string; retry_after: string; error_message: string | null; title: string; kindLabel: string; summary: string };

/** Background job log with plain-language messages and filters; the raw message stays one click away. */
export function AdminNewsJobLog() {
  const [rows, setRows] = useState<LogRow[] | null>(null);
  const [kind, setKind] = useState("");
  const [status, setStatus] = useState("");
  const [error, setError] = useState("");
  const load = useCallback(async () => {
    setError("");
    const params = new URLSearchParams({ view: "logs" });
    if (kind) params.set("kind", kind);
    if (status) params.set("status", status);
    try { setRows((await readJson<{ logs: LogRow[] }>(await fetch(`/api/news/admin-pipeline?${params}`, { cache: "no-store" }))).logs); }
    catch (cause) { setError(message(cause, "Không đọc được nhật ký.")); }
  }, [kind, status]);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);
  return <section className="card admin-news-panel">
    <div className="admin-news-head"><h3>Nhật ký ảnh, quiz, từ vựng</h3>
      <div className="np-toolbar">
        <select value={kind} onChange={(event) => setKind(event.target.value)} aria-label="Loại việc"><option value="">Mọi loại việc</option>
          {Object.entries(attemptKindLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <select value={status} onChange={(event) => setStatus(event.target.value)} aria-label="Trạng thái"><option value="">Mọi trạng thái</option>
          {Object.entries(attemptStatusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select>
        <button type="button" className="button subtle" onClick={() => void load()}><RefreshCcw size={14}/> Tải lại</button>
      </div></div>
    <p>Mỗi bài giữ lượt gần nhất của từng loại việc (300 lượt mới nhất). Lượt lỗi tự thử lại sau thời gian chờ.</p>
    {error && <AdminNotice tone="error">{error}</AdminNotice>}
    {!rows ? <LoadingBlock label="Đang tải nhật ký…"/> : !rows.length ? <p>Không có lượt nào khớp bộ lọc.</p> :
      <div className="admin-table-wrap"><table className="admin-data-table">
        <thead><tr><th>Thời gian</th><th>Việc</th><th>Bài</th><th>Kết quả</th><th>Thử lại</th></tr></thead>
        <tbody>{rows.map((row) => <tr key={`${row.article_id}-${row.kind}`}>
          <td>{when(row.attempted_at)}</td>
          <td>{attemptKindLabel(row.kind)}</td>
          <td><strong>{row.title}</strong></td>
          <td><Badge tone={row.status === "success" ? "ok" : row.status === "error" ? "bad" : row.status === "running" ? "info" : "muted"}>{attemptStatusLabels[row.status] ?? row.status}</Badge>
            {row.summary && <small>{row.summary}</small>}
            {row.error_message && row.summary !== row.error_message && <details><summary>Chi tiết gốc</summary><code>{row.error_message}</code></details>}</td>
          <td className="is-muted">{row.status === "success" ? "—" : when(row.retry_after)}</td>
        </tr>)}</tbody>
      </table></div>}
  </section>;
}
