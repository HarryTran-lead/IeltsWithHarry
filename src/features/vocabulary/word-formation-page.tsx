"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Check, Keyboard, RotateCcw, Search, Shuffle, X } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { demoMode } from "@/lib/runtime";
import {
  choiceOptions, completeSentence, cueForm, eligibleForMode, formAt, nextFormationProgress,
  normalizeFormationAnswer, recommendFamilies, sourceAnswer, wrongForm,
  wordFormationModes, type WordFamily, type WordFormationGuidance,
  type WordFormationMode, type WordFormationProgress, type WordPosition,
} from "@/lib/vocabulary/word-formation";
import "./word-formation-page.css";
import { LoadingBlock } from "@/components/layout/loading-block";

const labels: Record<WordFormationMode, string> = {
  family: "Điền họ từ", blank: "Điền dạng từ", choice: "Trắc nghiệm",
  error: "Sửa lỗi", rewrite: "Viết lại câu", context: "Điền ngữ cảnh", translation: "Dịch Việt → Anh",
};
const posLabels: Record<WordPosition, string> = { noun: "Danh từ", verb: "Động từ", adj: "Tính từ", adv: "Trạng từ" };
const positions: WordPosition[] = ["noun", "verb", "adj", "adv"];
const guidanceOrder: WordFormationGuidance[] = ["basic", "intermediate", "advanced"];
const guidanceLabels: Record<WordFormationGuidance, string> = { basic: "Có gợi ý", intermediate: "Tự xác định", advanced: "Tự giải thích" };
const openModes = new Set<WordFormationMode>(["rewrite", "translation"]);
const choiceLetters = ["a", "b", "c", "d"];
const root = "/app/vocabulary";
const pad = (id: number) => String(id).padStart(3, "0");

/**
 * Word Formation practice. On desktop and laptop the page is one viewport: a one-line header, the
 * family list (scrolls inside its own column) and the exercise panel. Everything can be done from the
 * keyboard; `fixture` feeds local families for the dev-only preview page instead of Supabase.
 */
