"use client";

import { useState, type FormEvent } from "react";
import Link from "next/link";
import { NEWS_CATEGORIES } from "@/lib/news/constants";
import { factDossierSchema } from "@/lib/news/fact-dossier-schema";

export function AdminNewsFacts() {
  const [topic, setTopic] = useState("");
  const [category, setCategory] = useState<(typeof NEWS_CATEGORIES)[number]>("Science");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [created, setCreated] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault(); setError(""); setCreated("");
    const facts = notes.split("\n").map((line) => {
      const separator = line.lastIndexOf(" | https://");
      return separator < 0 ? { claim: line.trim(), source_url: "" } : {
        claim: line.slice(0, separator).trim(), source_url: line.slice(separator + 3).trim(),
      };
    }).filter((fact) => fact.claim || fact.source_url);
    const parsed = factDossierSchema.safeParse({ topic, category, facts });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy(true);
    try {
      const response = await fetch("/api/news/fact-article", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(parsed.data) });
      const data = await response.json() as { id?: string; error?: string };
      if (!response.ok || !data.id) throw new Error(data.error ?? "Không tạo được bài.");
      setCreated(data.id);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không kết nối được dịch vụ."); }
    finally { setBusy(false); }
  }

  return <section className="card admin-news-panel"><h2>Tạo bài từ hồ sơ dữ kiện</h2>
    <p>Chỉ nhập các dữ kiện ngắn từ nguồn gốc hoặc nguồn mở được duyệt. Mỗi dòng: dữ kiện | URL HTTPS. Hệ thống đọc tối đa bốn trang nguồn để kiểm tra từng dữ kiện trước khi viết passage 520–820 từ. Không dán toàn văn, tiêu đề, đoạn trích hoặc ảnh của báo. Thiếu mười hai dữ kiện riêng biệt thì bỏ tin.</p>
    <form className="admin-news-form" onSubmit={(event) => void submit(event)}>
      <label className="wide">Chủ đề do biên tập viên đặt<input required minLength={12} maxLength={160} value={topic} onChange={(event) => setTopic(event.target.value)} /></label>
      <label>Danh mục<select value={category} onChange={(event) => setCategory(event.target.value as typeof category)}>{NEWS_CATEGORIES.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label className="wide">Các dữ kiện đã kiểm chứng<textarea required rows={14} value={notes} onChange={(event) => setNotes(event.target.value)} placeholder="NASA announced the mission launch date for 12 November 2026. | https://www.nasa.gov/..." /></label>
      <button className="button primary" disabled={busy}>{busy ? "Đang viết và kiểm duyệt…" : "Tạo bản nháp IELTS"}</button>
    </form>
    {error && <p className="form-error" role="alert">{error}</p>}
    {created && <p role="status">Đã tạo bản nháp. <Link href={`/admin/rights?kind=news_article&id=${created}`}>Lưu hồ sơ quyền</Link> · <Link href="/admin/news/review">Duyệt tin</Link></p>}
  </section>;
}
