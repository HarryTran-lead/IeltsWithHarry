"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Sparkles } from "lucide-react";
import { useNotebook } from "@/features/notebook/notebook-store";
import { createClient } from "@/lib/supabase/browser";
import { NEWS_CATEGORIES } from "@/lib/news/constants";
import { NEWS_STAGE_ORDER, recommendReadings } from "@/lib/news/recommend";

type Reading = { id: string; slug: string; title: string; summary: string; stage_id: string; category: string; created_at: string };
type Progress = { article_id: string; completed_at: string | null };
type Attempt = { article_id: string; score: number; total: number };
type Vocabulary = { article_id: string; word: string };
const stageNames = ["1.0–2.0 Foundation", "2.0–3.0 Elementary", "3.0–4.0 Pre-IELTS", "4.0–5.0 IELTS Starter", "5.0–6.0 IELTS Builder", "6.0–7.0 IELTS Advanced", "7.0+ Mastery"];

export function NewsRecommendations() {
  const db = useMemo(() => createClient(), []);
  const { entries } = useNotebook();
  const [readings, setReadings] = useState<Reading[]>([]);
  const [progress, setProgress] = useState<Progress[]>([]);
  const [attempt, setAttempt] = useState<Attempt | null>(null);
  const [vocabulary, setVocabulary] = useState<Vocabulary[]>([]);
  const [stage, setStage] = useState("");
  const [topics, setTopics] = useState<string[]>([]);
  const [saved, setSaved] = useState(false);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    let alive = true;
    void (async () => {
      const [articles, prefs, history, attempts] = await Promise.all([
        db.from("news_learning_articles").select("id,slug,title,summary,stage_id,category,created_at").eq("published", true).order("created_at", { ascending: false }).limit(100),
        db.from("user_news_preferences").select("stage_id,topics").maybeSingle(),
        db.from("user_news_progress").select("article_id,completed_at").limit(100),
        db.from("news_reading_attempts").select("article_id,score,total").order("submitted_at", { ascending: false }).limit(1),
      ]);
      if (!alive) return;
      if (articles.error || prefs.error || history.error || attempts.error) {
        setError("Chưa tải được gợi ý học tập. Hãy thử lại sau.");
        setLoading(false);
        return;
      }
      const list = (articles.data ?? []) as Reading[];
      setReadings(list);
      setStage(prefs.data?.stage_id ?? "");
      setTopics(prefs.data?.topics ?? []);
      setProgress((history.data ?? []) as Progress[]);
      setAttempt((attempts.data?.[0] ?? null) as Attempt | null);
      if (list.length) {
        const words = await db.from("news_vocabulary").select("article_id,word").in("article_id", list.map((item) => item.id)).limit(1000);
        if (alive) setVocabulary((words.data ?? []) as Vocabulary[]);
      }
      if (alive) setLoading(false);
    })();
    return () => { alive = false; };
  }, [db]);

  const suggestions = useMemo(() => recommendReadings(readings, { stage_id: stage || null, topics }, progress, attempt, vocabulary, entries.filter((entry) => entry.kind === "word").map((entry) => entry.title)).slice(0, 3), [readings, stage, topics, progress, attempt, vocabulary, entries]);

  async function savePreferences() {
    setBusy(true); setError("");
    const { data: { user }, error: authError } = await db.auth.getUser();
    const result = user ? await db.from("user_news_preferences").upsert({ user_id: user.id, stage_id: stage || null, topics, updated_at: new Date().toISOString() }) : null;
    setBusy(false);
    if (authError || !user || result?.error) { setError(result?.error?.message ?? authError?.message ?? "Cần đăng nhập để lưu sở thích."); return; }
    setSaved(true);
  }

  return <section className="news-section news-recommendations" aria-label="Bài đọc gợi ý">
    <span className="eyebrow"><Sparkles size={15}/> GỢI Ý RIÊNG CHO BẠN</span>
    <h2>Chọn bài phù hợp hôm nay</h2>
    <p>Dựa trên trình độ, chủ đề yêu thích, bài đã hoàn thành, kết quả gần đây và từ bạn đã lưu. Bạn vẫn mở được mọi trình độ.</p>
    <div className="news-recommend-preferences">
      <label>Trình độ muốn luyện<select value={stage} onChange={(event) => { setStage(event.target.value); setSaved(false); }}><option value="">Tự gợi ý từ kết quả học</option>{NEWS_STAGE_ORDER.map((id, index) => <option value={id} key={id}>{stageNames[index]}</option>)}</select></label>
      <div className="news-recommend-topics"><span>Chủ đề yêu thích</span><div>{NEWS_CATEGORIES.map((topic) => <button type="button" key={topic} aria-pressed={topics.includes(topic)} className={topics.includes(topic) ? "selected" : ""} onClick={() => { setTopics((current) => current.includes(topic) ? current.filter((item) => item !== topic) : [...current, topic]); setSaved(false); }}>{topic}</button>)}</div></div>
      <button className="button primary" type="button" disabled={busy} onClick={() => void savePreferences()}>{busy ? "Đang lưu…" : saved ? "✓ Đã lưu sở thích" : "Lưu sở thích"}</button>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    {loading ? <p>Đang tìm bài phù hợp…</p> : <div className="news-grid">{suggestions.map((item) => <Link href={`/app/news/learn/${item.slug}`} className="news-learn-card" key={item.id}><span>{item.category} · {stageNames[NEWS_STAGE_ORDER.indexOf(item.stage_id as typeof NEWS_STAGE_ORDER[number])] ?? item.stage_id}</span><h3>{item.title}</h3><p>{item.summary}</p><strong>Đọc & luyện tập <ArrowRight size={16}/></strong></Link>)}</div>}
  </section>;
}