export function WordFormationPage({ fixture }: { fixture?: WordFamily[] } = {}) {
  const db = useMemo(() => fixture || demoMode ? null : createClient(), [fixture]);
  const [families, setFamilies] = useState<WordFamily[]>(fixture ?? []);
  const [progress, setProgress] = useState<WordFormationProgress[]>([]);
  const [mode, setMode] = useState<WordFormationMode>("blank");
  const [guidance, setGuidance] = useState<WordFormationGuidance>("basic");
  const [filter, setFilter] = useState<"all" | "due" | "done">("all");
  const [query, setQuery] = useState("");
  const [activeId, setActiveId] = useState(1);
  const [sessionSize, setSessionSize] = useState(10);
  const [sessionIds, setSessionIds] = useState<number[]>([]);
  const [sessionIndex, setSessionIndex] = useState(0);
  const [sessionDone, setSessionDone] = useState<number[]>([]);
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [revealedOnly, setRevealedOnly] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const [loading, setLoading] = useState(Boolean(db));
  const [progressReady, setProgressReady] = useState(!db);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [showKeys, setShowKeys] = useState(false);

  const answerRef = useRef<HTMLInputElement | HTMLTextAreaElement | null>(null);
  const choicesRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const restartRef = useRef<HTMLButtonElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const submittedAt = useRef(0);
  const keyHandler = useRef<(event: KeyboardEvent) => void>(() => undefined);

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
  const inSession = sessionIds.length > 0;
  const sessionFinished = inSession && sessionIndex >= sessionIds.length;
  const canPractise = Boolean(db || fixture);

  function resetAnswer() { setAnswer(""); setSubmitted(false); setRevealedOnly(false); }
  function selectFamily(id: number) { setActiveId(id); setSessionIds([]); setSessionDone([]); setSessionIndex(0); resetAnswer(); }
  function selectMode(next: WordFormationMode) {
    if (next === mode) return;
    setMode(next); setProgress([]); setProgressReady(!db); setActiveId(families.find((family) => eligibleForMode(family, next))?.id ?? 1);
    setSessionIds([]); setSessionDone([]); setSessionIndex(0); setFilter("all"); resetAnswer();
  }
  function selectGuidance(next: WordFormationGuidance) {
    setGuidance(next); setProgress([]); setProgressReady(!db); setSessionIds([]); setSessionDone([]); setSessionIndex(0); resetAnswer();
  }
  function startSession() {
    const picked = recommendFamilies(families, progress, mode, sessionSize, new Date(now));
    setSessionIds(picked.map((family) => family.id)); setSessionDone([]); setSessionIndex(0);
    if (picked[0]) setActiveId(picked[0].id);
    resetAnswer();
  }
  function nextItem() {
    // The Enter that submitted must not also skip the feedback.
    if (Date.now() - submittedAt.current < 250) return;
    if (inSession) {
      const index = sessionIndex + 1;
      setSessionIndex(index);
      if (sessionIds[index]) setActiveId(sessionIds[index]);
    } else if (current) {
      const index = eligible.findIndex((family) => family.id === current.id);
      setActiveId(eligible[(index + 1) % eligible.length]?.id ?? current.id);
    }
    resetAnswer();
  }
  function stepFamily(delta: number) {
    if (inSession || !current) return;
    const list = filtered.length ? filtered : eligible;
    const index = list.findIndex((family) => family.id === current.id);
    const target = list[(Math.max(index, 0) + delta + list.length) % list.length];
    if (target) selectFamily(target.id);
  }
  function randomFamily() {
    if (inSession || !current) return;
    selectFamily(eligible[Math.floor(Math.random() * eligible.length)]?.id ?? current.id);
  }
  function reveal() {
    if (submitted || !current) return;
    submittedAt.current = Date.now();
    setSubmitted(true); setRevealedOnly(true);
  }

  async function submit() {
    if (!canPractise || !current || saving || submitted) return;
    if (!answer.trim()) { setError(mode === "choice" ? "Chọn một đáp án (phím 1–4) trước khi kiểm tra." : "Hãy nhập đáp án trước khi kiểm tra."); return; }
    setError(""); setSaving(true);
    const result = isOpen ? "self_checked" : correct ? "correct" : "wrong";
    const next = nextFormationProgress(current, mode, guidance, byId.get(current.id), result);
    const { error: saveError } = db
      ? await db.from("user_word_formation_progress").upsert(next, { onConflict: "user_id,family_id,mode,guidance" })
      : { error: null };
    if (saveError) setError(saveError.message);
    else {
      setProgress((old) => [...old.filter((row) => row.family_id !== current.id), next]);
      if (inSession) setSessionDone((old) => [...old, current.id]);
      submittedAt.current = Date.now();
      setSubmitted(true); setNow(Date.now());
    }
    setSaving(false);
  }

  function handleKey(event: KeyboardEvent) {
    if (event.isComposing || event.defaultPrevented || !canPractise || !families.length) return;
    const target = event.target instanceof HTMLElement ? event.target : null;
    const inAnswer = Boolean(target && target === answerRef.current);
    const inSearch = Boolean(target && target === searchRef.current);

    if (event.altKey && !event.ctrlKey && !event.metaKey) {
      const digit = /^Digit([1-7])$/.exec(event.code);
      const run = (action: () => void) => { event.preventDefault(); action(); };
      if (digit) return run(() => selectMode(wordFormationModes[Number(digit[1]) - 1]));
      switch (event.code) {
        case "ArrowDown": return run(() => stepFamily(1));
        case "ArrowUp": return run(() => stepFamily(-1));
        case "KeyL": return run(reveal);
        case "KeyR": return run(randomFamily);
        case "KeyS": return run(startSession);
        case "KeyG": return run(() => selectGuidance(guidanceOrder[(guidanceOrder.indexOf(guidance) + 1) % guidanceOrder.length]));
        case "KeyT": return run(() => searchRef.current?.focus());
        case "KeyH": return run(() => setShowKeys((open) => !open));
      }
      return;
    }
    if (event.ctrlKey || event.metaKey) return;

    if (event.key === "Escape") {
      if (showKeys) setShowKeys(false);
      else if (inSearch && query) setQuery("");
      else if (inSearch) focusAnswer();
      return;
    }
    if (inSearch) {
      // Open the first match and clear the search, so Alt+↑/↓ walks the whole list from there.
      if (event.key === "Enter" && filtered[0]) { event.preventDefault(); selectFamily(filtered[0].id); setQuery(""); focusAnswer(); }
      return;
    }
    if (inAnswer) {
      if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); if (submitted) nextItem(); else void submit(); }
      return;
    }
    if (target?.closest("input, textarea, select, [contenteditable='true']")) return;
    // A focused button keeps its own Enter/Space.
    if ((event.key === "Enter" || event.key === " ") && target?.closest("button, a")) return;

    if (event.key === "?") { event.preventDefault(); setShowKeys((open) => !open); return; }
    if (event.key === "/") { event.preventDefault(); searchRef.current?.focus(); return; }
    if (sessionFinished) { if (event.key === "Enter") { event.preventDefault(); startSession(); } return; }
    if (mode === "choice" && !submitted) {
      const index = Math.max(["1", "2", "3", "4"].indexOf(event.key), choiceLetters.indexOf(event.key.toLowerCase()));
      if (index >= 0 && options[index]) { event.preventDefault(); setAnswer(options[index]); setError(""); return; }
    }
    // Plain arrows keep scrolling the exercise; families move with Alt+↑/↓.
    if (event.key === "Enter") { event.preventDefault(); if (submitted) nextItem(); else void submit(); }
  }

  function focusAnswer() {
    if (mode === "choice") choicesRef.current?.focus({ preventScroll: true });
    else answerRef.current?.focus({ preventScroll: true });
  }

  useEffect(() => { keyHandler.current = handleKey; });
  useEffect(() => {
    const listener = (event: KeyboardEvent) => keyHandler.current(event);
    window.addEventListener("keydown", listener);
    return () => window.removeEventListener("keydown", listener);
  }, []);

  // Keep the cursor where the next keystroke belongs: the answer box, or "Câu tiếp theo" after checking.
  const currentId = current?.id;
  useEffect(() => {
    if (!currentId || !progressReady) return;
    listRef.current?.querySelector<HTMLElement>("[aria-current='true']")?.scrollIntoView({ block: "nearest" });
    if (window.matchMedia("(max-width: 900px)").matches) return;
    if (sessionFinished) { restartRef.current?.focus({ preventScroll: true }); return; }
    if (submitted) { nextRef.current?.focus({ preventScroll: true }); return; }
    if (document.activeElement === searchRef.current) return;
    if (mode === "choice") choicesRef.current?.focus({ preventScroll: true });
    else answerRef.current?.focus({ preventScroll: true });
  }, [currentId, mode, guidance, submitted, progressReady, sessionFinished]);

  const keyHints = sessionFinished ? [["Enter", "buổi học mới"]]
    : submitted ? [["Enter", "câu tiếp theo"], ["Alt+↓", "họ từ kế"], ["Alt+1–7", "dạng bài"]]
      : [
        ...(mode === "choice" ? [["1–4", "chọn đáp án"]] : []),
        ["Enter", isOpen ? "đối chiếu" : "kiểm tra"],
        ...(isOpen ? [["Shift+Enter", "xuống dòng"]] : []),
        ["Alt+L", "lời giải"],
        ["Alt+↑↓", "đổi họ từ"],
        ["Alt+1–7", "dạng bài"],
      ];

  return <main className="word-formation-page wf-board">
    <header className="wf-head">
      <Link className="wf-back" href={root} aria-label="Về trang Từ vựng" title="Về trang Từ vựng"><ArrowLeft size={18} /></Link>
      <div className="wf-title"><span>Word Formation · {families.length || 300} họ từ</span><h1>Một gốc từ, <em>nhiều cách dùng</em></h1></div>
      {canPractise && <div className="wf-controls">
        <label className="wf-select"><span>Mức hỗ trợ</span><select value={guidance} title="Mức hỗ trợ (Alt+G)" onChange={(event) => selectGuidance(event.target.value as WordFormationGuidance)}><option value="basic">Basic · Có gợi ý</option><option value="intermediate">Intermediate · Tự xác định</option><option value="advanced">Advanced · Tự giải thích</option></select></label>
        <label className="wf-select is-size"><span>Buổi học</span><select value={sessionSize} onChange={(event) => setSessionSize(Number(event.target.value))}>{[10, 20, 30].map((size) => <option key={size} value={size}>{size} câu</option>)}</select></label>
        <button type="button" className="wf-session-btn" onClick={startSession} title="Luyện đề xuất (Alt+S)"><Shuffle size={16} /> Luyện đề xuất <kbd>Alt+S</kbd></button>
        <div className="wf-help">
          <button type="button" className="wf-help-btn" aria-expanded={showKeys} aria-controls="wf-keys" onClick={() => setShowKeys((open) => !open)} title="Phím tắt (Alt+H)"><Keyboard size={17} /><span>Phím tắt</span></button>
          {showKeys && <KeyHelp onClose={() => setShowKeys(false)} />}
        </div>
      </div>}
    </header>

    {error && <p className="wf-error" role="alert">{error}<button type="button" aria-label="Đóng thông báo" onClick={() => setError("")}><X size={15} /></button></p>}

    {loading ? <div className="wf-empty wf-body-empty"><LoadingBlock label="Đang tải Word Formation…" /></div>
      : !canPractise ? <div className="wf-empty wf-body-empty">Đăng nhập để học và lưu tiến độ Word Formation.</div>
        : <div className="wf-body">
          <aside className="wf-library" aria-label="Danh sách họ từ">
            <div className="wf-stats">
              <span><b>{completed}</b>/{eligible.length} đã làm</span>
              <span><b>{due}</b> đến hạn</span>
              <span className={wrong ? "is-warn" : ""}><b>{wrong}</b> cần luyện lại</span>
            </div>
            <label className="wf-search"><Search size={16} /><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm từ hoặc nghĩa…" aria-label="Tìm họ từ" aria-keyshortcuts="/ Alt+T" /><kbd>/</kbd></label>
            <div className="wf-filters" role="group" aria-label="Lọc họ từ">
              {([["all", "Tất cả"], ["due", "Cần ôn"], ["done", "Đã làm"]] as const).map(([value, label]) => <button type="button" key={value} aria-pressed={filter === value} className={filter === value ? "active" : ""} onClick={() => setFilter(value)}>{label}</button>)}
              <small>{filtered.length}</small>
            </div>
            <div className="wf-list" ref={listRef}>
              {filtered.map((family) => {
                const state = byId.get(family.id);
                const active = current?.id === family.id;
                return <button type="button" key={family.id} tabIndex={-1} aria-current={active ? "true" : undefined} className={active ? "active" : ""} onClick={() => selectFamily(family.id)}>
                  <span>{pad(family.id)}</span>
                  <div><strong>{cueForm(family)}</strong><small>{family.meaning_vi}</small></div>
                  {state?.last_result === "wrong" ? <b className="wf-dot" aria-label="Cần luyện lại" /> : state ? <Check size={15} aria-label="Đã làm" /> : null}
                </button>;
              })}
              {filtered.length === 0 && <p>Không có họ từ khớp bộ lọc.</p>}
            </div>
          </aside>

          <section className="wf-main">
            <div className="wf-modes" role="tablist" aria-label="Dạng bài (Alt + 1–7)">
              {wordFormationModes.map((item, index) => <button type="button" role="tab" key={item} aria-selected={mode === item} aria-keyshortcuts={`Alt+${index + 1}`} title={`${labels[item]} (Alt+${index + 1})`} className={mode === item ? "active" : ""} onClick={() => selectMode(item)}><kbd>{index + 1}</kbd>{labels[item]}</button>)}
            </div>
            {inSession && <div className="wf-session" aria-label="Tiến độ buổi học"><span>Buổi học <b>{sessionDone.length}/{sessionIds.length}</b></span><div><div style={{ width: `${sessionDone.length / sessionIds.length * 100}%` }} /></div><button type="button" onClick={() => { setSessionIds([]); setSessionDone([]); setSessionIndex(0); resetAnswer(); }}>Thoát buổi học</button></div>}

            <div className="wf-stage">
              {!progressReady ? <div className="wf-empty"><LoadingBlock label="Đang tải tiến độ…" /></div>
                : sessionFinished ? <div className="wf-empty"><Check size={31} /><h2>Đã hết buổi học</h2><p>Bạn đã làm {sessionDone.length}/{sessionIds.length} câu. Các câu sai sẽ được gợi ý ôn lại.</p><button ref={restartRef} type="button" className="wf-primary" onClick={startSession}>Bắt đầu buổi khác <ArrowRight size={16} /><kbd>Enter</kbd></button></div>
                  : current ? <article className="wf-card">
                    <header className="wf-card-head">
                      <div className="wf-word"><span>#{pad(current.id)}</span><h2>{cueForm(current)}</h2><p>{current.meaning_vi}</p></div>
                      <span className="wf-tag">{labels[mode]} · {guidanceLabels[guidance]}</span>
                    </header>
                    {(mode === "family" || submitted) && <div className="wf-grid">{positions.map((position) => {
                      const form = formAt(current, position);
                      const isAnswer = form === sourceAnswer(current);
                      return <div key={position} className={isAnswer ? submitted ? "is-answer" : "is-blank" : ""}><span>{posLabels[position]}</span><strong>{!submitted && isAnswer ? "?" : form || "—"}</strong></div>;
                    })}</div>}
                    {current.source_warning && <p className="wf-warning">Lưu ý từ dữ liệu nguồn: {current.source_warning}</p>}
                    <ExercisePrompt family={current} mode={mode} guidance={guidance} />

                    {mode === "choice" ? <div className="wf-choices" ref={choicesRef} tabIndex={-1} role="radiogroup" aria-label="Các lựa chọn (phím 1–4)">
                      {options.map((option, index) => <button type="button" role="radio" aria-checked={answer === option} key={option} disabled={submitted}
                        className={`${answer === option ? "selected" : ""} ${submitted && option === sourceAnswer(current) ? "correct" : ""} ${submitted && answer === option && option !== sourceAnswer(current) ? "wrong" : ""}`}
                        onClick={() => { setAnswer(option); setError(""); choicesRef.current?.focus({ preventScroll: true }); }}><kbd>{index + 1}</kbd>{option}</button>)}
                    </div> : null}

                    <div className={`wf-answer ${isOpen ? "is-open" : ""} ${mode === "choice" ? "is-choice" : ""}`}>
                      {mode === "choice" ? null : isOpen
                        ? <textarea ref={(node) => { answerRef.current = node; }} rows={2} aria-label="Nhập câu trả lời" value={answer} disabled={submitted} onChange={(event) => setAnswer(event.target.value)} placeholder="Viết câu trả lời của bạn…" />
                        : <input ref={(node) => { answerRef.current = node; }} aria-label="Nhập dạng từ đúng" className={submitted && !revealedOnly ? correct ? "is-correct" : "is-wrong" : ""} value={answer} disabled={submitted} onChange={(event) => setAnswer(event.target.value)} autoComplete="off" autoCapitalize="off" spellCheck={false} placeholder="Nhập dạng từ đúng…" />}
                      <div className="wf-actions">
                        {!submitted ? <>
                          <button type="button" className="wf-primary" disabled={saving} onClick={() => void submit()}>{isOpen ? "Đối chiếu" : "Kiểm tra"} <kbd>Enter</kbd></button>
                          <button type="button" className="wf-soft" onClick={reveal}>Lời giải <kbd>Alt+L</kbd></button>
                        </> : <button ref={nextRef} type="button" className="wf-primary" onClick={nextItem}>Câu tiếp theo <ArrowRight size={16} /><kbd>Enter</kbd></button>}
                        {!inSession && <button type="button" className="wf-soft" onClick={randomFamily} title="Họ từ khác (Alt+R)"><RotateCcw size={15} /> Họ từ khác</button>}
                      </div>
                    </div>
                    {submitted && <AnswerFeedback family={current} mode={mode} answer={answer} correct={correct} revealedOnly={revealedOnly} />}
                  </article> : <div className="wf-empty">Chưa có bài phù hợp.</div>}
            </div>

            <footer className="wf-keybar" aria-label="Phím tắt nhanh">
              {keyHints.map(([key, label]) => <span key={key}><kbd>{key}</kbd> {label}</span>)}
              <button type="button" tabIndex={-1} onClick={() => setShowKeys(true)}><kbd>Alt+H</kbd> tất cả phím tắt</button>
            </footer>
          </section>
        </div>}
  </main>;
}

