"use client";

import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { ArrowRight, Lightbulb, RotateCcw } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { demoMode } from "@/lib/runtime";
import sourceTopics from "@/lib/vocabulary/ielts-topics.json";
import learningTopics from "@/lib/vocabulary/ielts-learning-topics.json";
import { promptWordHints, type PromptHint } from "@/lib/vocabulary/vi-en-word-hints";
import { chooseTranslationSession, compareTranslation, matchesCopiedWord, nextTranslationProgress, type TranslationExercise, type TranslationProgress, type TranslationRating, type WordComparison } from "@/lib/vocabulary/vi-en-translation";
import "./vi-en-translation-page.css";
import { VocabPageHeader } from "./vocab-page-header";
import { Sticker } from "@/components/stickers/stickers";

type ModeFilter = "mixed" | "speaking" | "writing";
type Selection = "new" | "due" | "all";
type PracticeStage = "copy" | "write" | "result";
const topics = [...sourceTopics, ...learningTopics].sort((a, b) => a.localeCompare(b));
const ratingOptions: { value: TranslationRating; label: string; detail: string }[] = [
  { value: "again", label: "Chưa nhớ", detail: "Ôn lại sau 10 phút" },
  { value: "hard", label: "Khó", detail: "Ôn lại ngày mai" },
  { value: "good", label: "Ổn", detail: "Ôn lại sau ít nhất 3 ngày" },
  { value: "easy", label: "Dễ", detail: "Ôn lại sau ít nhất 7 ngày" },
];

