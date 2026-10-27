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
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => { void (async () => {
    if (demoMode) { try { setReviews(JSON.parse(localStorage.getItem(storageKey) ?? "[]") as WordReview[]); } catch { setReviews([]); } return; }
    const result = await db!.from("user_word_reviews").select("notebook_entry_id,due_at,interval_days,repetitions,last_reviewed_at,fsrs_state").limit(1000);
    if (result.error) setError(result.error.message); else setReviews((result.data ?? []) as WordReview[]);
  })(); }, [db]);
  const words = entries.filter((entry) => entry.kind === "word");
  const due = words.filter((entry) => { const review = reviews.find((row) => row.notebook_entry_id === entry.id); return !review || new Date(review.due_at).valueOf() <= now; });
  const current = due[0];
  async function grade(value: ReviewGrade) {
    if (!current || busy) return;
    setBusy(true);
    const before = reviews.find((row) => row.notebook_entry_id === current.id);
    const updated: WordReview = { notebook_entry_id: current.id, ...nextWordReview(before, value, new Date()) };
    if (demoMode) {
      const next = [...reviews.filter((row) => row.notebook_entry_id !== current.id), updated];
      localStorage.setItem(storageKey, JSON.stringify(next)); setReviews(next);
      const key = "ieltswithharry-vocabulary-events-v1";
      try { localStorage.setItem(key, JSON.stringify([{ notebook_entry_id: current.id, grade: value, reviewed_at: new Date().toISOString() }, ...JSON.parse(localStorage.getItem(key) ?? "[]")])); } catch { /* Review schedule still persists. */ }
    } else {
      const response = await db!.rpc("save_word_fsrs_review", { p_entry: current.id, p_grade: value, p_state: updated.fsrs_state, p_request: crypto.randomUUID(), p_previous_reviewed_at: before?.last_reviewed_at ?? null });
      if (response.error) { setError(response.error.message); setBusy(false); return; }
      if (response.data === false) { setError("Từ này vừa được ôn ở nơi khác. Tải lại trang để xem lịch mới."); setBusy(false); return; }
      setReviews((rows) => [...rows.filter((row) => row.notebook_entry_id !== current.id), updated]);
    }
    setRevealed(false); setNow(Date.now()); setBusy(false);
  }
  return <section className="card saved-word-review"><span className="eyebrow">SỔ TỪ VỰNG CỦA BẠN</span><h2>Ôn từ đã lưu</h2><p>Từ lưu từ Daily News và các bài học cùng xuất hiện tại đây. FSRS chọn thời điểm ôn tiếp theo từ đánh giá của bạn.</p><div className="saved-word-review-count"><strong>{due.length}</strong> từ đến hạn · {words.length} từ đã lưu</div>{error&&<p className="form-error" role="alert">{error}</p>}{current?<><button className="saved-word-review-card" onClick={()=>setRevealed(!revealed)}><small>{revealed?"Nhấn để ẩn nghĩa":"Nhấn để xem nghĩa"}</small><strong>{current.title}</strong>{revealed&&<><span>{current.meaningVi}</span><em>{current.example}</em></>}</button>{revealed&&<div className="saved-word-review-actions"><button disabled={busy} onClick={()=>void grade("again")}>Again</button><button disabled={busy} onClick={()=>void grade("hard")}>Hard</button><button disabled={busy} onClick={()=>void grade("good")}>Good</button><button disabled={busy} onClick={()=>void grade("easy")}>Easy</button></div>}</>:<div className="news-empty">Hiện không có từ đến hạn. Hãy lưu thêm từ trong bài đọc để tiếp tục.</div>}</section>;
}
