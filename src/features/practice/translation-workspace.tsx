"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, RotateCcw, Volume2 } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import { demoMode } from "@/lib/runtime";
import { bandExercises, levelRubric, practiceBands, type BandExercise } from "@/lib/translation/band-practice";
import "./translation-workspace.css";

type Rating = "again" | "hard" | "good" | "easy";
type SavedReview = { rating: Rating; reviewedAt: string };
type Phase = "copy" | "translate" | "review";

const ratingLabels: { value: Rating; label: string }[] = [
  { value: "again", label: "Chưa nhớ" },
  { value: "hard", label: "Khó" },
  { value: "good", label: "Ổn" },
  { value: "easy", label: "Dễ" },
];

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
  const completed = bandExercises.filter((item) => Boolean(reviews[reviewKey(item)])).length;
  const needsReview = bandExercises.filter((item) => reviews[reviewKey(item)]?.rating === "again" || reviews[reviewKey(item)]?.rating === "hard").length;

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

  return <div className="translation-workspace content-page">
    <div className="practice-hero">
      <span className="practice-eyebrow">LUYỆN TẬP / VIỆT → ANH</span>
      <h1>Luyện Việt–Anh theo mức</h1>
      <p>Học từ khóa, tự gõ lại, rồi dịch từ, cụm từ, câu hoặc đoạn sang tiếng Anh. Xem đáp án tham khảo và tự đánh giá để ôn đúng phần còn yếu.</p>
      <div className="practice-stats"><span><strong>17</strong> mức luyện</span><span><strong>{bandExercises.length}</strong> bài soạn theo mức</span><span><strong>{completed}</strong> bài đã làm</span><span><strong>{needsReview}</strong> bài cần ôn</span></div>
    </div>

    <div className="practice-tabs" aria-label="Nguồn bài luyện">
      <strong className="active">Lộ trình mức 1.0–9.0</strong>
      <Link href="/app/vocabulary/translation">Luyện dịch theo chủ đề</Link>
    </div>

      <section className="practice-setup" aria-label="Chọn mức luyện tập">
        <div className="practice-section-heading"><div><span>01 / CHỌN MỨC</span><h2>Chọn mức để bắt đầu</h2></div><p>Mức {band} có {bandItems.length} bài thử nghiệm theo tiêu chí riêng. Đây là bài luyện hướng tới band, không phải điểm IELTS được chấm chính thức.</p></div>
        <div className="practice-band-grid">{practiceBands.map((item) => <button key={item} type="button" className={band === item ? "selected" : ""} aria-pressed={band === item} onClick={() => { setBand(item); setSession([]); setFinished(false); setMessage(""); }}>Band <strong>{item}</strong></button>)}</div>
        {currentRubric && <div className="practice-level-focus"><strong>Mức {band} luyện gì?</strong><p>{currentRubric.focusVi}</p><small>{currentRubric.noteVi}{Number(band) >= 7 && " Các nghiên cứu và ví dụ trong bài là tình huống minh họa, không phải dữ kiện trích nguồn."}</small></div>}
        <div className="practice-setup-actions"><label><input type="checkbox" checked={reviewOnly} onChange={(event) => { setReviewOnly(event.target.checked); setSession([]); setFinished(false); }} /> Chỉ ôn bài đã đánh dấu khó</label><label>Số bài mỗi lượt <select value={sessionSize} onChange={(event) => { setSessionSize(Number(event.target.value)); setSession([]); setFinished(false); }}><option value={5}>5 bài</option><option value={10}>10 bài</option><option value={15}>15 bài</option></select></label><button className="practice-primary" type="button" onClick={start}>{session.length ? "Bắt đầu lại" : "Bắt đầu luyện"}<ArrowRight size={18} /></button></div>
      </section>

      {message && <p className="practice-message" role="status">{message}</p>}
      {finished ? <section className="translation-practice-card practice-done"><Check size={38} /><h2>Hoàn thành {session.length} bài ở mức {band}</h2><p>Tiến độ được lưu trên trình duyệt này. Bạn có thể luyện tiếp những bài còn lại hoặc chuyển sang mức kế tiếp.</p><button className="practice-primary" onClick={() => { setSession([]); setFinished(false); setMessage(""); }}>Chọn bài tiếp theo <ArrowRight size={18} /></button></section>
        : current ? <section className="translation-practice-card" key={current.id}>
          <div className="translation-practice-card-top"><span>{current.topic} · Mức {current.practiceLevel}</span><span>Bài {position + 1}/{session.length}</span></div>
          <div className="practice-progress"><i style={{ width: `${((position + (phase === "copy" ? 0 : phase === "translate" ? 0.33 : 0.67)) / session.length) * 100}%` }} /></div>
          <div className="practice-stepper"><span className={phase === "copy" ? "active" : ""}>01 · Chép từ</span><span className={phase === "translate" ? "active" : ""}>02 · Dịch Việt–Anh</span><span className={phase === "review" ? "active" : ""}>03 · Tự đánh giá</span></div>
          {phase === "copy" ? <div className="practice-stage">
            <span className="practice-stage-label">HỌC VÀ CHÉP TỪ</span><h2>Ghi nhớ từ khóa</h2><p className="practice-muted">Nhìn từ và nghĩa, sau đó tự gõ lại để nhớ cách viết.</p>
            <div className="practice-word"><strong>{current.targetTerm}</strong><span>{current.meaningVi}</span><button type="button" onClick={() => speak(current.targetTerm)} aria-label={`Nghe phát âm ${current.targetTerm}`}><Volume2 size={21} /></button></div>
            <label className="practice-field">Từ tiếng Anh của bạn<input value={copyAnswer} onChange={(event) => { setCopyAnswer(event.target.value); setCopyError(false); }} onKeyDown={(event) => { if (event.key === "Enter") checkCopy(); }} autoFocus placeholder="Gõ lại từ ở đây…" autoComplete="off" /></label>
            {copyError && <p className="practice-error" role="alert">Chưa đúng. Hãy nhìn lại từ phía trên và thử lần nữa.</p>}
            <div className="practice-actions"><button type="button" className="practice-primary" onClick={checkCopy} disabled={!copyAnswer.trim()}>Kiểm tra từ <ArrowRight size={18} /></button><button type="button" className="practice-secondary" onClick={() => setPhase("translate")}>Bỏ qua bước chép từ</button></div>
          </div> : phase === "translate" ? <div className="practice-stage">
            <span className="practice-stage-label">DỊCH VIỆT → ANH</span><h2>Dịch {current.type === "word" ? "từ" : current.type === "phrase" ? "cụm từ" : current.type === "paragraph" ? "đoạn" : "câu"} sau</h2><blockquote>{current.promptVi}</blockquote>
            <button className="practice-hint-toggle" type="button" onClick={() => setShowHint(!showHint)}>{showHint ? "Ẩn" : "Xem"} gợi ý từ khóa</button>
            {showHint && <p className="practice-hint">{current.targetTerm} · {current.meaningVi}</p>}
            <label className="practice-field">Bản dịch của bạn<textarea value={translation} onChange={(event) => setTranslation(event.target.value)} rows={4} maxLength={2000} placeholder="Viết câu tiếng Anh của bạn…" /></label>
            <div className="practice-actions"><button className="practice-primary" type="button" disabled={!translation.trim()} onClick={() => setPhase("review")}>Xem câu mẫu <ArrowRight size={18} /></button></div>
          </div> : <div className="practice-stage">
            <span className="practice-stage-label">SO SÁNH VÀ TỰ ĐÁNH GIÁ</span><h2>Đối chiếu cách diễn đạt</h2><div className="practice-comparison"><div><small>BẠN ĐÃ VIẾT</small><p>{translation}</p></div><div><small>ĐÁP ÁN THAM KHẢO</small><p>{current.referenceAnswers[0]}</p></div></div><p className="practice-muted">{current.explanationVi}</p><p className="practice-muted"><strong>Vì sao ở mức {band}:</strong> {current.rationaleVi}</p>
            <p className="practice-muted">Một câu có thể có nhiều cách dịch đúng. Hãy xét ý nghĩa, ngữ pháp và cách dùng từ trước khi chọn mức độ.</p>
            <div className="practice-ratings">{ratingLabels.map((item) => <button key={item.value} type="button" onClick={() => rate(item.value)}>{item.label}</button>)}</div>
          </div>}
        </section> : <section className="practice-empty"><RotateCcw size={22} /><p>Chọn band và nhấn <strong>Bắt đầu luyện</strong> để vào bài.</p></section>}
  </div>;
}
