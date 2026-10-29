"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { ArrowLeft, ArrowRight, Check, RotateCcw, Search, Shuffle, Sparkles } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { demoMode } from "@/lib/runtime";
import {
  choiceOptions, completeSentence, cueForm, eligibleForMode, formAt, nextFormationProgress,
  normalizeFormationAnswer, recommendFamilies, sourceAnswer, wrongForm,
  wordFormationModes, type WordFamily, type WordFormationGuidance,
  type WordFormationMode, type WordFormationProgress, type WordPosition,
} from "@/lib/vocabulary/word-formation";
import "./word-formation-page.css";

const labels: Record<WordFormationMode, string> = {
  family: "Điền họ từ", blank: "Điền dạng từ", choice: "Trắc nghiệm",
  error: "Sửa lỗi", rewrite: "Viết lại câu", context: "Điền ngữ cảnh", translation: "Dịch Việt → Anh",
};
const posLabels: Record<WordPosition, string> = { noun: "Danh từ", verb: "Động từ", adj: "Tính từ", adv: "Trạng từ" };
const openModes = new Set<WordFormationMode>(["rewrite", "translation"]);
const root = "/app/vocabulary";

export function WordFormationPage() {
  const db = useMemo(() => demoMode ? null : createClient(), []);
  const [families, setFamilies] = useState<WordFamily[]>([]);
  const [progress, setProgress] = useState<WordFormationProgress[]>([]);
  const [mode, setMode] = useState<WordFormationMode>("blank");
  const [guidance, setGuidance] = useState<WordFormationGuidance>("basic");
  const [filter, setFilter] = useState<"all" | "due" | "done">("all");
  const [query, setQuery] = useState("");
  const [visibleCount, setVisibleCount] = useState(40);
  const [activeId, setActiveId] = useState(1);
  const [sessionSize, setSessionSize] = useState(10);
  const [sessionIds, setSessionIds] = useState<number[]>([]);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [sessionDone, setSessionDone] = useState<number[]>([]);
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [revealedOnly, setRevealedOnly] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(!demoMode);
  const [progressReady, setProgressReady] = useState(demoMode);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!db) return;
    let active = true;
    void db.from("word_formation_families")
      .select("id,noun,verb,adjective,adverb,meaning_vi,example_pos,example_blank_en,example_vi,source_warning")
      .eq("published", true).order("id").limit(300)
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError(loadError.message);
        else setFamilies(data as WordFamily[]);
        setLoading(false);
      });
    return () => { active = false; };
  }, [db]);

  useEffect(() => {
    if (!db) return;
    let active = true;
    void db.from("user_word_formation_progress")
      .select("family_id,mode,guidance,attempts,correct_count,wrong_count,self_checked_count,last_result,due_at,last_attempt_at")
      .eq("mode", mode).eq("guidance", guidance).order("family_id").limit(300)
      .then(({ data, error: loadError }) => {
        if (!active) return;
        if (loadError) setError(loadError.message);
        else setProgress(data as WordFormationProgress[]);
        setProgressReady(true);
      });
    return () => { active = false; };
  }, [db, mode, guidance]);

  const byId = useMemo(() => new Map(progress.map((row) => [row.family_id, row])), [progress]);
  const eligible = useMemo(() => families.filter((family) => eligibleForMode(family, mode)), [families, mode]);
  const current = families.find((family) => family.id === activeId && eligibleForMode(family, mode)) ?? eligible[0];
  const completed = eligible.filter((family) => byId.has(family.id)).length;
  const due = eligible.filter((family) => {
    const row = byId.get(family.id);
    return row && new Date(row.due_at).getTime() <= now;
  }).length;
  const wrong = eligible.filter((family) => byId.get(family.id)?.last_result === "wrong").length;
  const filtered = eligible.filter((family) => {
    const text = `${family.id} ${family.noun} ${family.verb ?? ""} ${family.adjective} ${family.adverb ?? ""} ${family.meaning_vi}`.toLocaleLowerCase();
    const state = byId.get(family.id);
    return text.includes(query.trim().toLocaleLowerCase())
      && (filter === "all" || filter === "done" && Boolean(state)
        || filter === "due" && Boolean(state && (state.last_result === "wrong" || new Date(state.due_at).getTime() <= now)));
  });
  const options = current ? choiceOptions(current, guidance) : [];
  const correct = current ? normalizeFormationAnswer(answer) === normalizeFormationAnswer(sourceAnswer(current)) : false;
  const isOpen = openModes.has(mode);
  const sessionFinished = sessionIds.length > 0 && sessionIndex >= sessionIds.length;

  function resetAnswer() { setAnswer(""); setSubmitted(false); setRevealedOnly(false); }
  function selectFamily(id: number) { setActiveId(id); setSessionIds([]); setSessionDone([]); setSessionIndex(0); resetAnswer(); }
  function selectMode(next: WordFormationMode) {
    setMode(next); setProgress([]); setProgressReady(false); setActiveId(families.find((family) => eligibleForMode(family, next))?.id ?? 1);
    setSessionIds([]); setSessionDone([]); setSessionIndex(0); setFilter("all"); resetAnswer();
  }
  function selectGuidance(next: WordFormationGuidance) {
    setGuidance(next); setProgress([]); setProgressReady(false); setSessionIds([]); setSessionDone([]); setSessionIndex(0); resetAnswer();
  }
  function startSession() {
    const picked = recommendFamilies(families, progress, mode, sessionSize, new Date(now));
    setSessionIds(picked.map((family) => family.id)); setSessionDone([]); setSessionIndex(0);
    if (picked[0]) setActiveId(picked[0].id);
    resetAnswer();
  }
  function nextItem() {
    if (sessionIds.length) {
      const index = sessionIndex + 1;
      setSessionIndex(index);
      if (sessionIds[index]) setActiveId(sessionIds[index]);
    } else if (current) {
      const index = eligible.findIndex((family) => family.id === current.id);
      setActiveId(eligible[(index + 1) % eligible.length]?.id ?? current.id);
    }
    resetAnswer();
  }

  async function submit() {
    if (!db || !current || saving || submitted) return;
    if (!answer.trim()) { setError("Hãy nhập hoặc chọn đáp án trước khi kiểm tra."); return; }
    setError(""); setSaving(true);
    const result = isOpen ? "self_checked" : correct ? "correct" : "wrong";
    const next = nextFormationProgress(current, mode, guidance, byId.get(current.id), result);
    const { error: saveError } = await db.from("user_word_formation_progress").upsert(next, { onConflict: "user_id,family_id,mode,guidance" });
    if (saveError) setError(saveError.message);
    else {
      setProgress((old) => [...old.filter((row) => row.family_id !== current.id), next]);
      if (sessionIds.length) setSessionDone((old) => [...old, current.id]);
      setSubmitted(true); setNow(Date.now());
    }
    setSaving(false);
  }

  return <main className="word-formation-page">
    <div className="word-formation-back"><Link href={root}><ArrowLeft size={17} /> Từ vựng</Link><span>WORD FORMATION LAB</span></div>
    <header className="word-formation-hero"><div><span>300 HỌ TỪ · 7 CÁCH LUYỆN</span><h1>Một gốc từ, <em>nhiều cách dùng</em></h1><p>Nhận diện Noun, Verb, Adjective, Adverb và luyện đúng dạng trong câu.</p></div><Sparkles size={42} /></header>
    <div className="word-formation-stats"><span><strong>{completed}</strong> / {eligible.length} đã làm</span><span><strong>{due}</strong> đến hạn ôn</span><span><strong>{wrong}</strong> cần luyện lại</span><span>Đang xem: <b>{labels[mode]}</b></span></div>
    {error && <p className="word-formation-error" role="alert">{error}</p>}
    {loading || !progressReady ? <div className="word-formation-empty">Đang tải Word Formation…</div>
      : !db ? <div className="word-formation-empty">Đăng nhập để học và lưu tiến độ Word Formation.</div>
      : <div className="word-formation-layout"><aside className="word-formation-library"><div className="word-formation-library-top"><h2>Họ từ <small>{filtered.length}</small></h2><label><Search size={17} /><input value={query} onChange={(event) => { setQuery(event.target.value); setVisibleCount(40); }} placeholder="Tìm từ hoặc nghĩa…" /></label><div className="word-formation-filters"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>Tất cả</button><button className={filter === "due" ? "active" : ""} onClick={() => setFilter("due")}>Cần ôn</button><button className={filter === "done" ? "active" : ""} onClick={() => setFilter("done")}>Đã làm</button></div></div><div className="word-formation-list">{filtered.slice(0, visibleCount).map((family) => <button key={family.id} className={current?.id === family.id ? "active" : ""} onClick={() => selectFamily(family.id)}><span>{String(family.id).padStart(3, "0")}</span><div><strong>{cueForm(family)}</strong><small>{family.meaning_vi}</small></div>{byId.get(family.id)?.last_result === "wrong" ? <b className="word-formation-wrong">●</b> : byId.has(family.id) ? <Check size={15} /> : null}</button>)}{filtered.length === 0 && <p>Không có họ từ khớp bộ lọc.</p>}</div>{visibleCount < filtered.length && <button className="word-formation-more" onClick={() => setVisibleCount((count) => count + 40)}>Xem thêm <ArrowRight size={15} /></button>}</aside>
        <section className="word-formation-main"><div className="word-formation-toolbar"><label>Cách luyện<select value={mode} onChange={(event) => selectMode(event.target.value as WordFormationMode)}>{wordFormationModes.map((item) => <option key={item} value={item}>{labels[item]}</option>)}</select></label><label>Mức hỗ trợ<select value={guidance} onChange={(event) => selectGuidance(event.target.value as WordFormationGuidance)}><option value="basic">Basic · Có gợi ý</option><option value="intermediate">Intermediate · Tự xác định</option><option value="advanced">Advanced · Tự giải thích</option></select></label><label>Buổi học<select value={sessionSize} onChange={(event) => setSessionSize(Number(event.target.value))}>{[10, 20, 30].map((size) => <option key={size} value={size}>{size} câu</option>)}</select></label><button className="word-formation-session-button" onClick={startSession}><Shuffle size={16} /> Luyện đề xuất</button></div>
          <div className="word-formation-mode-strip">{wordFormationModes.map((item) => <button key={item} className={mode === item ? "active" : ""} onClick={() => selectMode(item)}>{labels[item]}</button>)}</div>
          {sessionIds.length > 0 && <div className="word-formation-session"><span>Buổi học: {sessionDone.length}/{sessionIds.length} câu</span><div><div style={{ width: `${sessionDone.length / sessionIds.length * 100}%` }} /></div></div>}
          {sessionFinished ? <div className="word-formation-empty"><Check size={31} /><h2>Đã hết buổi học</h2><p>Bạn đã làm {sessionDone.length}/{sessionIds.length} câu. Các câu sai sẽ được gợi ý ôn lại.</p><button onClick={startSession}>Bắt đầu buổi khác <ArrowRight size={16} /></button></div>
            : current ? <article className="word-formation-card"><div className="word-formation-card-head"><span>HỌ TỪ #{String(current.id).padStart(3, "0")}</span><span>{labels[mode]} · {guidance === "basic" ? "Có gợi ý" : guidance === "intermediate" ? "Tự xác định" : "Tự giải thích"}</span></div><div className="word-formation-family-name"><h2>{cueForm(current)}</h2><p>{current.meaning_vi}</p></div>
              {(mode === "family" || submitted) && <div className="word-formation-grid">{(["noun", "verb", "adj", "adv"] as WordPosition[]).map((position) => { const form = formAt(current, position); return <div key={position}><span>{posLabels[position]}</span><strong>{!submitted && form === sourceAnswer(current) ? "?" : form || "—"}</strong></div>; })}</div>}
              {current.source_warning && <p className="word-formation-warning">Lưu ý từ dữ liệu nguồn: {current.source_warning}</p>}
              <ExercisePrompt family={current} mode={mode} guidance={guidance} />
              {mode === "choice" ? <div className="word-formation-choices">{options.map((option) => <button key={option} disabled={submitted} className={`${answer === option ? "selected" : ""} ${submitted && option === sourceAnswer(current) ? "correct" : ""}`} onClick={() => setAnswer(option)}>{option}</button>)}</div>
                : isOpen ? <textarea aria-label="Nhập câu trả lời" value={answer} disabled={submitted} onChange={(event) => setAnswer(event.target.value)} placeholder="Viết câu trả lời của bạn…" />
                  : <input aria-label="Nhập dạng từ đúng" value={answer} disabled={submitted} onChange={(event) => setAnswer(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") void submit(); }} autoComplete="off" spellCheck={false} placeholder="Nhập dạng từ đúng…" />}
              <div className="word-formation-actions">{!submitted ? <><button className="word-formation-primary" disabled={saving} onClick={() => void submit()}>{isOpen ? "Đối chiếu đáp án mẫu" : "Kiểm tra đáp án"} <ArrowRight size={16} /></button><button className="word-formation-soft" onClick={() => { setSubmitted(true); setRevealedOnly(true); }}>Xem lời giải</button></> : <button className="word-formation-primary" onClick={nextItem}>Câu tiếp theo <ArrowRight size={16} /></button>}{!sessionIds.length && <button className="word-formation-soft" onClick={() => selectFamily(eligible[Math.floor(Math.random() * eligible.length)]?.id ?? current.id)}><RotateCcw size={15} /> Họ từ khác</button>}</div>
              {submitted && <AnswerFeedback family={current} mode={mode} answer={answer} correct={correct} revealedOnly={revealedOnly} />}
            </article> : <div className="word-formation-empty">Chưa có bài phù hợp.</div>}
          <p className="word-formation-note">Mỗi họ từ có một câu nguồn song ngữ. Ba mức trên là mức hỗ trợ học, không phải ba ngân hàng câu riêng. Trắc nghiệm chỉ dùng họ từ có bốn dạng phân biệt và không có cảnh báo nguồn; câu dịch/viết lại tự đối chiếu, không chấm máy.</p>
        </section></div>}
  </main>;
}

function ExercisePrompt({ family, mode, guidance }: { family: WordFamily; mode: WordFormationMode; guidance: WordFormationGuidance }) {
  const bad = wrongForm(family);
  const prompt = mode === "family" ? `Điền dạng ${posLabels[family.example_pos].toLowerCase()} còn thiếu trong bảng.`
    : mode === "error" ? family.example_blank_en.replace("____", bad ?? "")
      : mode === "rewrite" ? `Viết lại câu sau cho đúng mà vẫn giữ ý: ${family.example_blank_en.replace("____", bad ?? "")}`
        : mode === "translation" ? family.example_vi : family.example_blank_en;
  return <div className="word-formation-prompt"><span>CÂU HỎI</span><p>{prompt}</p>{mode === "context" && <small>Ngữ cảnh nguồn gồm một câu; đọc cả câu để xác định dạng từ phù hợp.</small>}{guidance === "basic" && <small>Gợi ý: vị trí cần {posLabels[family.example_pos].toLowerCase()}. {mode !== "translation" && `Nghĩa gốc: ${family.meaning_vi}.`}</small>}{guidance === "advanced" && <small>Sau khi chọn, hãy tự giải thích vì sao các dạng khác không phù hợp với vị trí này.</small>}</div>;
}

function AnswerFeedback({ family, mode, answer, correct, revealedOnly }: { family: WordFamily; mode: WordFormationMode; answer: string; correct: boolean; revealedOnly: boolean }) {
  const open = openModes.has(mode);
  const headline = revealedOnly ? "Đáp án và giải thích" : open ? "Mẫu để tự đối chiếu" : correct ? "Chính xác" : "Cần luyện lại";
  return <div className="word-formation-feedback"><h3>{headline}</h3><p><b>Dạng đúng:</b> {sourceAnswer(family)} ({posLabels[family.example_pos]})</p><p><b>Câu hoàn chỉnh:</b> {completeSentence(family)}</p><p><b>Dịch:</b> {family.example_vi}</p><p><b>Giải thích:</b> Vị trí trong câu nguồn dùng {posLabels[family.example_pos].toLowerCase()} của họ từ “{family.noun}”. Đối chiếu cấu trúc câu và nghĩa trước khi dùng dạng khác.</p>{mode === "choice" && <p><b>Các lựa chọn:</b> {(["noun", "verb", "adj", "adv"] as WordPosition[]).map((position) => `${formAt(family, position)} (${posLabels[position]})`).join(" · ")}</p>}{open && <p><b>Tự đối chiếu:</b> Giữ đủ ý chính, đúng ngữ pháp và dùng dạng từ tự nhiên. Có thể có câu đúng khác với mẫu; câu trả lời của bạn không được chấm tự động.</p>}{open && answer.trim() && <p><b>Câu bạn viết:</b> {answer}</p>}{family.source_warning && <p><b>Lưu ý nguồn:</b> {family.source_warning}</p>}</div>;
}
