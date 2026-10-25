"use client";

import { useState } from "react";
import type { createClient } from "@/lib/supabase/browser";
import type { NewsAdminSettings } from "@/lib/news/settings";

type PreviewQuestion = { type: string; prompt: string; options: string[]; correct_index: number | null; accepted_answers: string[] | null; supporting_sentence: string; explanation: string };
const typeLabels: Record<string, string> = { tfng: "True/False/Not Given", mcq: "Multiple choice", sentence_completion: "Sentence completion", short_answer: "Short answer" };

export function AdminNewsSettings({ db, settings, eligible, reload, setError, setNotice }: {
  db: ReturnType<typeof createClient>;
  settings: NewsAdminSettings | null;
  eligible: { id: string; title: string }[];
  reload: () => Promise<void>;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
}) {
  const [draft, setDraft] = useState<NewsAdminSettings | null>(settings);
  const [articleId, setArticleId] = useState("");
  const [preview, setPreview] = useState<PreviewQuestion[]>([]);
  const [busy, setBusy] = useState(false);

  async function save(event: React.FormEvent) {
    event.preventDefault(); if (!draft) return;
    setBusy(true); setError(""); setNotice("");
    const { error } = await db.from("news_admin_settings").update({
      auto_sync_enabled: draft.auto_sync_enabled,
      auto_enrich_enabled: draft.auto_enrich_enabled,
      quiz_prompt: draft.quiz_prompt.trim(),
      daily_quiz_limit: draft.daily_quiz_limit,
      daily_rewrite_limit: draft.daily_rewrite_limit,
      updated_at: new Date().toISOString(),
    }).eq("id", true);
    setBusy(false);
    if (error) { setError(error.message); return; }
    setNotice("Đã lưu cấu hình Daily News."); await reload();
  }

  async function testPrompt() {
    if (!draft || !articleId) return;
    setBusy(true); setError(""); setPreview([]);
    try {
      const response = await fetch("/api/news/quiz-preview", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articleId, prompt: draft.quiz_prompt }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error ?? "Không thể thử prompt.");
      setPreview(result.questions as PreviewQuestion[]);
      setNotice("Đã tạo bản xem trước. Câu hỏi này chưa được xuất bản.");
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể thử prompt."); }
    finally { setBusy(false); }
  }

  if (!draft) return <section className="card admin-news-panel"><h3>Cấu hình tự động</h3><p>Chưa tải được cấu hình. Hãy áp dụng migration mới rồi tải lại trang.</p></section>;
  return <div className="admin-news-settings">
    <section className="card admin-news-panel"><h3>Lịch tự động</h3><p>Cron kiểm tra RSS mỗi 30 phút và xử lý ảnh, quiz mỗi 10 phút. Tắt công tắc chỉ dừng lượt chạy theo lịch; các nút chạy thủ công vẫn dùng được.</p>
      <form className="admin-news-form" onSubmit={(event) => void save(event)}>
        <label className="admin-check wide"><input type="checkbox" checked={draft.auto_sync_enabled} onChange={(event) => setDraft({ ...draft, auto_sync_enabled: event.target.checked })}/> Tự đồng bộ nguồn tin</label>
        <label className="admin-check wide"><input type="checkbox" checked={draft.auto_enrich_enabled} onChange={(event) => setDraft({ ...draft, auto_enrich_enabled: event.target.checked })}/> Tự tìm ảnh và tạo quiz</label>
        <label>Giới hạn quiz tự tạo mỗi ngày<input type="number" min={1} max={50} value={draft.daily_quiz_limit} onChange={(event) => setDraft({ ...draft, daily_quiz_limit: Number(event.target.value) })}/></label>
        <label>Tin Việt Nam do AI viết mỗi ngày<input type="number" min={0} max={30} value={draft.daily_rewrite_limit ?? 0} onChange={(event) => setDraft({ ...draft, daily_rewrite_limit: Number(event.target.value) })}/><small>Mỗi bài tốn 3 lượt Gemini (4 nếu phải viết lại): viết bài, kiểm tra sự thật, tạo 20 câu hỏi. Đặt 0 để tắt.</small></label>
        <label className="wide">Hướng dẫn thêm cho AI<textarea rows={8} maxLength={4000} value={draft.quiz_prompt} onChange={(event) => setDraft({ ...draft, quiz_prompt: event.target.value })} placeholder="Ví dụ: Ưu tiên câu hỏi ở mức B1–B2, câu ngắn và dễ hiểu..."/><small>Luôn giữ quy tắc bắt buộc: 20 câu theo 4 dạng IELTS (6 True/False/Not Given, 6 trắc nghiệm, 4 hoàn thành câu, 4 trả lời ngắn), đáp án viết tối đa 3 từ, và dẫn chứng nguyên văn.</small></label>
        <button className="button primary" disabled={busy}>{busy ? "Đang lưu…" : "Lưu cấu hình"}</button>
      </form>
    </section>
    <section className="card admin-news-panel"><h3>Thử prompt với bài có toàn văn</h3><p>Bản thử hiển thị đáp án cho admin và không lưu vào kho bài. Lượt thử vẫn tính vào hạn mức Gemini API.</p>
      <div className="admin-news-form"><label className="wide">Chọn bài<select value={articleId} onChange={(event) => setArticleId(event.target.value)}><option value="">Chọn bài để thử</option>{eligible.map((article) => <option key={article.id} value={article.id}>{article.title}</option>)}</select></label>
        <button type="button" className="button subtle" disabled={busy || !articleId} onClick={() => void testPrompt()}>{busy ? "Đang tạo…" : "Tạo bản xem trước"}</button></div>
      {preview.length > 0 && <div className="admin-news-preview">{preview.map((question, index) => <article key={index}><small>{typeLabels[question.type] ?? question.type}</small><strong>{index + 1}. {question.prompt}</strong>{question.options.length > 0 ? <ol>{question.options.map((option, optionIndex) => <li key={optionIndex}>{option}{optionIndex === question.correct_index ? " ✓" : ""}</li>)}</ol> : <p>Đáp án: <b>{question.accepted_answers?.join(" / ")}</b></p>}<small>Dẫn chứng: {question.supporting_sentence}</small><p>{question.explanation}</p></article>)}</div>}
    </section>
  </div>;
}
