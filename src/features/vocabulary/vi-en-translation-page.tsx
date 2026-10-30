"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import { ArrowLeft, ArrowRight, BookOpenCheck, Lightbulb, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { demoMode } from "@/lib/runtime";
import sourceTopics from "@/lib/vocabulary/ielts-topics.json";
import learningTopics from "@/lib/vocabulary/ielts-learning-topics.json";
import { chooseTranslationSession, compareTranslation, matchesCopiedWord, nextTranslationProgress, ratingForComparison, type TranslationExercise, type TranslationProgress, type WordComparison } from "@/lib/vocabulary/vi-en-translation";
import "./vi-en-translation-page.css";

type ModeFilter = "mixed" | "speaking" | "writing";
type Selection = "new" | "due" | "all";
type PracticeStage = "copy" | "write" | "result";
const topics = [...sourceTopics, ...learningTopics].sort((a, b) => a.localeCompare(b));

export function ViEnTranslationPage() {
  const params = useSearchParams();
  const requestedWord = params.get("word");
  const db = useMemo(() => demoMode ? null : createClient(), []);
  const [topic, setTopic] = useState(topics[0]);
  const [target, setTarget] = useState<{ id: string; topic: string; term: string } | null>(null);
  const [studiedKeys, setStudiedKeys] = useState<string[]>([]);
  const [onlyStudied, setOnlyStudied] = useState(false);
  const [exercises, setExercises] = useState<TranslationExercise[]>([]);
  const [progress, setProgress] = useState<TranslationProgress[]>([]);
  const [mode, setMode] = useState<ModeFilter>("mixed");
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<Selection>("new");
  const [size, setSize] = useState(10);
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [copiedWord, setCopiedWord] = useState("");
  const [stage, setStage] = useState<PracticeStage>("copy");
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [comparison, setComparison] = useState<WordComparison | null>(null);
  const [hint, setHint] = useState(0);
  const cardRef = useRef<HTMLElement>(null);
  const copyInputRef = useRef<HTMLInputElement>(null);
  const answerInputRef = useRef<HTMLTextAreaElement>(null);
  const nextButtonRef = useRef<HTMLButtonElement>(null);
  const [loading, setLoading] = useState(!demoMode);
  const [now, setNow] = useState(() => Date.now());
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  useEffect(() => {
    if (!db) return;
    let active = true;
    void (async () => {
      const keys: string[] = [];
      for (let offset = 0; ; offset += 1000) {
        const { data, error: loadError } = await db.from("vocabulary_studied_words").select("source_id").eq("collection", "ielts").range(offset, offset + 999);
        if (loadError || !active) return;
        keys.push(...(data ?? []).map((item) => item.source_id));
        if ((data ?? []).length < 1000) break;
      }
      if (active) setStudiedKeys((old) => [...new Set([...old, ...keys])]);
    })();
    return () => { active = false; };
  }, [db]);

  useEffect(() => {
    if (!db || !requestedWord) return;
    let active = true;
    void db.from("vi_en_translation_exercises").select("id,topic,term")
      .eq("status", "published").eq("canonical_source_key", requestedWord).limit(1).then(({ data, error: lookupError }) => {
        if (!active) return;
        if (lookupError) { setError(lookupError.message); return; }
        const match = data?.[0];
        if (!match) { setNotice("Từ này chưa có câu luyện dịch được xuất bản. Hãy chọn từ khác hoặc luyện theo chủ đề."); return; }
        setTarget(match); setTopic(match.topic); setSearch(match.term); setSelection("all");
      });
    return () => { active = false; };
  }, [db, requestedWord]);

  useEffect(() => {
    if (!db || !topic) return;
    let active = true;
    void (async () => {
      const { data, error: exerciseError } = await db.from("vi_en_translation_exercises")
        .select("id,topic,mode,term,meaning_vi,canonical_source_key,pattern,collocations,prompt_vi,reference_en,alternatives,editor_note,revision")
        .eq("status", "published").eq("topic", topic).order("id").range(0, 999);
      if (exerciseError) throw exerciseError;
      const allProgress: TranslationProgress[] = [];
      for (let offset = 0; offset < 15000; offset += 1000) {
        const result = await db.from("user_vi_en_translation_progress")
          .select("exercise_id,first_seen_at,last_reviewed_at,due_at,interval_days,repetitions,last_rating,attempts_count")
          .range(offset, offset + 999);
        if (result.error) throw result.error;
        allProgress.push(...((result.data ?? []) as TranslationProgress[]));
        if ((result.data ?? []).length < 1000) break;
      }
      if (!active) return;
      const list = (data ?? []) as TranslationExercise[];
      setExercises(list); setProgress(allProgress);
      setSessionIds([]); setIndex(0); setAnswer(""); setCopiedWord(""); setStage("copy"); setCopyError(""); setComparison(null); setHint(0);
      if (target?.topic === topic && list.some((item) => item.id === target.id)) {
        setSessionIds([target.id]);
      } else {
        const saved = window.localStorage.getItem(`vi-en-session:${topic}`);
        if (saved) {
        try {
          const value = JSON.parse(saved) as { ids: string[]; index: number };
          const ids = value.ids.filter((id) => list.some((item) => item.id === id));
          if (ids.length && value.index < ids.length) { setSessionIds(ids); setIndex(Math.max(0, value.index)); }
        } catch { window.localStorage.removeItem(`vi-en-session:${topic}`); }
        }
      }
      setLoading(false);
    })().catch((reason: Error) => { if (active) { setError(reason.message); setLoading(false); } });
    return () => { active = false; };
  }, [db, topic, target]);

  const progressById = useMemo(() => new Map(progress.map((item) => [item.exercise_id, item])), [progress]);
  const filtered = exercises.filter((item) => (mode === "mixed" || item.mode === mode)
    && item.term.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
    && (!onlyStudied || !!item.canonical_source_key && studiedKeys.includes(item.canonical_source_key)));
  const studied = filtered.filter((item) => progressById.has(item.id)).length;
  const due = filtered.filter((item) => progressById.has(item.id) && Date.parse(progressById.get(item.id)!.due_at) <= now).length;
  const current = exercises.find((item) => item.id === sessionIds[index]);
  const done = sessionIds.length > 0 && index >= sessionIds.length;

  useEffect(() => {
    if (!current) return;
    cardRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [current, stage]);

  useEffect(() => {
    if (!current) return;
    if (stage === "copy") copyInputRef.current?.focus({ preventScroll: true });
    if (stage === "write") answerInputRef.current?.focus({ preventScroll: true });
    if (stage === "result" && !saving) nextButtonRef.current?.focus({ preventScroll: true });
  }, [current, stage, saving]);

  function start() {
    const picked = chooseTranslationSession(filtered, progress, selection, size);
    if (!picked.length) { setNotice(selection === "due" ? "Chưa có câu đến hạn ôn trong chủ đề này." : "Chưa có câu phù hợp. Hãy đổi bộ lọc."); return; }
    const ids = picked.map((item) => item.id);
    setSessionIds(ids); setIndex(0); setAnswer(""); setCopiedWord(""); setStage("copy"); setSettingsOpen(false); setCopyError(""); setComparison(null); setHint(0); setNotice(""); setNow(Date.now());
    window.localStorage.setItem(`vi-en-session:${topic}`, JSON.stringify({ ids, index: 0 }));
  }

  function checkCopiedWord() {
    if (!current) return;
    if (!matchesCopiedWord(copiedWord, current.term)) { setCopyError("Chưa khớp từ mục tiêu. Hãy kiểm tra lại cách viết."); return; }
    setStage("write"); setCopyError("");
    if (db && current.canonical_source_key && !studiedKeys.includes(current.canonical_source_key)) {
      const key = current.canonical_source_key;
      void db.from("vocabulary_studied_words").insert({ collection: "ielts", source_id: key }).then(({ error: insertError }) => {
        if (!insertError || insertError.code === "23505") setStudiedKeys((old) => old.includes(key) ? old : [...old, key]);
      });
    }
  }

  async function checkSentence(skipped = false) {
    if (!current || saving || stage !== "write" || (!answer.trim() && !skipped)) return;
    const result = compareTranslation(skipped ? "" : answer, current.reference_en, current.alternatives);
    setComparison(result); setStage("result");
    if (!db) return;
    setSaving(true); setError("");
    const user = await db.auth.getUser();
    if (!user.data.user) { setError("Bạn cần đăng nhập để lưu tiến độ."); setSaving(false); return; }
    const attempt = await db.from("user_vi_en_translation_attempts").insert({
      user_id: user.data.user.id, exercise_id: current.id, submitted_en: skipped ? "" : answer.trim(), viewed_answer: true,
      self_rating: ratingForComparison(result), source_revision: current.revision,
    });
    if (attempt.error) { setError(attempt.error.message); setSaving(false); return; }
    const next = nextTranslationProgress(current.id, progressById.get(current.id), ratingForComparison(result), new Date(), user.data.user.id);
    const saved = await db.from("user_vi_en_translation_progress").upsert(next, { onConflict: "user_id,exercise_id" });
    if (saved.error) { setError(`Đã lưu bài làm nhưng chưa cập nhật lịch ôn: ${saved.error.message}`); setSaving(false); return; }
    setProgress((old) => [...old.filter((item) => item.exercise_id !== current.id), next]);
    setSaving(false); setNow(Date.parse(next.last_reviewed_at));
  }

  function next() {
    const nextIndex = index + 1;
    setIndex(nextIndex); setAnswer(""); setCopiedWord(""); setStage("copy"); setCopyError(""); setComparison(null); setHint(0);
    window.localStorage.setItem(`vi-en-session:${topic}`, JSON.stringify({ ids: sessionIds, index: nextIndex }));
  }

  function onCopyKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter" || event.nativeEvent.isComposing) return;
    event.preventDefault();
    checkCopiedWord();
  }

  function onAnswerKeyDown(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
    event.preventDefault();
    void checkSentence();
  }

  const sessionActive = Boolean(current || done);

  return <main className={"translation-page" + (sessionActive ? " is-active" : "")}>
    <header className="translation-heading">
      <div className="translation-heading-row">
        <Link href="/app/vocabulary"><ArrowLeft size={17} /> Từ vựng</Link>
        {sessionActive && <button type="button" className="translation-settings-toggle" aria-expanded={settingsOpen} onClick={() => setSettingsOpen((open) => !open)}>{settingsOpen ? "Ẩn bộ lọc" : "Đổi bộ lọc"}</button>}
      </div>
      <span>HỌC TỪ · CHÉP TỪ · VIẾT CÂU</span>
      <h1>{sessionActive ? "Luyện dịch câu Việt → Anh" : "Viết câu tiếng Anh theo ý của bạn"}</h1>
      {!sessionActive && <p>Chọn bài luyện, chép từ mục tiêu rồi viết câu. Kết quả được chấm theo từng từ.</p>}
    </header>

    {(!sessionActive || settingsOpen) && <>
      <section className="translation-controls" aria-label="Chọn bài luyện dịch">
        <label>Chủ đề<select value={topic} onChange={(event) => { setLoading(true); setError(""); setTopic(event.target.value); }}>{topics.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Loại câu<select value={mode} onChange={(event) => { setMode(event.target.value as ModeFilter); setSessionIds([]); window.localStorage.removeItem("vi-en-session:" + topic); }}><option value="mixed">Speaking + Writing</option><option value="speaking">Speaking</option><option value="writing">Writing</option></select></label>
        <label>Học / ôn<select value={selection} onChange={(event) => setSelection(event.target.value as Selection)}><option value="new">Câu chưa luyện</option><option value="due">Đến hạn ôn</option><option value="all">Tất cả câu</option></select></label>
        <label>Số câu<select value={size} onChange={(event) => setSize(Number(event.target.value))}><option value={5}>5 câu</option><option value={10}>10 câu</option><option value={20}>20 câu</option></select></label>
        <label>Tìm từ<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Từ mục tiêu…" /></label>
        <button className="translation-primary" type="button" disabled={loading || !exercises.length} onClick={start}>{sessionIds.length ? "Bắt đầu lượt mới" : "Bắt đầu học"} <ArrowRight size={17} /></button>
        <label className="translation-studied-filter"><input type="checkbox" checked={onlyStudied} onChange={(event) => setOnlyStudied(event.target.checked)} /> Chỉ luyện các từ đã học trong bộ IELTS ({studiedKeys.length})</label>
      </section>
      <div className="translation-stats"><span><strong>{filtered.length}</strong> câu có thể học</span><span><strong>{studied}</strong> câu đã học</span><span><strong>{due}</strong> câu đến hạn ôn</span></div>
    </>}

    {loading && <section className="translation-empty">Đang tải bài luyện…</section>}
    {error && <p className="translation-error" role="alert">{error}</p>}
    {notice && <p className="translation-notice" role="status">{notice}</p>}
    {!loading && !exercises.length && <section className="translation-empty"><BookOpenCheck size={32} /><h2>Chủ đề này chưa có câu luyện</h2><p>Hãy thử chủ đề khác.</p></section>}
    {!loading && exercises.length > 0 && !sessionIds.length && <section className="translation-empty"><Lightbulb size={30} /><h2>Sẵn sàng luyện dịch</h2><p>{filtered.length} câu trong chủ đề này. Chọn số câu và bấm “Bắt đầu học”.</p></section>}
    {done && <section className="translation-empty translation-done"><BookOpenCheck size={34} /><h2>Hoàn thành {sessionIds.length} câu</h2><p>Kết quả khớp từ đã được dùng để lên lịch ôn các câu cần luyện lại.</p><button className="translation-primary" type="button" onClick={start}><RotateCcw size={17} /> Luyện lượt khác</button></section>}

    {current && <section ref={cardRef} className="translation-card" aria-label={"Câu " + (index + 1) + " trên " + sessionIds.length}>
      <div className="translation-card-top">
        <span>{current.mode === "speaking" ? "IELTS SPEAKING" : "IELTS WRITING"} · {topic}</span>
        <strong>Câu {index + 1}/{sessionIds.length}</strong>
      </div>
      <div className="translation-track" role="progressbar" aria-label="Tiến độ lượt luyện" aria-valuemin={0} aria-valuemax={sessionIds.length} aria-valuenow={index + (stage === "result" ? 1 : 0)}><span style={{ width: String(((index + (stage === "result" ? 1 : 0)) / sessionIds.length) * 100) + "%" }} /></div>

      {stage === "copy" && <div className="translation-stage">
        <span className="translation-step-label">01 / 03 · HỌC VÀ CHÉP TỪ</span>
        <h2>Chép lại từ vựng</h2>
        <p className="translation-stage-intro">Nhìn từ và nghĩa, sau đó tự gõ lại để nhớ cách viết.</p>
        <div className="translation-target-word"><strong lang="en">{current.term}</strong>{current.meaning_vi && <span>{current.meaning_vi}</span>}</div>
        <label className="translation-answer-label">Từ tiếng Anh của bạn<input ref={copyInputRef} value={copiedWord} onChange={(event) => { setCopiedWord(event.target.value); setCopyError(""); }} onKeyDown={onCopyKeyDown} placeholder="Gõ lại từ ở đây…" autoComplete="off" spellCheck={false} /></label>
        {copyError && <p className="translation-copy-error" role="alert">{copyError}</p>}
        <div className="translation-actions"><button className="translation-primary" type="button" disabled={!copiedWord.trim()} onClick={checkCopiedWord}>Kiểm tra từ <ArrowRight size={17} /></button><span className="translation-key-hint"><kbd>Enter</kbd> để tiếp tục</span></div>
      </div>}

      {stage === "write" && <div className="translation-stage">
        <span className="translation-step-label">02 / 03 · VIẾT CÂU</span>
        <h2>Dịch câu này sang tiếng Anh</h2>
        <p className="translation-target-inline">Từ mục tiêu: <b lang="en">{current.term}</b></p>
        <p className="translation-prompt" lang="vi">{current.prompt_vi}</p>
        <div className="translation-hint-actions"><button type="button" onClick={() => setHint((old) => Math.min(old + 1, 2))} disabled={hint === 2}><Lightbulb size={16} /> {hint === 0 ? "Gợi ý từ" : hint === 1 ? "Gợi ý cấu trúc" : "Đã mở gợi ý"}</button>{hint >= 1 && <span>Từ mục tiêu: <b>{current.term}</b>{current.meaning_vi ? " · " + current.meaning_vi : ""}</span>}{hint >= 2 && <span>Mẫu dùng: {current.pattern || current.collocations || "Tự chọn cấu trúc phù hợp."}</span>}</div>
        <label className="translation-answer-label">Câu tiếng Anh của bạn<textarea ref={answerInputRef} rows={4} value={answer} onChange={(event) => setAnswer(event.target.value)} onKeyDown={onAnswerKeyDown} placeholder="Viết câu dịch của bạn ở đây…" spellCheck autoComplete="off" /></label>
        <div className="translation-actions"><button className="translation-primary" type="button" disabled={!answer.trim() || saving} onClick={() => void checkSentence()}>Kiểm tra câu <ArrowRight size={17} /></button><button type="button" disabled={saving} onClick={() => void checkSentence(true)}>Bỏ qua câu</button><span className="translation-key-hint"><kbd>Enter</kbd> nộp câu · <kbd>Shift</kbd> + <kbd>Enter</kbd> xuống dòng</span></div>
      </div>}

      {stage === "result" && comparison && <div className="translation-stage translation-result">
        <span className="translation-step-label">03 / 03 · KẾT QUẢ</span>
        <h2>Kết quả câu của bạn</h2>
        <div className="translation-score" role="status"><strong>{comparison.matched}/{comparison.total} từ khớp · {comparison.accuracy}%</strong><span>{comparison.extra > 0 ? comparison.extra + " từ bạn viết chưa khớp câu mẫu." : "Không có từ thừa so với câu mẫu."}</span></div>
        <div className="translation-actions"><button ref={nextButtonRef} className="translation-primary" type="button" disabled={saving} onClick={next}>{saving ? "Đang lưu…" : index + 1 === sessionIds.length ? "Xem tổng kết" : "Câu tiếp theo"} <ArrowRight size={17} /></button><span className="translation-key-hint"><kbd>Enter</kbd> để tiếp tục</span></div>
        <div className="translation-word-diff"><div><b>Câu bạn viết</b><p>{comparison.answerWords.length ? comparison.answerWords.map((item, wordIndex) => <span key={wordIndex} className={item.matched ? "matched" : "missed"}>{item.word} </span>) : "Bạn đã bỏ qua câu này."}</p></div><div><b>Câu mẫu gần nhất</b><p lang="en">{comparison.referenceWords.map((item, wordIndex) => <span key={wordIndex} className={item.matched ? "matched" : "missed"}>{item.word} </span>)}</p></div></div>
        <div className="translation-reference"><span>CÂU MẪU THAM KHẢO</span><p lang="en">{comparison.reference}</p>{current.alternatives.length > 0 && <small>Cách diễn đạt khác: {current.alternatives.join(" · ")}</small>}{current.editor_note && <small>{current.editor_note}</small>}</div>
        <p className="translation-disclaimer">Điểm này đo các từ trùng với câu mẫu theo đúng thứ tự, chưa đánh giá đầy đủ ngữ pháp hoặc những cách diễn đạt khác vẫn đúng.</p>
      </div>}
    </section>}
  </main>;
}