function KeyHelp({ onClose }: { onClose: () => void }) {
  const rows: [string, string][] = [
    ["Enter", "Kiểm tra đáp án · sau đó sang câu tiếp theo"],
    ["1 – 4 / A – D", "Chọn đáp án (Trắc nghiệm)"],
    ["Shift + Enter", "Xuống dòng (Viết lại câu, Dịch)"],
    ["Alt + L", "Xem lời giải"],
    ["Alt + ↑ / ↓", "Họ từ trước / kế tiếp"],
    ["Alt + R", "Họ từ ngẫu nhiên"],
    ["Alt + 1 – 7", "Đổi dạng bài"],
    ["Alt + G", "Đổi mức hỗ trợ"],
    ["Alt + S", "Bắt đầu buổi luyện đề xuất"],
    ["/ hoặc Alt + T", "Tìm họ từ (Enter mở kết quả đầu)"],
    ["Esc", "Thoát ô tìm kiếm · đóng bảng này"],
  ];
  return <div className="wf-keys" id="wf-keys" role="dialog" aria-label="Phím tắt">
    <div className="wf-keys-head"><strong>Phím tắt</strong><button type="button" aria-label="Đóng" onClick={onClose}><X size={16} /></button></div>
    <dl>{rows.map(([key, label]) => <div key={key}><dt><kbd>{key}</kbd></dt><dd>{label}</dd></div>)}</dl>
    <p>Mỗi họ từ có một câu nguồn song ngữ. Ba mức hỗ trợ dùng chung ngân hàng câu. Trắc nghiệm chỉ dùng họ từ có bốn dạng phân biệt và không có cảnh báo nguồn; câu dịch/viết lại tự đối chiếu, không chấm máy.</p>
  </div>;
}

