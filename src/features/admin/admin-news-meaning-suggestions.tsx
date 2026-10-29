"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { createClient } from "@/lib/supabase/browser";

type Suggestion = {
  id: string;
  article_id: string;
  word: string;
  current_meaning: string;
  suggested_meaning: string;
  status: "pending" | "reviewed";
  created_at: string;
};

export function AdminNewsMeaningSuggestions() {
  const db = useMemo(() => createClient(), []);
  const [rows, setRows] = useState<Suggestion[]>([]);
  const [titles, setTitles] = useState<Record<string, string>>({});
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState("");

  const load = useCallback(async () => {
    try {
      const result = await db.from("news_word_meaning_suggestions")
        .select("id,article_id,word,current_meaning,suggested_meaning,status,created_at")
        .order("created_at", { ascending: false }).limit(100);
      if (result.error) throw result.error;
      const suggestions = (result.data ?? []) as Suggestion[];
      setRows(suggestions);
      const ids = [...new Set(suggestions.map((item) => item.article_id))];
      if (ids.length) {
        const articles = await db.from("news_articles").select("id,title").in("id", ids);
        if (!articles.error) setTitles(Object.fromEntries((articles.data ?? []).map((item) => [item.id, item.title])));
      }
      setError("");
    } catch {
      setError("Chưa tải được góp ý nghĩa từ. Kiểm tra kết nối và migration cơ sở dữ liệu.");
    } finally {
      setLoading(false);
    }
  }, [db]);

  useEffect(() => { void Promise.resolve().then(load); }, [load]);

  async function markReviewed(id: string) {
    setBusyId(id); setError("");
    try {
      const result = await db.from("news_word_meaning_suggestions").update({ status: "reviewed" }).eq("id", id);
      if (result.error) throw result.error;
      setRows((current) => current.map((item) => item.id === id ? { ...item, status: "reviewed" } : item));
    } catch {
      setError("Chưa đánh dấu được góp ý. Hãy thử lại.");
    } finally {
      setBusyId(null);
    }
  }

  const ordered = [...rows].sort((a, b) => Number(a.status === "reviewed") - Number(b.status === "reviewed") || b.created_at.localeCompare(a.created_at));
  return <section className="card admin-news-panel" aria-label="Góp ý nghĩa từ">
    <h3>Góp ý nghĩa từ ({rows.filter((item) => item.status === "pending").length} chờ xem)</h3>
    <p>Góp ý của học viên không tự thay đổi nghĩa hiển thị. Xem ngữ cảnh bài đọc trước khi cập nhật nội dung hoặc nguồn dịch.</p>
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading ? <p>Đang tải góp ý…</p> : ordered.length === 0 ? <p>Chưa có góp ý nào.</p> : ordered.map((item) =>
      <article className="admin-news-row" key={item.id}>
        <div><strong>{item.word} · {item.status === "pending" ? "Chờ xem" : "Đã xem"}</strong>
          <small>{new Date(item.created_at).toLocaleString("vi-VN", { dateStyle: "medium", timeStyle: "short" })} · <Link href={`/app/news/${item.article_id}`}>{titles[item.article_id] ?? "Xem bài báo"}</Link></small>
          <p>Nghĩa hiện tại: {item.current_meaning || "Chưa có"}</p><p>Đề xuất: <b>{item.suggested_meaning}</b></p>
        </div>
        {item.status === "pending" && <button type="button" className="button subtle" disabled={busyId === item.id} onClick={() => void markReviewed(item.id)}>{busyId === item.id ? "Đang lưu…" : "Đánh dấu đã xem"}</button>}
      </article>)}
  </section>;
}
