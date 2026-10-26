"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { demoMode } from "@/lib/runtime";
import sourceTopics from "@/lib/vocabulary/source-topics.json";
import { studyLevels } from "@/lib/vocabulary/study-levels";
import { TopicArt } from "@/components/illustrations/topic-art";

type Word = {
  source_id: string; headword: string; pos: string; study_lane: string; topics: string[];
  source_definition_en: string; source_example_en: string; meaning_vi: string;
  meaning_status: string; meaning_source: string; meaning_source_url: string;
  source_ipa: string; total_count: number;
};
type Mode = "cards" | "choice" | "type" | "match";
const modes: { id: Mode; title: string; detail: string }[] = [
  { id: "cards", title: "Thẻ lật", detail: "Lật thẻ để tự kiểm tra nghĩa và định nghĩa." },
  { id: "choice", title: "Trắc nghiệm", detail: "Chọn định nghĩa tiếng Anh đúng." },
  { id: "type", title: "Gõ từ", detail: "Nhìn định nghĩa rồi tự gõ headword." },
  { id: "match", title: "Ghép cặp", detail: "Nối 5 từ với 5 định nghĩa." },
];
const shuffle = <T,>(values: T[]) => [...values].sort(() => Math.random() - 0.5);

export function VocabularyStudy() {
  const params = useSearchParams();
  const db = useMemo(() => demoMode ? null : createClient(), []);
  const [topic, setTopic] = useState(() => sourceTopics.includes(params.get("topic") ?? "") ? params.get("topic")! : "all");
  const [level, setLevel] = useState(() => studyLevels.some((item) => item === params.get("level")) ? params.get("level")! : "all");
  const [mode, setMode] = useState<Mode>(() => modes.some((item) => item.id === params.get("mode")) ? params.get("mode") as Mode : "cards");
  const [words, setWords] = useState<Word[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [correct, setCorrect] = useState(0);
  const [done, setDone] = useState(0);
  const [pickedWord, setPickedWord] = useState("");
  const [pickedDefinition, setPickedDefinition] = useState("");
  const [matched, setMatched] = useState<string[]>([]);

  useEffect(() => {
    if (!db) return;
    let active = true;
    async function fetchWords() {
      setLoading(true); setError("");
      const input = { p_query: "", p_level: level === "all" ? "" : level, p_topic: topic === "all" ? "" : topic, p_page_size: 100 };
      const first = await db!.rpc("list_vocabulary_study_by_level", { ...input, p_page: 0 });
      if (!active) return;
      if (first.error) { setError(first.error.message); setLoading(false); return; }
      const total = Number(first.data?.[0]?.total_count ?? 0);
      const page = Math.floor(Math.random() * Math.max(1, Math.ceil(total / 100)));
      const result = page ? await db!.rpc("list_vocabulary_study_by_level", { ...input, p_page: page }) : first;
      if (!active) return;
      if (result.error) setError(result.error.message);
      else {
        const seen = new Set<string>();
        const batch = shuffle((result.data ?? []) as Word[]).filter((word) => {
          const key = word.headword.toLowerCase();
          if (!word.source_definition_en || seen.has(key)) return false;
          seen.add(key); return true;
        }).slice(0, 20);
        setWords(batch); setIndex(0); setFlipped(false); setAnswer(""); setSubmitted(false);
        setCorrect(0); setDone(0); setMatched([]); setPickedWord(""); setPickedDefinition("");
      }
      setLoading(false);
    }
    void fetchWords();
    return () => { active = false; };
  }, [db, topic, level]);

  const current = words[index];
  const options = useMemo(() => current ? shuffle([current, ...shuffle(words.filter((word) => word.source_id !== current.source_id && word.source_definition_en !== current.source_definition_en)).slice(0, 3)]) : [], [current, words]);
  const pairs = useMemo(() => words.slice(0, 5), [words]);
  const definitions = useMemo(() => shuffle(pairs), [pairs]);
  const isCorrect = mode === "choice" ? answer === current?.source_id : answer.trim().toLowerCase().replace(/\s+/g, " ") === current?.headword.toLowerCase().replace(/\s+/g, " ");

  function changeMode(next: Mode) {
    setMode(next); setIndex(0); setFlipped(false); setAnswer(""); setSubmitted(false);
    setCorrect(0); setDone(0); setMatched([]); setPickedWord(""); setPickedDefinition("");
  }
  function check() {
    if (!answer.trim() || submitted) return;
    setSubmitted(true); setDone((value) => value + 1);
    if (isCorrect) setCorrect((value) => value + 1);
  }
  function next() { setIndex((value) => (value + 1) % words.length); setFlipped(false); setAnswer(""); setSubmitted(false); }
  function pick(wordId: string, definitionId: string) {
    const word = wordId || pickedWord;
    const definition = definitionId || pickedDefinition;
    setPickedWord(word); setPickedDefinition(definition);
    if (!word || !definition) return;
    if (word === definition) setMatched((value) => [...value, word]);
    setPickedWord(""); setPickedDefinition("");
  }
  function speak(word: string) {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(word);
    utterance.lang = "en-US"; utterance.rate = 0.85;
    window.speechSynthesis.speak(utterance);
  }

  return <div className="vocab-study">
    <section className="vocab-panel"><h2>Luyện từ theo topic và Level</h2><p>Chọn bộ từ rồi học theo 4 chế độ. Câu hỏi chấm bằng định nghĩa tiếng Anh từ nguồn; nghĩa Việt là gợi ý từ điển và cần kiểm tra ngữ cảnh.</p>
      <div className="vocab-filter-bar"><select aria-label="Chủ đề luyện từ" value={topic} onChange={(event) => setTopic(event.target.value)}><option value="all">Mọi topic</option>{sourceTopics.map((item) => <option key={item}>{item}</option>)}</select><select aria-label="Level luyện từ" value={level} onChange={(event) => setLevel(event.target.value)}><option value="all">Mọi Level</option>{studyLevels.map((item) => <option key={item}>{item}</option>)}</select><Link className="vocab-button soft" href={`/app/vocabulary/library?${new URLSearchParams({ ...(topic !== "all" ? { topic } : {}), ...(level !== "all" ? { level } : {}) })}`}>Xem kho từ</Link></div>
      <div className="vocab-study-modes">{modes.map((item) => <button key={item.id} type="button" className={mode === item.id ? "active" : ""} onClick={() => changeMode(item.id)}><strong>{item.title}</strong><small>{item.detail}</small></button>)}</div>
    </section>
    {error && <p className="vocab-error" role="alert">{error}</p>}
    {loading ? <section className="vocab-panel">Đang lấy bộ từ…</section> : !words.length ? <section className="vocab-panel">Không có đủ từ trong bộ lọc này. Hãy chọn topic hoặc Level khác.</section> : <section className="vocab-panel vocab-study-board">
      <div className="vocab-study-meta"><span>{mode === "match" ? `${matched.length}/5 cặp` : `${index + 1}/${words.length} từ`}</span><span>{done ? `${correct}/${done} đúng` : `${words.length} từ trong phiên`}</span></div>
      {mode === "cards" && <><button type="button" className="vocab-flashcard" onClick={() => setFlipped((value) => !value)}><span>{flipped ? "MẶT SAU · CHẠM ĐỂ LẬT" : "MẶT TRƯỚC · CHẠM ĐỂ LẬT"}</span><TopicArt topic={current.topics?.[0] ?? topic} word={current.headword} className="vocab-card-art" /><strong>{flipped ? current.meaning_vi || "Chưa có nghĩa Việt đối chiếu" : current.headword}</strong>{flipped && <><b>{current.source_definition_en}</b><small>{current.meaning_status === "editor_reviewed" ? "Đã biên tập" : "Nghĩa gợi ý từ điển · chưa duyệt ngữ cảnh"}</small></>}</button><div className="vocab-study-actions"><button className="vocab-button soft" onClick={() => speak(current.headword)}>🔊 Nghe</button><button className="vocab-button primary" onClick={next}>Thẻ tiếp theo →</button></div></>}
      {(mode === "choice" || mode === "type") && <><span className="vocab-kicker">{mode === "choice" ? "CHỌN ĐỊNH NGHĨA ĐÚNG" : "GÕ TỪ PHÙ HỢP"}</span><h2>{mode === "choice" ? current.headword : current.source_definition_en}</h2>{mode === "choice" ? <div className="vocab-options">{options.map((item) => <button key={item.source_id} className={answer === item.source_id ? "selected" : ""} disabled={submitted} onClick={() => setAnswer(item.source_id)}>{item.source_definition_en}</button>)}</div> : <input className="vocab-study-input" aria-label="Gõ từ tiếng Anh" value={answer} disabled={submitted} onChange={(event) => setAnswer(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") check(); }} placeholder="Gõ headword…" />}{submitted && <p className={`vocab-feedback ${isCorrect ? "correct" : "wrong"}`}>{isCorrect ? "Chính xác!" : `Đáp án: ${current.headword} — ${current.source_definition_en}`}</p>}<div className="vocab-study-actions">{!submitted ? <button className="vocab-button primary" disabled={!answer.trim()} onClick={check}>Kiểm tra</button> : <button className="vocab-button primary" onClick={next}>Câu tiếp theo →</button>}</div></>}
      {mode === "match" && <><h2>Ghép từ với định nghĩa</h2><div className="vocab-match-grid"><div>{pairs.map((item) => <button key={item.source_id} disabled={matched.includes(item.source_id)} className={pickedWord === item.source_id ? "active" : ""} onClick={() => pick(item.source_id, "")}>{item.headword}</button>)}</div><div>{definitions.map((item) => <button key={item.source_id} disabled={matched.includes(item.source_id)} className={pickedDefinition === item.source_id ? "active" : ""} onClick={() => pick("", item.source_id)}>{item.source_definition_en}</button>)}</div></div>{matched.length === pairs.length && <div className="vocab-feedback correct">Hoàn thành 5 cặp! <button className="vocab-button soft" onClick={() => setMatched([])}>Làm lại</button></div>}</>}
      <p className="vocab-muted">Nguồn nghĩa Việt: <a href="https://github.com/thichhoc-org/thichhoc-dict" target="_blank" rel="noopener noreferrer">Thichhoc</a> / <a href="https://github.com/skypediacode/english-vietnamese-dictionary" target="_blank" rel="noopener noreferrer">Skypedia</a> (CC BY-SA 4.0). Định nghĩa Anh: <a href="https://en-word.net/" target="_blank" rel="noopener noreferrer">Open English WordNet</a>.</p>
    </section>}
  </div>;
}
