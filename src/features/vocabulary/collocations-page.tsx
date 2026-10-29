"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, Search, Volume2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { demoMode } from "@/lib/runtime";
import { CollocationEntry, CollocationProgress, nextCollocationProgress, recommendCollocations } from "@/lib/vocabulary/collocation-recommendations";
import "./collocations-page.css";

type Grade = CollocationProgress["last_grade"];
const levels = ["all", "A1", "A2", "B1", "B2", "C1", "C2"];
const dailyOptions = [5, 10, 20];

function speak(value: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(value);
  utterance.lang = "en-US";
  utterance.rate = 0.85;
  window.speechSynthesis.speak(utterance);
}

export function CollocationsPage() {
  const db = useMemo(() => demoMode ? null : createClient(), []);
  const [entries, setEntries] = useState<CollocationEntry[]>([]);
  const [progress, setProgress] = useState<CollocationProgress[]>([]);
  const [level, setLevel] = useState("all");
  const [daily, setDaily] = useState(10);
  const [tab, setTab] = useState<"learn" | "library">("learn");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [now, setNow] = useState(() => Date.now());
  const [revealed, setRevealed] = useState(false);
  const [loading, setLoading] = useState(!demoMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!db) return;
    let active = true;
    void Promise.all([
      db.from("collocation_entries").select("id,source_order,level,phrase,meaning_vi,example_en,example_vi,note,qa_flags").eq("published", true).order("source_order").limit(1000),
      db.from("user_collocation_progress").select("collocation_id,first_seen_at,last_reviewed_at,due_at,interval_days,repetitions,correct_count,wrong_count,last_grade").limit(1000),
    ]).then(([words, reviews]) => {
      if (!active) return;
      if (words.error || reviews.error) setError(words.error?.message || reviews.error?.message || "Không tải được bộ từ.");
      else { setEntries(words.data as CollocationEntry[]); setProgress(reviews.data as CollocationProgress[]); }
      setLoading(false);
    });
    return () => { active = false; };
  }, [db]);

  const progressById = useMemo(() => new Map(progress.map((row) => [row.collocation_id, row])), [progress]);
  const filtered = useMemo(() => entries.filter((entry) => level === "all" || entry.level === level), [entries, level]);
  const learned = filtered.filter((entry) => progressById.has(entry.id)).length;
  const due = filtered.filter((entry) => {
    const row = progressById.get(entry.id);
    return row && new Date(row.due_at).getTime() <= now;
  }).length;
  const suggestions = useMemo(() => recommendCollocations(entries, progress, level, daily, new Date(now), new Set(sessionIds)), [entries, progress, level, daily, sessionIds, now]);
  const current = suggestions[0];
  const matches = useMemo(() => filtered.filter((entry) => `${entry.phrase} ${entry.meaning_vi}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase())), [filtered, query]);
  const visible = matches.slice(page * 30, (page + 1) * 30);

  function changeLevel(value: string) {
    setLevel(value); setPage(0); setSessionIds([]); setRevealed(false);
  }

  async function grade(value: Grade) {
    if (!db || !current || saving) return;
    setSaving(true); setError("");
    const next = nextCollocationProgress(current.entry.id, progressById.get(current.entry.id), value);
    const { error: saveError } = await db.from("user_collocation_progress").upsert(next, { onConflict: "user_id,collocation_id" });
    if (saveError) setError(saveError.message);
    else {
      setProgress((old) => [...old.filter((row) => row.collocation_id !== next.collocation_id), next]);
      setSessionIds((old) => [...old, next.collocation_id]);
      setNow(Date.now());
      setRevealed(false);
    }
    setSaving(false);
  }

  return <main className="collocations-page">
    <div className="collocations-top"><Link href="/app/vocabulary"><ArrowLeft size={17} /> Từ vựng</Link><span>BỘ COLLOCATIONS · A1–C2</span></div>
    <header className="collocations-header"><div><h1>Học cụm từ <em>đúng lúc</em></h1><p>988 collocations song ngữ. Học cụm mới, ôn cụm đến hạn và xem tiến độ của bạn.</p></div><div className="collocations-total"><strong>{entries.length || 988}</strong><span>cụm từ trong bộ</span></div></header>
    <section className="collocations-toolbar" aria-label="Chọn trình độ và cách học">
      <label>Trình độ<select value={level} onChange={(event) => changeLevel(event.target.value)}>{levels.map((item) => <option key={item} value={item}>{item === "all" ? "Tất cả A1–C2" : item}</option>)}</select></label>
      <label>Mỗi buổi<select value={daily} onChange={(event) => { setDaily(Number(event.target.value)); setSessionIds([]); setRevealed(false); }}>{dailyOptions.map((item) => <option key={item} value={item}>{item} cụm</option>)}</select></label>
      <div className="collocations-tabs"><button className={tab === "learn" ? "active" : ""} onClick={() => setTab("learn")}>Đề xuất học</button><button className={tab === "library" ? "active" : ""} onClick={() => setTab("library")}>Kho 988 cụm</button></div>
    </section>
    <div className="collocations-stats"><span><strong>{learned}</strong> / {filtered.length} đã học</span><span><strong>{due}</strong> cần ôn</span><span><strong>{Math.max(0, filtered.length - learned)}</strong> chưa học</span></div>
    {error && <p className="collocations-error" role="alert">{error}</p>}
    {loading ? <div className="collocations-empty">Đang tải bộ collocations…</div>
      : !db ? <div className="collocations-empty">Đăng nhập vào tài khoản để học và lưu tiến độ collocations.</div>
      : tab === "library" ? <section className="collocations-library"><div className="collocations-library-head"><h2>Toàn bộ cụm từ <small>{matches.length} kết quả</small></h2><label><Search size={17} /><input value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Tìm cụm từ hoặc nghĩa…" /></label></div><div className="collocations-list">{visible.map((entry) => <article key={entry.id}><span className="collocations-level">{entry.level}</span><div><h3>{entry.phrase}</h3><p>{entry.meaning_vi}</p></div><button aria-label={`Nghe ${entry.phrase}`} onClick={() => speak(entry.phrase)}><Volume2 size={19} /></button><span className={progressById.has(entry.id) ? "collocations-learned" : ""}>{progressById.has(entry.id) ? "Đã học" : "Chưa học"}</span></article>)}</div><div className="collocations-pagination"><button disabled={page === 0} onClick={() => setPage(page - 1)}>← Trước</button><span>Trang {page + 1}/{Math.max(1, Math.ceil(matches.length / 30))}</span><button disabled={(page + 1) * 30 >= matches.length} onClick={() => setPage(page + 1)}>Tiếp →</button></div></section>
      : <section className="collocations-study"><div className="collocations-session"><div><span className="collocations-kicker">HÔM NAY HỌC GÌ?</span><h2>{sessionIds.length >= daily ? "Hoàn thành buổi học" : current ? current.reason === "due" ? "Ôn cụm đến hạn" : "Học cụm mới" : "Bạn đã học hết mức này"}</h2><p>Ưu tiên cụm cần ôn, sau đó đến cụm mới ở trình độ bạn chọn.</p></div><span className="collocations-session-count">{Math.min(sessionIds.length, daily)}/{daily} cụm</span></div><div className="collocations-progress"><div style={{ width: `${Math.min(100, sessionIds.length / daily * 100)}%` }} /></div>
        {sessionIds.length >= daily || !current ? <div className="collocations-empty"><Check size={34} /><h3>{sessionIds.length ? `Bạn đã học ${sessionIds.length} cụm trong buổi này` : "Chưa có cụm cần học ở trình độ này"}</h3><button onClick={() => { setSessionIds([]); setRevealed(false); }}>Bắt đầu buổi khác <ArrowRight size={16} /></button></div>
          : <article className="collocations-card"><div className="collocations-card-head"><span className="collocations-level">{current.entry.level}</span><span>{current.reason === "due" ? "Đến hạn ôn" : "Cụm mới"}</span><button aria-label={`Nghe ${current.entry.phrase}`} onClick={() => speak(current.entry.phrase)}><Volume2 size={20} /></button></div><h3>{current.entry.phrase}</h3><div className="collocations-example">{current.entry.example_en}</div>{revealed ? <div className="collocations-answer"><strong>{current.entry.meaning_vi}</strong><p>{current.entry.example_vi}</p>{current.entry.note && <small>{current.entry.note}</small>}</div> : <button className="collocations-reveal" onClick={() => setRevealed(true)}>Xem nghĩa và ví dụ <ArrowRight size={18} /></button>}{revealed && <div className="collocations-grades"><button disabled={saving} onClick={() => void grade("again")}>Chưa nhớ</button><button disabled={saving} onClick={() => void grade("hard")}>Hơi nhớ</button><button disabled={saving} onClick={() => void grade("good")}>Nhớ</button><button disabled={saving} onClick={() => void grade("easy")}>Rất chắc</button></div>}</article>}
        <p className="collocations-note">Nghĩa và ví dụ từ bộ do chủ dự án cung cấp; nội dung nguồn đang được rà soát biên tập. Tiến độ lưu riêng theo tài khoản.</p></section>}
  </main>;
}