function ExercisePrompt({ family, mode, guidance }: { family: WordFamily; mode: WordFormationMode; guidance: WordFormationGuidance }) {
  const bad = wrongForm(family);
  const prompt = mode === "family" ? `Điền dạng ${posLabels[family.example_pos].toLowerCase()} còn thiếu trong bảng.`
    : mode === "error" ? family.example_blank_en.replace("____", bad ?? "")
      : mode === "rewrite" ? `Viết lại câu sau cho đúng mà vẫn giữ ý: ${family.example_blank_en.replace("____", bad ?? "")}`
        : mode === "translation" ? family.example_vi : family.example_blank_en;
  return <div className="wf-prompt"><span>Câu hỏi</span><p>{prompt}</p>{mode === "context" && <small>Ngữ cảnh nguồn gồm một câu; đọc cả câu để xác định dạng từ phù hợp.</small>}{guidance === "basic" && <small>Gợi ý: vị trí cần {posLabels[family.example_pos].toLowerCase()}. {mode !== "translation" && `Nghĩa gốc: ${family.meaning_vi}.`}</small>}{guidance === "advanced" && <small>Sau khi chọn, hãy tự giải thích vì sao các dạng khác không phù hợp với vị trí này.</small>}</div>;
}

function AnswerFeedback({ family, mode, answer, correct, revealedOnly }: { family: WordFamily; mode: WordFormationMode; answer: string; correct: boolean; revealedOnly: boolean }) {
  const open = openModes.has(mode);
  const headline = revealedOnly ? "Đáp án và giải thích" : open ? "Mẫu để tự đối chiếu" : correct ? "Chính xác" : "Cần luyện lại";
  const tone = revealedOnly || open ? "" : correct ? "is-correct" : "is-wrong";
  return <div className={`wf-feedback ${tone}`} role="status">
    <h3>{!revealedOnly && !open && (correct ? <Check size={17} /> : <X size={17} />)}{headline}</h3>
    <dl>
      {!revealedOnly && !open && !correct && answer.trim() && <div><dt>Bạn trả lời</dt><dd className="wf-strike">{answer}</dd></div>}
      <div><dt>Dạng đúng</dt><dd><b>{sourceAnswer(family)}</b> ({posLabels[family.example_pos]})</dd></div>
      <div><dt>Câu hoàn chỉnh</dt><dd>{completeSentence(family)}</dd></div>
      <div><dt>Dịch</dt><dd>{family.example_vi}</dd></div>
      <div><dt>Giải thích</dt><dd>Vị trí trong câu nguồn dùng {posLabels[family.example_pos].toLowerCase()} của họ từ “{family.noun}”. Đối chiếu cấu trúc câu và nghĩa trước khi dùng dạng khác.</dd></div>
      {mode === "choice" && <div><dt>Các lựa chọn</dt><dd>{positions.map((position) => `${formAt(family, position)} (${posLabels[position]})`).join(" · ")}</dd></div>}
      {open && <div><dt>Tự đối chiếu</dt><dd>Giữ đủ ý chính, đúng ngữ pháp và dùng dạng từ tự nhiên. Có thể có câu đúng khác với mẫu; câu trả lời của bạn không được chấm tự động.</dd></div>}
      {open && answer.trim() && <div><dt>Câu bạn viết</dt><dd>{answer}</dd></div>}
      {family.source_warning && <div><dt>Lưu ý nguồn</dt><dd>{family.source_warning}</dd></div>}
    </dl>
  </div>;
}
