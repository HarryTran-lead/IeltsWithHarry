"use client";

import { useState } from "react";
import Link from "next/link";
import type { createClient } from "@/lib/supabase/browser";
import { NEWS_CATEGORIES } from "@/lib/news/constants";
import { manualNewsSchema } from "@/lib/news/validation";

type ManualArticle = { id: string; title: string; canonical_url: string; publisher: string; category: string; published_at: string; publication_status: string; sensitive: boolean };
type Draft = { title: string; canonical_url: string; publisher: string; category: string; published_at: string; sensitive: boolean; body_text: string; rights_basis: string };
function localDate(value: Date) { return new Date(value.getTime() - value.getTimezoneOffset() * 60000).toISOString().slice(0, 16); }
function emptyDraft(): Draft { return { title: "", canonical_url: "", publisher: "", category: "Education", published_at: localDate(new Date()), sensitive: false, body_text: "", rights_basis: "" }; }

export function AdminNewsManual({ db, articles, reload, setError, setNotice }: {
  db: ReturnType<typeof createClient>;
  articles: ManualArticle[];
  reload: () => Promise<void>;
  setError: (message: string) => void;
  setNotice: (message: string) => void;
}) {
  const [selected, setSelected] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft>(emptyDraft);
  const [busy, setBusy] = useState(false);

  async function select(article: ManualArticle) {
    setSelected(article.id); setError("");
    const { data, error } = await db.from("news_article_bodies").select("body_text,rights_basis").eq("article_id", article.id).maybeSingle();
    if (error) { setError(error.message); return; }
    setDraft({ title: article.title, canonical_url: article.canonical_url, publisher: article.publisher,
      category: article.category, published_at: localDate(new Date(article.published_at)), sensitive: article.sensitive,
      body_text: data?.body_text ?? "", rights_basis: data?.rights_basis ?? "" });
  }

  async function save(event: React.FormEvent) {
    event.preventDefault(); setError(""); setNotice("");
    const publication = new Date(draft.published_at);
    if (Number.isNaN(publication.valueOf())) { setError("Ngày đăng không hợp lệ."); return; }
    const parsed = manualNewsSchema.safeParse({ ...draft, published_at: publication.toISOString() });
    if (!parsed.success) { setError(parsed.error.issues[0].message); return; }
    setBusy(true);
    const { data, error } = await db.rpc("admin_save_manual_news", {
      p_id: selected, p_title: parsed.data.title, p_url: parsed.data.canonical_url,
      p_publisher: parsed.data.publisher, p_category: parsed.data.category,
      p_published_at: parsed.data.published_at, p_sensitive: parsed.data.sensitive,
      p_body: parsed.data.body_text, p_rights_basis: parsed.data.rights_basis,
    });
    setBusy(false);
    if (error) { setError(error.message); return; }
    const wasPublished = selected && articles.some((article) => article.id === selected && article.publication_status === "published");
    setSelected(data as string);
    setNotice(wasPublished ? "Đã cập nhật tin đang xuất bản. Quiz cũ đã được xóa để tạo lại." : "Đã lưu tin thủ công. Duyệt và xuất bản trong mục Duyệt tin.");
    await reload();
  }

  return <div className="admin-news-articles"><section className="card admin-news-panel"><div className="admin-news-head"><h3>Tin thêm thủ công</h3><button className="button primary" onClick={() => { setSelected(null); setDraft(emptyDraft()); }}>+ Tin mới</button></div>
    {articles.map((article) => <button className={`admin-news-article-item ${selected === article.id ? "selected" : ""}`} key={article.id} onClick={() => void select(article)}><span><strong>{article.title}</strong><small>{article.publication_status} · {new Date(article.published_at).toLocaleDateString("vi-VN")}</small></span></button>)}
    {!articles.length && <p>Chưa có tin nào được thêm thủ công.</p>}</section>
    <section className="card admin-news-panel"><h3>{selected ? "Sửa tin thủ công" : "Thêm tin Daily News"}</h3><p>Thêm đường dẫn nguồn và metadata để đưa vào kho tin. Chỉ nhập toàn văn khi bạn có quyền sử dụng; bản mới luôn chờ duyệt.</p>
      <form className="admin-news-form" onSubmit={(event) => void save(event)}>
        <label className="wide">Tiêu đề<input required minLength={5} maxLength={400} value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })}/></label>
        <label className="wide">URL bài gốc (HTTPS)<input type="url" required value={draft.canonical_url} onChange={(event) => setDraft({ ...draft, canonical_url: event.target.value })}/></label>
        <label>Nhà xuất bản / tác giả<input required value={draft.publisher} onChange={(event) => setDraft({ ...draft, publisher: event.target.value })}/></label>
        <label>Ngày đăng<input type="datetime-local" required value={draft.published_at} onChange={(event) => setDraft({ ...draft, published_at: event.target.value })}/></label>
        <label>Danh mục<select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })}>{NEWS_CATEGORIES.map((category) => <option key={category}>{category}</option>)}</select></label>
        <label className="admin-check"><input type="checkbox" checked={draft.sensitive} onChange={(event) => setDraft({ ...draft, sensitive: event.target.checked })}/> Nội dung nhạy cảm (giữ để duyệt)</label>
        <label className="wide">Toàn văn được phép dùng (không bắt buộc)<textarea rows={12} maxLength={50000} value={draft.body_text} onChange={(event) => setDraft({ ...draft, body_text: event.target.value })}/></label>
        {draft.body_text.trim() && <label className="wide">Căn cứ quyền dùng toàn văn<textarea required rows={3} minLength={30} value={draft.rights_basis} onChange={(event) => setDraft({ ...draft, rights_basis: event.target.value })} placeholder="Nêu rõ bạn là tác giả, hoặc ghi giấy phép và phạm vi sử dụng..."/></label>}
        <div className="admin-news-actions wide"><button className="button primary" disabled={busy}>{busy ? "Đang lưu…" : "Lưu tin chờ duyệt"}</button>{selected && <Link className="button subtle" href="/admin/news/review">Đến hàng chờ duyệt</Link>}</div>
      </form>
    </section>
  </div>;
}
