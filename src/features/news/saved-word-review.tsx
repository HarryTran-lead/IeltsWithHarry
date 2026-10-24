"use client";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { useNotebook } from "@/features/notebook/notebook-store";
import { demoMode } from "@/lib/runtime";
import { nextWordReview, type ReviewGrade, type WordReview } from "@/lib/news/review";

const storageKey = "english-skill-lab-word-reviews-v1";
export function SavedWordReview() {
  const { entries } = useNotebook();
  const db = useMemo(() => demoMode ? null : createClient(), []);
  const [reviews, setReviews] = useState<WordReview[]>([]);
  const [revealed, setRevealed] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { void (async () => {
    if (demoMode) { try { setReviews(JSON.parse(localStorage.getItem(storageKey) ?? "[]") as WordReview[]); } catch { setReviews([]); } return; }
    const result = await db!.from("user_word_reviews").select("notebook_entry_id,due_at,interval_days,repetitions,last_reviewed_at").limit(1000);
    if (result.error) setError(result.error.message); else setReviews((result.data ?? []) as WordReview[]);
  })(); }, [db]);
  const words = entries.filter((entry) => entry.kind === "word");
  const due = words.filter((entry) => { const review = reviews.find((row) => row.notebook_entry_id === entry.id); return !review || new Date(review.due_at).valueOf() <= now; });
  const current = due[0];
  async function grade(value: ReviewGrade) {
    if (!current) return;
    const before = reviews.find((row) => row.notebook_entry_id === current.id);
    const updated: WordReview = { notebook_entry_id: current.id, ...nextWordReview(before, value, new Date()) };
    if (demoMode) {
      const next = [...reviews.filter((row) => row.notebook_entry_id !== current.id), updated];
      localStorage.setItem(storageKey, JSON.stringify(next)); setReviews(next);
    } else {
      const response = before ? await db!.from("user_word_reviews").update({due_at:updated.due_at,interval_days:updated.interval_days,repetitions:updated.repetitions,last_reviewed_at:updated.last_reviewed_at}).eq("notebook_entry_id",current.id) : await db!.from("user_word_reviews").insert(updated);
      if (response.error) { setError(response.error.message); return; }
      setReviews((rows) => [...rows.filter((row) => row.notebook_entry_id !== current.id), updated]);
    }
    setRevealed(false); setNow(Date.now());
  }
  return <section className="card saved-word-review"><span className="eyebrow">SỔ TỪ VỰNG CỦA BẠN</span><h2>Ôn từ đã lưu</h2><p>Từ lưu từ Daily News và các bài học cùng xuất hiện tại đây. Lịch ôn tăng dần khi bạn nhớ đúng.</p><div className="saved-word-review-count"><strong>{due.length}</strong> từ đến hạn · {words.length} từ đã lưu</div>{error&&<p className="form-error" role="alert">{error}</p>}{current?<><button className="saved-word-review-card" onClick={()=>setRevealed(!revealed)}><small>{revealed?"Nhấn để ẩn nghĩa":"Nhấn để xem nghĩa"}</small><strong>{current.title}</strong>{revealed&&<><span>{current.meaningVi}</span><em>{current.example}</em></>}</button>{revealed&&<div className="saved-word-review-actions"><button onClick={()=>void grade("again")}>Chưa nhớ · 10 phút</button><button onClick={()=>void grade("good")}>Nhớ · ôn sau</button><button onClick={()=>void grade("easy")}>Rất dễ · giãn lâu</button></div>}</>:<div className="news-empty">Hôm nay đã ôn xong. Hãy lưu thêm từ trong bài đọc để tiếp tục.</div>}</section>;
}
