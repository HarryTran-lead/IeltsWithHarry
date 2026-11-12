"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { ArrowDown, ArrowRight, Check, RotateCcw, Volume2 } from "lucide-react";
import { TranslationModeLink } from "./translation-mode-link";
import { createClient } from "@/lib/supabase/browser";
import { demoMode } from "@/lib/runtime";
import { bandExercises, levelRubric, type BandExercise } from "@/lib/translation/band-practice";
import { compareWords } from "@/lib/translation/compare-words";
import "./translation-workspace.css";
// Loaded after the older stylesheet so the "Luyện diễn đạt" layout wins equal-specificity ties.
import "./expression-practice.css";

type Rating = "again" | "hard" | "good" | "easy";
type SavedReview = { rating: Rating; reviewedAt: string };
type Phase = "copy" | "translate" | "review";

const ratingLabels: { value: Rating; label: string }[] = [
  { value: "again", label: "Chưa nhớ" },
  { value: "hard", label: "Khó" },
  { value: "good", label: "Ổn" },
  { value: "easy", label: "Dễ" },
];

/**
 * The 17 practice bands grouped by what the learner writes: words and phrases, single
 * sentences, sentences that argue, then paragraphs (matching the rubric's units).
 */
const stages = [
  { name: "Từ và cụm từ", detail: "từ đơn đến câu ngắn", bands: ["1.0", "1.5", "2.0", "2.5"] },
  { name: "Câu đơn", detail: "kể, kế hoạch, nguyên nhân", bands: ["3.0", "3.5", "4.0", "4.5"] },
  { name: "Câu có lập luận", detail: "quan điểm, so sánh, hệ quả", bands: ["5.0", "5.5", "6.0", "6.5"] },
  { name: "Đoạn văn", detail: "lập luận nhiều câu", bands: ["7.0", "7.5", "8.0", "8.5", "9.0"] },
];

function unitLabel(unit?: string) {
  return unit === "word" ? "Từ" : unit === "phrase" ? "Cụm từ" : unit === "phrase-or-short-sentence" ? "Cụm từ, câu ngắn" : unit === "paragraph" ? "Đoạn văn" : "Câu";
}

function normalize(value: string) {
  return value.trim().toLocaleLowerCase("en-US").replace(/\s+/g, " ").replace(/[.!?]$/, "");
}

function reviewKey(item: BandExercise) {
  return item.version === 1 ? item.id : `${item.id}:v${item.version}`;
}

function interleavePatterns(items: BandExercise[]) {
  const groups = new Map<string, BandExercise[]>();
  for (const item of items) groups.set(item.source, [...(groups.get(item.source) ?? []), item]);
  const ordered: BandExercise[] = [];
  while ([...groups.values()].some((group) => group.length)) {
    for (const group of groups.values()) {
      const next = group.shift();
      if (next) ordered.push(next);
    }
  }
  return ordered;
}

function speak(value: string) {
  if (!("speechSynthesis" in window)) return;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(value);
  utterance.lang = "en-GB";
  utterance.rate = 0.85;
  window.speechSynthesis.speak(utterance);
}