function VietnamesePrompt({ prompt, hints }: { prompt: string; hints: PromptHint[] }) {
  let cursor = 0;
  const parts: ReactNode[] = [];
  for (const [index, hint] of hints.entries()) {
    parts.push(prompt.slice(cursor, hint.start));
    parts.push(hint.english.length ? <button key={index} type="button" className="translation-prompt-word" aria-label={`${hint.phrase}: ${hint.english.join(", ")}`}>
      {hint.text}<span className="translation-word-tooltip" role="tooltip"><small>{hint.phrase}</small><strong lang="en">{hint.english.join(" · ")}</strong></span>
    </button> : <span key={index}>{hint.text}</span>);
    cursor = hint.end;
  }
  parts.push(prompt.slice(cursor));
  return <p className="translation-prompt" lang="vi">{parts}</p>;
}

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
  const [milestone, setMilestone] = useState("all");
  const [difficulty, setDifficulty] = useState("all");
  const [search, setSearch] = useState("");
  const [selection, setSelection] = useState<Selection>("new");
  const [size, setSize] = useState(10);
  const [sessionIds, setSessionIds] = useState<string[]>([]);
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState("");
  const [copiedWord, setCopiedWord] = useState("");
  const [stage, setStage] = useState<PracticeStage>("copy");
  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [copyError, setCopyError] = useState("");
  const [comparison, setComparison] = useState<WordComparison | null>(null);
  const [rated, setRated] = useState<TranslationRating | null>(null);
  const [attemptSaved, setAttemptSaved] = useState(false);
  const [pendingRating, setPendingRating] = useState<TranslationRating | null>(null);
  const [sessionRatings, setSessionRatings] = useState<TranslationRating[]>([]);
  const [hint, setHint] = useState(0);
  const cardRef = useRef<HTMLElement>(null);
  const copyInputRef = useRef<HTMLInputElement>(null);
  const answerInputRef = useRef<HTMLTextAreaElement>(null);
  const resultHeadingRef = useRef<HTMLHeadingElement>(null);
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
        .select("id,topic,mode,milestone,difficulty,term,meaning_vi,canonical_source_key,pattern,collocations,prompt_vi,reference_en,alternatives,editor_note,revision")
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
      setSessionIds([]); setIndex(0); setAnswer(""); setCopiedWord(""); setStage("copy"); setCopyError(""); setComparison(null); setRated(null); setAttemptSaved(false); setPendingRating(null); setSessionRatings([]); setHint(0);
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
  const milestones = [...new Set(exercises.map((item) => item.milestone).filter((value): value is string => Boolean(value)))].sort();
  const filtered = exercises.filter((item) => (mode === "mixed" || item.mode === mode)
    && (milestone === "all" || item.milestone === milestone)
    && (difficulty === "all" || item.difficulty === difficulty)
    && item.term.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase())
    && (!onlyStudied || !!item.canonical_source_key && studiedKeys.includes(item.canonical_source_key)));
  const studied = filtered.filter((item) => progressById.has(item.id)).length;
  const due = filtered.filter((item) => progressById.has(item.id) && Date.parse(progressById.get(item.id)!.due_at) <= now).length;
  const available = selection === "new" ? filtered.length - studied : selection === "due" ? due : filtered.length;
  const current = exercises.find((item) => item.id === sessionIds[index]);
  const promptHints = useMemo(() => current ? promptWordHints(current.prompt_vi, [current.reference_en, ...current.alternatives].join(" "), current.term, current.meaning_vi ?? "") : [], [current]);
  const done = sessionIds.length > 0 && index >= sessionIds.length;

  useEffect(() => {
    if (!current) return;
    cardRef.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [current, stage]);

  useEffect(() => {
    if (!current) return;
    if (stage === "copy") copyInputRef.current?.focus({ preventScroll: true });
    if (stage === "write") answerInputRef.current?.focus({ preventScroll: true });
    if (stage === "result" && !rated && !saving) resultHeadingRef.current?.focus({ preventScroll: true });
    if (stage === "result" && rated && !saving) nextButtonRef.current?.focus({ preventScroll: true });
  }, [current, stage, saving, rated]);

  function start() {
    const picked = chooseTranslationSession(filtered, progress, selection, size);
    if (!picked.length) { setNotice(selection === "due" ? "Chưa có câu đến hạn ôn trong chủ đề này." : "Chưa có câu phù hợp. Hãy đổi bộ lọc."); return; }
    const ids = picked.map((item) => item.id);
    setSessionIds(ids); setIndex(0); setAnswer(""); setCopiedWord(""); setStage("copy"); setCopyError(""); setComparison(null); setRated(null); setAttemptSaved(false); setPendingRating(null); setSessionRatings([]); setHint(0); setNotice(""); setNow(Date.now());
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
    if (skipped) setAnswer("");
    setComparison(result); setStage("result");
  }

  async function saveRating(rating: TranslationRating) {
    if (!current || saving || rated || stage !== "result" || (pendingRating && pendingRating !== rating)) return;
    if (!db) { setRated(rating); setSessionRatings((old) => [...old, rating]); return; }
    setSaving(true); setError("");
    const user = await db.auth.getUser();
    if (!user.data.user) { setError("Bạn cần đăng nhập để lưu tiến độ."); setSaving(false); return; }
    if (!attemptSaved) {
      const attempt = await db.from("user_vi_en_translation_attempts").insert({
        user_id: user.data.user.id, exercise_id: current.id, submitted_en: answer.trim(), viewed_answer: true,
        self_rating: rating, source_revision: current.revision,
      });
      if (attempt.error) { setError(attempt.error.message); setSaving(false); return; }
      setAttemptSaved(true); setPendingRating(rating);
    }
    const next = nextTranslationProgress(current.id, progressById.get(current.id), rating, new Date(), user.data.user.id);
    const saved = await db.from("user_vi_en_translation_progress").upsert(next, { onConflict: "user_id,exercise_id" });
    if (saved.error) { setError(`Đã lưu bài làm nhưng chưa cập nhật lịch ôn: ${saved.error.message}`); setSaving(false); return; }
    setProgress((old) => [...old.filter((item) => item.exercise_id !== current.id), next]);
    setRated(rating); setSessionRatings((old) => [...old, rating]);
    setSaving(false); setNow(Date.parse(next.last_reviewed_at));
  }

  function next() {
    const nextIndex = index + 1;
    if (!rated || saving) return;
    setIndex(nextIndex); setAnswer(""); setCopiedWord(""); setStage("copy"); setCopyError(""); setComparison(null); setRated(null); setAttemptSaved(false); setPendingRating(null); setHint(0);
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

  function onCardKeyDown(event: KeyboardEvent<HTMLElement>) {
    if (stage !== "result" || rated || saving || event.repeat || event.nativeEvent.isComposing || event.altKey || event.ctrlKey || event.metaKey) return;
    const option = ratingOptions[Number(event.key) - 1];
    if (!option || !/^[1-4]$/.test(event.key)) return;
    event.preventDefault();
    void saveRating(option.value);
  }

  const sessionActive = Boolean(current || done);
  function leaveSession() {
    if (((stage === "write" && answer.trim()) || (stage === "result" && !rated)) && !window.confirm("Câu hiện tại chưa được lưu. Bạn muốn chọn bài khác?")) return;
    window.localStorage.removeItem(`vi-en-session:${topic}`);
    setSessionIds([]); setIndex(0); setAnswer(""); setCopiedWord(""); setComparison(null); setRated(null); setAttemptSaved(false); setPendingRating(null); setSessionRatings([]); setStage("copy"); setError(""); setNotice("");
  }

  return <main className={"translation-page" + (sessionActive ? " is-active" : "")}>
    <VocabPageHeader label="Luyện dịch Việt → Anh" title={sessionActive ? "Luyện dịch câu Việt → Anh" : <>Viết câu tiếng Anh <em>theo ý của bạn</em></>}
      description={sessionActive ? undefined : "Chọn câu, tự dịch, đối chiếu câu mẫu rồi đánh giá để lên lịch ôn phù hợp."}
      action={sessionActive && <button type="button" className="translation-settings-toggle" onClick={leaveSession}>Chọn bài khác</button>} />

    {!sessionActive && <>
      <section className="translation-controls" aria-label="Chọn bài luyện dịch">
        <label className="translation-topic-field">Chủ đề<select value={topic} onChange={(event) => { setLoading(true); setError(""); setMilestone("all"); setTopic(event.target.value); }}>{topics.map((item) => <option key={item}>{item}</option>)}</select></label>
        <label>Học / ôn<select value={selection} onChange={(event) => setSelection(event.target.value as Selection)}><option value="new">Câu chưa luyện</option><option value="due">Đến hạn ôn</option><option value="all">Tất cả câu</option></select></label>
        <label>Số câu<select value={size} onChange={(event) => setSize(Number(event.target.value))}><option value={5}>5 câu</option><option value={10}>10 câu</option><option value={20}>20 câu</option></select></label>
        <div className="translation-control-footer"><span><strong>{available}</strong> câu phù hợp</span><button className="translation-primary" type="button" disabled={loading || available === 0} onClick={start}>Bắt đầu luyện <ArrowRight size={17} /></button></div>
        <button className="translation-advanced-toggle" type="button" aria-expanded={advancedOpen} aria-controls="translation-advanced" onClick={() => setAdvancedOpen((open) => !open)}>{advancedOpen ? "Ẩn tùy chọn" : "Thêm tùy chọn"}</button>
        {advancedOpen && <div className="translation-advanced" id="translation-advanced">
          <label>Mốc học<select value={milestone} onChange={(event) => setMilestone(event.target.value)}><option value="all">Tất cả mốc</option>{milestones.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
          <label>Loại câu<select value={mode} onChange={(event) => setMode(event.target.value as ModeFilter)}><option value="mixed">Speaking + Writing</option><option value="speaking">Speaking</option><option value="writing">Writing</option></select></label>
          <label>Độ khó<select value={difficulty} onChange={(event) => setDifficulty(event.target.value)}><option value="all">Dễ + khó</option><option value="easy">Dễ</option><option value="hard">Khó</option></select></label>
          <label>Tìm từ<input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Từ mục tiêu…" /></label>
          <label className="translation-studied-filter"><input type="checkbox" checked={onlyStudied} onChange={(event) => setOnlyStudied(event.target.checked)} /> Chỉ luyện các từ đã học trong bộ IELTS ({studiedKeys.length})</label>
        </div>}
      </section>
      <div className="translation-stats"><span><strong>{filtered.length}</strong> câu trong bộ lọc</span><span><strong>{studied}</strong> câu đã luyện</span><span><strong>{due}</strong> câu đến hạn ôn</span></div>
    </>}

    {loading && <section className="translation-empty">Đang tải bài luyện…</section>}
    {error && <p className="translation-error" role="alert">{error}</p>}
    {notice && <p className="translation-notice" role="status">{notice}</p>}
    {!loading && !exercises.length && <section className="translation-empty"><Sticker name="book" size={64} tilt={-6} /><h2>Chủ đề này chưa có câu luyện</h2><p>Hãy thử chủ đề khác.</p></section>}
    {!loading && exercises.length > 0 && !sessionIds.length && <section className="translation-empty translation-ready"><Sticker name="bulb" size={56} tilt={6} /><h2>{available ? "Sẵn sàng luyện dịch" : "Không có câu phù hợp"}</h2><p>{available ? "Mỗi câu gồm từ mục tiêu, câu cần dịch và câu mẫu để đối chiếu. Bạn tự đánh giá sau khi xem đáp án." : "Hãy đổi chế độ học hoặc bộ lọc để chọn câu khác."}</p></section>}
    {done && <section className="translation-empty translation-done"><Sticker name="star" size={64} tilt={6} /><h2>Hoàn thành {sessionIds.length} câu</h2><p>Đã lưu {sessionRatings.length} lượt tự đánh giá và lên lịch ôn theo mức bạn chọn.</p><div className="translation-done-actions"><button className="translation-primary" type="button" onClick={start}><RotateCcw size={17} /> Luyện lượt khác</button><button type="button" className="translation-settings-toggle" onClick={leaveSession}>Chọn bài khác</button></div></section>}

    {current && <section ref={cardRef} className="translation-card" aria-label={"Câu " + (index + 1) + " trên " + sessionIds.length} onKeyDown={onCardKeyDown}>
      <div className="translation-card-top">
        <span>{current.mode === "speaking" ? "IELTS SPEAKING" : "IELTS WRITING"} · {topic}{current.milestone ? ` · ${current.milestone}` : ""}{current.difficulty ? ` · ${current.difficulty === "easy" ? "Dễ" : "Khó"}` : ""}</span>
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
        <div className="translation-actions"><button className="translation-primary" type="button" disabled={!copiedWord.trim()} onClick={checkCopiedWord}>Kiểm tra từ <ArrowRight size={17} /></button><button type="button" onClick={() => { setCopyError(""); setStage("write"); }}>Bỏ qua bước chép từ</button><span className="translation-key-hint"><kbd>Enter</kbd> để tiếp tục</span></div>
      </div>}

      {stage === "write" && <div className="translation-stage">
        <span className="translation-step-label">02 / 03 · VIẾT CÂU</span>
        <h2>Dịch câu này sang tiếng Anh</h2>
        <p className="translation-target-inline">Từ mục tiêu: <b lang="en">{current.term}</b></p>
        <VietnamesePrompt prompt={current.prompt_vi} hints={promptHints} />
        <p className="translation-hover-instruction">Chạm hoặc dùng Tab vào từ gạch chân để xem gợi ý. <a href="https://github.com/thichhoc-org/thichhoc-dict" target="_blank" rel="noreferrer">Nguồn từ điển</a> (CC BY-SA 4.0).</p>
        <div className="translation-hint-actions"><button type="button" onClick={() => setHint((old) => Math.min(old + 1, 2))} disabled={hint === 2}><Lightbulb size={16} /> {hint === 0 ? "Gợi ý từ" : hint === 1 ? "Gợi ý cấu trúc" : "Đã mở gợi ý"}</button>{hint >= 1 && <span>Từ mục tiêu: <b>{current.term}</b>{current.meaning_vi ? " · " + current.meaning_vi : ""}</span>}{hint >= 2 && <span>Mẫu dùng: {current.pattern || current.collocations || "Tự chọn cấu trúc phù hợp."}</span>}</div>
        <label className="translation-answer-label">Câu tiếng Anh của bạn<textarea ref={answerInputRef} rows={4} value={answer} onChange={(event) => setAnswer(event.target.value)} onKeyDown={onAnswerKeyDown} placeholder="Viết câu dịch của bạn ở đây…" spellCheck autoComplete="off" /></label>
        <div className="translation-actions"><button className="translation-primary" type="button" disabled={!answer.trim() || saving} onClick={() => void checkSentence()}>Kiểm tra câu <ArrowRight size={17} /></button><button type="button" disabled={saving} onClick={() => void checkSentence(true)}>Bỏ qua câu</button><span className="translation-key-hint"><kbd>Enter</kbd> nộp câu · <kbd>Shift</kbd> + <kbd>Enter</kbd> xuống dòng</span></div>
      </div>}

      {stage === "result" && comparison && <div className="translation-stage translation-result">
        <span className="translation-step-label">03 / 03 · ĐỐI CHIẾU VÀ TỰ ĐÁNH GIÁ</span>
        <h2 ref={resultHeadingRef} tabIndex={-1}>So sánh cách diễn đạt</h2>
        <p className="translation-stage-intro">Câu mẫu chỉ là một cách dịch. Hãy xem ý nghĩa, từ vựng và ngữ pháp trước khi chọn mức độ nhớ.</p>
        <p className="translation-rating-shortcut">Sau khi đối chiếu, nhấn <kbd>1</kbd>–<kbd>4</kbd> để đánh giá; nhấn <kbd>Enter</kbd> để sang câu tiếp.</p>
        <div className="translation-word-diff"><div><b>Câu bạn viết</b><p lang="en">{answer.trim() || "Bạn đã bỏ qua câu này."}</p></div><div className="translation-reference"><b>Câu mẫu tham khảo</b><p lang="en">{comparison.reference}</p></div></div>
        {current.alternatives.length > 0 && <p className="translation-alternatives">Cách diễn đạt khác: <span lang="en">{current.alternatives.join(" · ")}</span></p>}
        {current.editor_note && <p className="translation-editor-note">{current.editor_note}</p>}
        {answer.trim() && <details className="translation-comparison"><summary>Xem những từ trùng với câu mẫu</summary><p>Phần gạch màu chỉ so sánh từ theo đúng thứ tự; cách dịch khác vẫn có thể đúng.</p><div className="translation-word-diff"><div><b>Câu bạn viết</b><p lang="en">{comparison.answerWords.map((item, wordIndex) => <span key={wordIndex} className={item.matched ? "matched" : "missed"}>{item.word} </span>)}</p></div><div><b>Câu mẫu</b><p lang="en">{comparison.referenceWords.map((item, wordIndex) => <span key={wordIndex} className={item.matched ? "matched" : "missed"}>{item.word} </span>)}</p></div></div></details>}
        <div className="translation-rating" role="group" aria-label="Tự đánh giá mức độ nhớ"><div><h3>Bạn nhớ câu này đến mức nào?</h3><p>Nhấn phím 1–4 hoặc chọn một mức để lưu bài và lên lịch ôn.</p></div><div className="translation-rating-options">{ratingOptions.map((option, optionIndex) => <button key={option.value} type="button" aria-keyshortcuts={String(optionIndex + 1)} aria-pressed={rated === option.value} disabled={saving || !!rated || (!!pendingRating && pendingRating !== option.value)} className={rated === option.value || pendingRating === option.value ? "is-selected" : ""} onClick={() => void saveRating(option.value)}><kbd aria-hidden="true">{optionIndex + 1}</kbd><strong>{option.label}</strong><small>{option.detail}</small></button>)}</div></div>
        <div className="translation-actions">{rated ? <><span className="translation-saved" role="status">Đã lưu · {ratingOptions.find((option) => option.value === rated)?.detail}</span><button ref={nextButtonRef} className="translation-primary" type="button" onClick={next}>{index + 1 === sessionIds.length ? "Xem tổng kết" : "Câu tiếp theo"} <ArrowRight size={17} /></button></> : <><button type="button" disabled={saving || attemptSaved} onClick={() => { setComparison(null); setStage("write"); }}>Viết lại câu</button>{saving && <span role="status">Đang lưu đánh giá…</span>}</>}</div>
      </div>}
    </section>}
  </main>;
}
