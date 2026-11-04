"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, LockKeyhole } from "lucide-react";
import { demoMode } from "@/lib/runtime";
import { GRAMMAR_PASS_PERCENT, canTestLevel, grammarLevel, isLevelOpen, prerequisiteLevel } from "@/lib/grammar/gate";
import { grammarLevels, type GrammarLevel } from "@/lib/grammar/types";
import { ROOT } from "./grammar-catalog";
import "./grammar-unlock.css";

const STORAGE = "ieltswithharry-grammar-unlocks-v1";
type Question = { id: string; lessonCode: string; prompt: string; instruction: string; options: string[] };
type Result = { correct: number; total: number; percent: number; passed: boolean };

export function useGrammarUnlocks() {
  const [unlocked, setUnlocked] = useState<GrammarLevel[]>([]);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    async function load() {
      try {
        if (demoMode) {
          const saved = JSON.parse(window.localStorage.getItem(STORAGE) || "[]");
          if (active) setUnlocked(Array.isArray(saved) ? saved.filter((value) => grammarLevel(value)) : []);
        } else {
          const response = await fetch("/api/grammar/placement", { cache: "no-store" });
          const body = await response.json();
          if (!response.ok) throw new Error(body.error || "Không tải được cấp độ đã mở.");
          if (active) setUnlocked((body.unlocked ?? []).filter((value: string) => grammarLevel(value)));
        }
      } catch (cause) { if (active) setError(cause instanceof Error ? cause.message : "Không tải được cấp độ đã mở."); }
      finally { if (active) setReady(true); }
    }
    void load();
    return () => { active = false; };
  }, []);
  const unlock = useCallback((target: GrammarLevel) => setUnlocked((current) => {
    const next = current.includes(target) ? current : [...current, target];
    if (demoMode) window.localStorage.setItem(STORAGE, JSON.stringify(next));
    return next;
  }), []);
  return { unlocked, ready, error, unlock };
}

export function LockedLevel({ level, unlocked }: { level: GrammarLevel; unlocked: GrammarLevel[] }) {
  const previous = grammarLevel(level) ? prerequisiteLevel(level) : null;
  const eligible = grammarLevel(level) && canTestLevel(level, unlocked);
  return <div className="gg-subpage"><Link className="gg-back" href={ROOT}><ArrowLeft size={16} /> Lộ trình Grammar</Link><div className="gg-empty gg-unlock-empty"><LockKeyhole size={30} /><h1>Cấp {grammarLevel(level) ? level : "này"} đang khóa</h1><p>{eligible ? `Làm bài kiểm tra 20 câu của cấp ${previous} và đạt ít nhất ${GRAMMAR_PASS_PERCENT}% để mở ${level}.` : previous ? `Hãy mở cấp ${previous} trước khi kiểm tra lên ${level}.` : "Vui lòng chọn cấp độ hợp lệ."}</p><Link className="gg-primary" href={eligible ? `${ROOT}/placement?target=${level}` : ROOT}>{eligible ? "Làm bài mở khóa" : "Về A1"} <ArrowRight size={16} /></Link></div></div>;
}