export function TranslationWorkspace() {
  const [band, setBand] = useState("5.0");
  const [sessionSize, setSessionSize] = useState(10);
  const [reviewOnly, setReviewOnly] = useState(false);
  const [reviews, setReviews] = useState<Record<string, SavedReview>>({});
  const [storageKey, setStorageKey] = useState("");
  const [session, setSession] = useState<BandExercise[]>([]);
  const [position, setPosition] = useState(0);
  const [phase, setPhase] = useState<Phase>("copy");
  const [copyAnswer, setCopyAnswer] = useState("");
  const [copyError, setCopyError] = useState(false);
  const [translation, setTranslation] = useState("");
  const [showHint, setShowHint] = useState(false);
  const [finished, setFinished] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    let active = true;
    async function load() {
      const userId = demoMode ? "demo" : (await createClient().auth.getUser()).data.user?.id;
      if (!active || !userId) return;
      const key = `ieltswithharry-band-translation-v1:${userId}`;
      try { setReviews(JSON.parse(localStorage.getItem(key) ?? "{}") as Record<string, SavedReview>); }
      catch { setReviews({}); }
      setStorageKey(key);
    }
    void load();
    return () => { active = false; };
  }, []);

  const current = session[position];
  const bandItems = useMemo(() => bandExercises.filter((item) => item.practiceLevel === band), [band]);
  const currentRubric = levelRubric.find((item) => item.level === band);
  const inSession = session.length > 0;
  const sessionRef = useRef<HTMLElement>(null);
  // A session replaces the hero and the band picker, so the exercise starts at the top.
  useEffect(() => {
    if (inSession) sessionRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [inSession]);

  function start() {
    const eligible = bandItems.filter((item) => reviewOnly
      ? reviews[reviewKey(item)]?.rating === "again" || reviews[reviewKey(item)]?.rating === "hard"
      : !reviews[reviewKey(item)]);
    if (!eligible.length) {
      setMessage(reviewOnly
        ? "Band này chưa có câu cần ôn. Hãy chọn band khác hoặc làm bài mới."
        : "Bạn đã làm hết bài mới ở band này. Chọn ôn câu khó hoặc band khác.");
      return;
    }
    setSession(interleavePatterns(eligible).slice(0, sessionSize));
    setPosition(0);
    setPhase("copy");
    setCopyAnswer("");
    setCopyError(false);
    setTranslation("");
    setShowHint(false);
    setFinished(false);
    setMessage("");
  }

  function checkCopy() {
    if (!current) return;
    if (normalize(copyAnswer) === normalize(current.targetTerm)) {
      setCopyError(false);
      setPhase("translate");
    } else setCopyError(true);
  }

  function rate(rating: Rating) {
    if (!current || phase !== "review") return;
    const next = { ...reviews, [reviewKey(current)]: { rating, reviewedAt: new Date().toISOString() } };
    setReviews(next);
    if (storageKey) {
      try { localStorage.setItem(storageKey, JSON.stringify(next)); }
      catch { setMessage("Không lưu được tiến độ trên thiết bị này."); }
    }
    if (position + 1 >= session.length) { setFinished(true); return; }
    setPosition(position + 1);
    setPhase("copy");
    setCopyAnswer("");
    setCopyError(false);
    setTranslation("");
    setShowHint(false);
  }

  function leaveSession() {
    setSession([]);
    setFinished(false);
    setMessage("");
  }

  // Keyboard flow while practising: typing fields handle Enter themselves; these keys
  // work anywhere else. 1–4 rate the comparison, Enter continues after a round,
  // Alt+N plays the key word and Alt+G shows or hides the hint.
  const keys = useRef({ rate, start, phase, finished, current, showHint });
  useEffect(() => {
    keys.current = { rate, start, phase, finished, current, showHint };
  });
  useEffect(() => {
    if (!inSession) return;
    function onKey(event: KeyboardEvent) {
      const { rate: rateNow, start: startNow, phase: phaseNow, finished: done, current: item, showHint: hint } = keys.current;
      if (event.altKey && !event.ctrlKey && !event.metaKey) {
        const key = event.key.toLowerCase();
        if (key === "n" && item) { event.preventDefault(); speak(item.targetTerm); }
        if (key === "g" && phaseNow === "translate") { event.preventDefault(); setShowHint(!hint); }
        return;
      }
      const target = event.target as HTMLElement | null;
      if (event.ctrlKey || event.metaKey || target?.closest("input, textarea, select, [contenteditable='true']")) return;
      if (done && event.key === "Enter") { event.preventDefault(); startNow(); return; }
      if (!done && phaseNow === "review") {
        const index = ["1", "2", "3", "4"].indexOf(event.key);
        if (index >= 0) { event.preventDefault(); rateNow(ratingLabels[index].value); }
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [inSession]);

  const sample = bandItems.find((item) => item.type !== "word") ?? bandItems[0];
  const bandStats = (level: string) => {
    const items = bandExercises.filter((item) => item.practiceLevel === level);
    return { done: items.filter((item) => Boolean(reviews[reviewKey(item)])).length, total: items.length };
  };
  const bandDone = bandStats(band);
  const bandHard = bandItems.filter((item) => reviews[reviewKey(item)]?.rating === "again" || reviews[reviewKey(item)]?.rating === "hard").length;
  const bandTopics = new Set(bandItems.map((item) => item.topic)).size;
  function chooseBand(level: string) {
    setBand(level);
    setSession([]);
    setFinished(false);
    setMessage("");
  }

  return <div className="translation-workspace content-page">
    {!inSession && <header className="practice-hero xp-hero">
      <div className="xp-hero-copy">
        <span className="practice-eyebrow">LUYỆN TẬP</span>
        <h1>Luyện diễn đạt</h1>
        <p>Nghĩ bằng tiếng Việt, viết ra tiếng Anh: từ một từ đến cả đoạn văn, qua 17 band luyện tập.</p>
        <ol className="xp-steps" aria-label="Mỗi bài gồm ba bước">
          <li><b>1</b> Học từ khóa</li>
          <li><b>2</b> Viết câu tiếng Anh</li>
          <li><b>3</b> So với câu mẫu</li>
        </ol>
      </div>
      {sample && <figure className="xp-example">
        <figcaption>Ví dụ ở band {band} · {unitLabel(currentRubric?.unit)}</figcaption>
        <p lang="vi">{sample.promptVi}</p>
        <ArrowDown size={16} aria-hidden="true" />
        <p lang="en">{sample.referenceAnswers[0]}</p>
      </figure>}
    </header>}

    {inSession ? <section className="xp-session" ref={sessionRef} aria-label={`Luyện diễn đạt band ${band}`}>
      <div className="xp-session-head">
        <span className="xp-session-title"><strong>Band {band}</strong> · {unitLabel(currentRubric?.unit)}{current && !finished ? ` · ${current.topic}` : ""}</span>
        <span className="xp-session-count">{finished ? "Xong lượt này" : `Bài ${position + 1}/${session.length}`}</span>
        <button type="button" className="practice-secondary" onClick={leaveSession}><RotateCcw size={15} /> Đổi band</button>
      </div>
      <div className="practice-progress" aria-hidden="true"><i style={{ width: `${finished ? 100 : ((position + (phase === "copy" ? 0 : phase === "translate" ? 0.33 : 0.67)) / session.length) * 100}%` }} /></div>
      {message && <p className="practice-message" role="status">{message}</p>}
      {finished ? <div className="practice-done">
        <Check size={34} />
        <h2>Hoàn thành {session.length} bài ở band {band}</h2>
        <p className="practice-muted">Tiến độ được lưu trên trình duyệt này. Luyện tiếp các bài mới ở band này, hoặc đổi sang band khác.</p>
        <div className="practice-actions">
          <button className="practice-primary" type="button" autoFocus onClick={start}>Luyện tiếp {sessionSize} bài <ArrowRight size={18} /><kbd>Enter</kbd></button>
          <button className="practice-secondary" type="button" onClick={leaveSession}>Đổi band</button>
        </div>
      </div> : current ? <div className="xp-exercise" key={`${current.id}-${phase}`}>
        <ol className="practice-stepper" aria-label="Các bước">
          <li className={phase === "copy" ? "active" : "done"}>1 · Chép từ khóa</li>
          <li className={phase === "translate" ? "active" : phase === "review" ? "done" : ""}>2 · Viết bằng tiếng Anh</li>
          <li className={phase === "review" ? "active" : ""}>3 · So với câu mẫu</li>
        </ol>
        {phase === "copy" ? <div className="practice-stage">
          <div className="practice-word"><strong>{current.targetTerm}</strong><span>{current.meaningVi}</span><button type="button" onClick={() => speak(current.targetTerm)} aria-label={`Nghe phát âm ${current.targetTerm}`} title="Nghe (Alt+N)"><Volume2 size={21} /></button></div>
          <label className="practice-field">Gõ lại từ khóa để nhớ cách viết<input value={copyAnswer} onChange={(event) => { setCopyAnswer(event.target.value); setCopyError(false); }} onKeyDown={(event) => {
            if (event.key !== "Enter") return;
            event.preventDefault();
            if (event.shiftKey) setPhase("translate"); else if (copyAnswer.trim()) checkCopy();
          }} autoFocus placeholder={current.targetTerm} autoComplete="off" autoCapitalize="off" spellCheck={false} /></label>
          {copyError && <p className="practice-error" role="alert">Chưa đúng. Nhìn lại từ phía trên và gõ lại.</p>}
          <div className="practice-actions">
            <button type="button" className="practice-primary" onClick={checkCopy} disabled={!copyAnswer.trim()}>Kiểm tra <kbd>Enter</kbd></button>
            <button type="button" className="practice-secondary" onClick={() => setPhase("translate")}>Bỏ qua <kbd>Shift+Enter</kbd></button>
          </div>
        </div> : phase === "translate" ? <div className="practice-stage">
          <span className="practice-stage-label">Diễn đạt {current.type === "word" ? "từ" : current.type === "phrase" ? "cụm từ" : current.type === "paragraph" ? "đoạn" : "câu"} này bằng tiếng Anh</span>
          <blockquote lang="vi">{current.promptVi}</blockquote>
          <label className="practice-field">Câu tiếng Anh của bạn<textarea lang="en" value={translation} onChange={(event) => setTranslation(event.target.value)} onKeyDown={(event) => {
            if (event.key !== "Enter" || event.shiftKey || event.nativeEvent.isComposing) return;
            event.preventDefault();
            if (translation.trim()) setPhase("review");
          }} rows={current.type === "paragraph" ? 5 : 3} maxLength={2000} autoFocus spellCheck={false} placeholder="Viết bằng tiếng Anh…" /></label>
          <div className="practice-actions">
            <button className="practice-primary" type="button" disabled={!translation.trim()} onClick={() => setPhase("review")}>Xem câu mẫu <kbd>Enter</kbd></button>
            <button className="practice-hint-toggle" type="button" onClick={() => setShowHint(!showHint)}>{showHint ? "Ẩn gợi ý" : "Gợi ý từ khóa"} <kbd>Alt+G</kbd></button>
            <small className="xp-key-note">Shift+Enter để xuống dòng</small>
          </div>
          {showHint && <p className="practice-hint">{current.targetTerm} · {current.meaningVi}</p>}
        </div> : (() => {
          const diff = compareWords(translation, current.referenceAnswers[0]);
          return <div className="practice-stage">
            <blockquote lang="vi" className="is-compact">{current.promptVi}</blockquote>
            <div className="practice-comparison">
              <div><small>Bạn viết</small><p lang="en">{diff.mine.map((token, index) => <span key={index} className={token.same ? undefined : "xp-diff-extra"}>{token.text} </span>)}</p></div>
              <div><small>Câu mẫu</small><p lang="en">{diff.model.map((token, index) => <span key={index} className={token.same ? undefined : "xp-diff-missing"}>{token.text} </span>)}</p></div>
            </div>
            <p className="xp-diff-legend"><span className="xp-diff-extra">từ chỉ có trong câu của bạn</span><span className="xp-diff-missing">từ có trong câu mẫu</span> Một ý có nhiều cách diễn đạt đúng, nên chấm theo nghĩa, ngữ pháp và cách dùng từ.</p>
            <p className="xp-tip"><strong>Lưu ý:</strong> {current.explanationVi}</p>
            <div className="practice-ratings" role="group" aria-label="Bạn làm câu này thế nào?">
              <span>Bạn làm câu này thế nào?</span>
              {ratingLabels.map((item, index) => <button key={item.value} type="button" className={`is-${item.value}`} onClick={() => rate(item.value)}><kbd>{index + 1}</kbd>{item.label}</button>)}
            </div>
          </div>;
        })()}
      </div> : null}
    </section> : <section className="xp-setup" aria-label="Chọn band luyện tập">
      <div className="xp-stages">
        <h2>Chọn chặng và band</h2>
        {stages.map((stage, index) => {
          const counts = stage.bands.map(bandStats);
          const done = counts.reduce((sum, item) => sum + item.done, 0);
          const total = counts.reduce((sum, item) => sum + item.total, 0);
          const open = stage.bands.includes(band);
          return <div key={stage.name} className={`xp-stage ${open ? "is-open" : ""}`}>
            <div className="xp-stage-head">
              <span className="xp-stage-index">{index + 1}</span>
              <div><strong>{stage.name}</strong><small>Band {stage.bands[0]}–{stage.bands.at(-1)} · {stage.detail}</small></div>
              <span className="xp-stage-count" aria-label={`Đã làm ${done} trên ${total} bài`}>{done}/{total}</span>
            </div>
            <div className="xp-stage-meter" aria-hidden="true"><i style={{ width: `${total ? (done / total) * 100 : 0}%` }} /></div>
            <div className="xp-bands">{stage.bands.map((level, bandIndex) => {
              const count = counts[bandIndex];
              return <button key={level} type="button" className={band === level ? "selected" : ""} aria-pressed={band === level} onClick={() => chooseBand(level)}>
                <strong>{level}</strong><small>{count.done === count.total && count.total ? <><Check size={12} /> Xong</> : `${count.done}/${count.total}`}</small>
              </button>;
            })}</div>
          </div>;
        })}
        <TranslationModeLink to="topic" />
      </div>

      <aside className="xp-panel" aria-label={`Band ${band}`}>
        <span className="xp-panel-label">Band {band} · {unitLabel(currentRubric?.unit)}</span>
        {currentRubric && <p className="xp-panel-focus">{currentRubric.focusVi}</p>}
        <dl className="xp-panel-stats">
          <div><dt>Bài</dt><dd>{bandItems.length}</dd></div>
          <div><dt>Chủ đề</dt><dd>{bandTopics}</dd></div>
          <div><dt>Đã làm</dt><dd>{bandDone.done}</dd></div>
          <div><dt>Cần ôn</dt><dd>{bandHard}</dd></div>
        </dl>
        <div className="xp-size" role="group" aria-label="Số bài mỗi lượt">
          <span>Số bài mỗi lượt</span>
          <div>{[5, 10, 15].map((size) => <button key={size} type="button" aria-pressed={sessionSize === size} className={sessionSize === size ? "selected" : ""} onClick={() => setSessionSize(size)}>{size}</button>)}</div>
        </div>
        <label className="xp-review-only"><input type="checkbox" checked={reviewOnly} onChange={(event) => setReviewOnly(event.target.checked)} /> Chỉ ôn câu đã đánh dấu khó</label>
        <button className="practice-primary xp-start" type="button" onClick={start}>{reviewOnly ? "Ôn" : "Bắt đầu"} {sessionSize} bài <ArrowRight size={18} /></button>
        {message && <p className="practice-message" role="status">{message}</p>}
        <small className="xp-panel-note">{currentRubric?.noteVi} Band ở đây là mức luyện tập, không phải điểm IELTS được chấm chính thức.{Number(band) >= 7 && " Các nghiên cứu và ví dụ trong bài là tình huống minh họa, không phải dữ kiện trích nguồn."} Tiến độ được lưu trên trình duyệt này.</small>
      </aside>
    </section>}
  </div>;
}
