"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { RefreshCcw, Unlock } from "lucide-react";
import { AdminNotice } from "./admin-ui";
import { quizReasonLabels, type QuizHealth } from "@/lib/news/question-factory-v2/operations";

function when(value: string | null) {
  return value ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value)) : "Chưa có";
}

/** Status of the scheduled V2 quiz worker: alerts, pause state, today's usage and articles waiting for an admin. */
export function AdminNewsQuizHealth({ compact = false }: { compact?: boolean }) {
  const [health, setHealth] = useState<QuizHealth | null>(null);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/news/quiz-health", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Không đọc được trạng thái tạo quiz.");
      setHealth(data as QuizHealth);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không đọc được trạng thái tạo quiz."); }
  }, []);
  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function release(articleIds: string[] | "all") {
    setBusy(true); setError(""); setNotice("");
    try {
      const response = await fetch("/api/news/quiz-health", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify(articleIds === "all" ? { all: true } : { articleIds }) });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error ?? "Không mở khóa được.");
      setNotice(`Đã mở khóa ${data.released} bài. Lịch tự động sẽ thử lại từng bài mỗi 10 phút, trong giới hạn hằng ngày.`);
      await load();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không mở khóa được."); }
    finally { setBusy(false); }
  }

  if (!health) return error ? <AdminNotice tone="error">{error}</AdminNotice> : null;
  const failures = Object.entries(health.today.failures)
    .map(([reason, count]) => `${quizReasonLabels[reason as keyof typeof quizReasonLabels] ?? reason}: ${count}`).join(" · ");
  const alerts = health.alerts.map((alert) => <AdminNotice key={alert.code} tone={alert.tone}>{alert.message}</AdminNotice>);
  if (compact) {
    const urgent = health.alerts.filter((alert) => alert.tone !== "info");
    return urgent.length ? <div className="admin-news-quiz-alerts">{urgent.map((alert) => <AdminNotice key={alert.code} tone={alert.tone}>
      Quiz Daily News: {alert.message} <Link prefetch={false} href="/admin/news">Xem chi tiết</Link></AdminNotice>)}</div> : null;
  }

  return <section className="card admin-news-panel admin-news-quiz-health">
    <h3>Tình trạng tạo quiz tự động</h3>
    {alerts}
    {health.status === "ok" && <AdminNotice tone="success">Đang hoạt động bình thường.</AdminNotice>}
    {notice && <AdminNotice tone="success">{notice}</AdminNotice>}
    {error && <AdminNotice tone="error">{error}</AdminNotice>}
    <p>
      Bộ tạo: {health.factory.v2Enabled ? `Question Factory V2 · ${health.factory.model}` : "bộ tạo cũ"} · Free Tier: {health.factory.freeTierReady ? "đã xác nhận" : "chưa cấu hình"}
      {" · "}Lịch tự động: {health.factory.autoEnrich ? "bật" : "tắt"}
    </p>
    <p>
      Quiz V2 gần nhất: <b>{when(health.lastV2Success)}</b> · Bài chờ tạo quiz: <b>{health.backlog}</b> · Đang chờ tự thử lại: <b>{health.waitingRetry}</b>
    </p>
    <p>
      Hôm nay đã dùng <b>{health.today.counted}/{health.today.limit}</b> lượt hạn mức (lượt Gemini quá tải, hết hạn mức hoặc lỗi cấu hình không bị tính).
      {failures && <><br/>Lỗi trong ngày: {failures}</>}
    </p>
    <p>Tự ngắt: {health.breaker.open && health.breaker.until ? `đang tạm dừng đến ${when(health.breaker.until)}` : "không kích hoạt"}</p>
    <div className="admin-news-actions">
      <button type="button" className="button subtle" disabled={busy} onClick={() => void load()}><RefreshCcw size={15}/> Tải lại</button>
      {health.held.length > 0 && <button type="button" className="button subtle" disabled={busy} onClick={() => void release("all")}><Unlock size={15}/> Mở khóa tất cả ({health.held.length})</button>}
    </div>
    {health.held.length > 0 && <>
      <h4>Bài đang dừng tạo quiz</h4>
      <p>Các bài này đã hết lượt tự thử lại hoặc gặp lỗi cần người xem. Mở khóa cho phép lịch tự động thử lại một lần nữa.</p>
      {health.held.map((item) => <article className="admin-news-row" key={item.article_id}>
        <div><strong>{item.title}</strong>
          <small>{item.reason ? quizReasonLabels[item.reason] : "Cần xem lại"} · {when(item.attempted_at)}</small>
          {item.error_message && <p className="form-error">{item.error_message}</p>}</div>
        <div className="admin-news-actions"><button type="button" className="button subtle" disabled={busy} onClick={() => void release([item.article_id])}>Mở khóa</button></div>
      </article>)}
    </>}
  </section>;
}