export function GrammarUnlockPage({ targetParam, unlocked, onUnlock }: { targetParam: string | null; unlocked: GrammarLevel[]; onUnlock: (level: GrammarLevel) => void }) {
  const target: GrammarLevel | undefined = targetParam && grammarLevel(targetParam) && targetParam !== "A1" ? targetParam : grammarLevels.find((level) => level !== "A1" && !isLevelOpen(level, unlocked));
  const [questions, setQuestions] = useState<Question[]>([]);
  const [ticket, setTicket] = useState("");
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [result, setResult] = useState<Result | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const previous = target ? prerequisiteLevel(target) : null;
  const eligible = Boolean(target && canTestLevel(target, unlocked));

  async function start() {
    if (!target) return;
    setBusy(true); setError(""); setResult(null); setAnswers({});
    try {
      const response = await fetch(`/api/grammar/placement?target=${target}`, { cache: "no-store" });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Không tải được bài kiểm tra.");
      setQuestions(body.questions); setTicket(body.ticket);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không tải được bài kiểm tra."); }
    finally { setBusy(false); }
  }

  async function submit() {
    if (!target || !ticket || Object.keys(answers).length !== questions.length || busy) return;
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/grammar/placement", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ target, ticket, answers }) });
      const body = await response.json();
      if (!response.ok) throw new Error(body.error || "Không chấm được bài kiểm tra.");
      setResult(body); setQuestions([]); setTicket("");
      if (body.passed) onUnlock(target);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không chấm được bài kiểm tra."); }
    finally { setBusy(false); }
  }

  return <div className="gg-subpage gg-unlock"><Link className="gg-back" href={ROOT}><ArrowLeft size={16} /> Lộ trình Grammar</Link><span className="gg-eyebrow">KIỂM TRA LÊN CẤP</span><h1>{target ? `Mở khóa cấp ${target}` : "Bạn đã mở tất cả cấp độ"}</h1><p>{target ? `20 câu chọn đáp án từ cấp ${previous}. Đúng ít nhất 16 câu (${GRAMMAR_PASS_PERCENT}%) để mở ${target}. Bạn có thể làm lại nếu chưa đạt.` : "Tiếp tục học và ôn tập theo lộ trình của bạn."}</p>
    {!eligible && target && !isLevelOpen(target, unlocked) && <div className="gg-sync">Bạn cần mở cấp {previous} trước.</div>}
    {target && isLevelOpen(target, unlocked) && !result && <div className="gg-sync">Cấp {target} đã mở. Bạn có thể vào học ngay.</div>}
    {error && <div className="gg-sync" role="alert">{error}</div>}
    {result && <div className="gg-unlock-result"><strong>{result.correct}/{result.total} câu đúng · {result.percent}%</strong><p>{result.passed ? `Đã mở khóa ${target}.` : `Chưa đạt ${GRAMMAR_PASS_PERCENT}%. Hãy ôn cấp ${previous} rồi thử lại.`}</p><div><Link className="gg-primary" href={result.passed ? `${ROOT}/level/${target}` : `${ROOT}/level/${previous}`}>{result.passed ? `Vào học ${target}` : `Ôn lại ${previous}`} <ArrowRight size={16} /></Link>{!result.passed && <button className="gg-secondary" onClick={() => void start()}>Làm đề mới</button>}</div></div>}
    {!questions.length && !result && eligible && !isLevelOpen(target!, unlocked) && <div className="gg-unlock-start"><p>Bài kiểm tra dùng câu hỏi trong bộ Grammar đang biên tập. Kết quả chỉ dùng để mở lộ trình học, không phải chứng chỉ năng lực.</p><button className="gg-primary" disabled={busy} onClick={() => void start()}>{busy ? "Đang tạo đề…" : "Bắt đầu kiểm tra"} <ArrowRight size={16} /></button></div>}
    {questions.length > 0 && <div className="gg-unlock-questions">{questions.map((question, index) => <fieldset key={question.id} className="gg-unlock-question"><legend>Câu {index + 1} / {questions.length}</legend><strong>{question.prompt}</strong><p>{question.instruction}</p><div className="gg-unlock-options">{question.options.map((option) => <label key={option}><input type="radio" name={question.id} value={option} checked={answers[question.id] === option} onChange={() => setAnswers((current) => ({ ...current, [question.id]: option }))} />{option}</label>)}</div></fieldset>)}<div className="gg-unlock-submit"><span>{Object.keys(answers).length}/{questions.length} câu đã trả lời</span><button className="gg-primary" disabled={busy || Object.keys(answers).length !== questions.length} onClick={() => void submit()}>{busy ? "Đang chấm…" : "Nộp bài kiểm tra"}</button></div></div>}
  </div>;
}
