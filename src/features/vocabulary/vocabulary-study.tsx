"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/browser";
import { demoMode } from "@/lib/runtime";
import sourceTopics from "@/lib/vocabulary/source-topics.json";
import ieltsTopics from "@/lib/vocabulary/ielts-topics.json";
import ieltsLearningTopics from "@/lib/vocabulary/ielts-learning-topics.json";
import { cefrLevels } from "@/lib/vocabulary/cefr-levels";
import { ieltsBands } from "@/lib/vocabulary/ielts-bands";
import { TopicArt } from "@/components/illustrations/topic-art";
import { useStudiedWords } from "./use-studied-words";
import "./vocabulary-study-layout.css";

type Word = {
  source_id: string; headword: string; pos: string; study_lane: string; topics: string[];
  source_definition_en: string; source_example_en: string; meaning_vi: string;
  meaning_status: string; meaning_source: string; meaning_source_url: string;
  source_ipa: string; total_count: number;
};
type Mode = "cards" | "choice" | "type" | "match";
const modes: { id: Mode; title: string; detail: string }[] = [
  { id: "cards", title: "Thẻ lật", detail: "Lật thẻ để tự kiểm tra nghĩa và ví dụ." },
  { id: "choice", title: "Trắc nghiệm", detail: "Chọn nghĩa phù hợp với từ." },
  { id: "type", title: "Gõ từ", detail: "Nhìn nghĩa rồi tự gõ từ tiếng Anh." },
  { id: "match", title: "Ghép cặp", detail: "Nối 5 từ với 5 nghĩa." },
];
const shuffle = <T,>(values: T[]) => [...values].sort(() => Math.random() - 0.5);
const batchSize = 20;

export function VocabularyStudy() {
  const params = useSearchParams();
  const db = useMemo(() => demoMode ? null : createClient(), []);
  const { studiedCount, markStudied } = useStudiedWords();
  const [collection, setCollection] = useState<"cefr" | "ielts">(() => params.get("collection") === "ielts" ? "ielts" : "cefr");
  const [topic, setTopic] = useState(() => [...sourceTopics, ...ieltsTopics, ...ieltsLearningTopics].includes(params.get("topic") ?? "") ? params.get("topic")! : "all");
  const [level, setLevel] = useState(() => [...cefrLevels, ...ieltsBands].some((item) => item === params.get("level")) ? params.get("level")! : "all");
  const [mode, setMode] = useState<Mode>(() => modes.some((item) => item.id === params.get("mode")) ? params.get("mode") as Mode : "cards");
  const [words, setWords] = useState<Word[]>([]);
  const [batchPage, setBatchPage] = useState(0);
  const [totalAvailable, setTotalAvailable] = useState(0);
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
  const [matchGroup, setMatchGroup] = useState(0);

  useEffect(() => {
    if (!db) return;
    let active = true;
    async function fetchWords() {
      setLoading(true); setError("");
      let fetched: Word[] = [];
      if (collection === "ielts") {
        let linkedKeys: string[] | null = null;
        if (topic !== "all" && ieltsLearningTopics.includes(topic)) {
          const slug = topic.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
          const links = await db!.from("ielts_vocabulary_topic_links").select("source_key").eq("topic_slug", slug).limit(200);
          if (!active) return;
          if (links.error) { setError(links.error.message); setLoading(false); return; }
          linkedKeys = links.data?.length ? links.data.map((item) => item.source_key) : ["__none__"];
        }
        const base = () => {
          let request = db!.from("ielts_vocabulary_entries").select("source_key,term,pos_raw,topic,definition_en,examples,band_level,content_status", { count: "exact" }).eq("published", true).order("term").order("source_key");
          if (linkedKeys) request = request.in("source_key", linkedKeys);
          else if (topic !== "all") request = request.eq("topic", topic);
          if (level !== "all") request = request.eq("band_level", level);
          return request;
        };
        const result = await base().range(batchPage * batchSize, batchPage * batchSize + batchSize - 1);
        if (!active) return;
        if (result.error) { setError(result.error.message); setLoading(false); return; }
        setTotalAvailable(result.count ?? 0);
        fetched = (result.data ?? []).map((row) => ({
          source_id: row.source_key, headword: row.term, pos: row.pos_raw,
          study_lane: `Band ${row.band_level} gợi ý`, topics: [linkedKeys ? topic : row.topic],
          source_definition_en: row.definition_en, source_example_en: row.examples?.[0] ?? "",
          meaning_vi: "", meaning_status: row.content_status, meaning_source: "",
          meaning_source_url: "", source_ipa: "", total_count: result.count ?? 0,
        }));
      } else {
        const input = { p_query: "", p_cefr: level === "all" ? "" : level, p_topic: topic === "all" ? "" : topic, p_page_size: batchSize };
        const result = await db!.rpc("list_vocabulary_study_by_cefr", { ...input, p_page: batchPage });
        if (!active) return;
        if (result.error) { setError(result.error.message); setLoading(false); return; }
        setTotalAvailable(Number(result.data?.[0]?.total_count ?? 0));
        fetched = (result.data ?? []) as Word[];
      }
      if (active) {
        const seen = new Set<string>();
        const batch = fetched.filter((word) => {
          const key = word.source_id;
          if (!word.source_definition_en || seen.has(key)) return false;
          seen.add(key); return true;
        });
        setWords(batch); setIndex(0); setFlipped(false); setAnswer(""); setSubmitted(false);
        setCorrect(0); setDone(0); setMatched([]); setMatchGroup(0); setPickedWord(""); setPickedDefinition("");
      }
      setLoading(false);
    }
    void fetchWords();
    return () => { active = false; };
  }, [db, collection, topic, level, batchPage]);

  const current = words[index];
  const options = useMemo(() => current ? shuffle([current, ...shuffle(words.filter((word) => word.source_id !== current.source_id && word.source_definition_en !== current.source_definition_en)).slice(0, 3)]) : [], [current, words]);
  const pairs = useMemo(() => words.slice(matchGroup * 5, matchGroup * 5 + 5), [words, matchGroup]);
  const definitions = useMemo(() => shuffle(pairs), [pairs]);
  const isCorrect = mode === "choice" ? answer === current?.source_id : answer.trim().toLowerCase().replace(/\s+/g, " ") === current?.headword.toLowerCase().replace(/\s+/g, " ");
  const progressPosition = Math.min(totalAvailable, batchPage * batchSize + (mode === "match" ? matchGroup * 5 + matched.length : index + 1));

  function changeMode(next: Mode) {
    setMode(next); setIndex(0); setFlipped(false); setAnswer(""); setSubmitted(false);
    setCorrect(0); setDone(0); setMatched([]); setMatchGroup(0); setPickedWord(""); setPickedDefinition("");
  }
  function check() {
    if (!answer.trim() || submitted) return;
    setSubmitted(true); setDone((value) => value + 1);
    markStudied(collection, current.source_id);
    if (isCorrect) setCorrect((value) => value + 1);
  }
  function next() {
    if (index === words.length - 1) {
      if ((batchPage + 1) * batchSize < totalAvailable) setBatchPage((page) => page + 1);
      return;
    }
    setIndex((value) => value + 1); setFlipped(false); setAnswer(""); setSubmitted(false);
  }
  function pick(wordId: string, definitionId: string) {
    const word = wordId || pickedWord;
    const definition = definitionId || pickedDefinition;
    setPickedWord(word); setPickedDefinition(definition);
    if (!word || !definition) return;
    if (word === definition) { setMatched((value) => [...value, word]); markStudied(collection, word); }
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
    <section className="vocab-study-toolbar" aria-label="Thiết lập buổi học">
      <div className="vocab-study-toolbar-row">
        <Link className="vocab-study-back" href="/app/vocabulary">← Từ vựng</Link>
        <select aria-label="Bộ từ luyện tập" value={collection} onChange={(event) => { setCollection(event.target.value as "cefr" | "ielts"); setTopic("all"); setLevel("all"); setBatchPage(0); }}><option value="ielts">Từ IELTS · Band 1–7+</option><option value="cefr">Từ A1–C2</option></select>
        <select aria-label="Chủ đề luyện từ" value={topic} onChange={(event) => { setTopic(event.target.value); setBatchPage(0); }}><option value="all">Mọi topic</option>{collection === "ielts" ? <><optgroup label="Chủ đề từ kho nguồn">{ieltsTopics.map((item) => <option key={item}>{item}</option>)}</optgroup><optgroup label="Chủ đề học mở rộng">{ieltsLearningTopics.map((item) => <option key={item}>{item}</option>)}</optgroup></> : sourceTopics.map((item) => <option key={item}>{item}</option>)}</select>
        <select aria-label={collection === "ielts" ? "Band gợi ý luyện từ" : "CEFR luyện từ"} value={level} onChange={(event) => { setLevel(event.target.value); setBatchPage(0); }}><option value="all">{collection === "ielts" ? "Mọi band gợi ý" : "Mọi mức CEFR"}</option>{(collection === "ielts" ? ieltsBands : cefrLevels).map((item) => <option key={item} value={item}>{collection === "ielts" ? `Band ${item}` : item}</option>)}</select>
        <Link className="vocab-study-library" href={`/app/vocabulary/library?${new URLSearchParams({ collection, ...(topic !== "all" ? { topic } : {}), ...(level !== "all" ? { level } : {}) })}`}>Kho từ →</Link>
      </div>
      <div className="vocab-study-modes" role="group" aria-label="Cách luyện từ">{modes.map((item) => <button key={item.id} type="button" title={item.detail} aria-pressed={mode === item.id} className={mode === item.id ? "active" : ""} onClick={() => changeMode(item.id)}><strong>{item.title}</strong></button>)}</div>
    </section>
    {error && <p className="vocab-error" role="alert">{error}</p>}
    {loading ? <section className="vocab-panel">Đang lấy bộ từ…</section> : !words.length ? <section className="vocab-panel">Không có từ trong bộ lọc này. Hãy chọn chủ đề hoặc trình độ khác.</section> : <section className={`vocab-panel vocab-study-board vocab-study-board-${mode}`}>
      <div className="vocab-study-progress"><div className="vocab-study-meta"><strong>Đang ở từ {progressPosition.toLocaleString("vi-VN")} / {totalAvailable.toLocaleString("vi-VN")}</strong><span>Lượt {batchPage + 1}{studiedCount !== null ? ` · Đã học ${studiedCount.toLocaleString("vi-VN")} từ` : ""}{done ? ` · ${correct}/${done} đúng` : ""}</span></div><progress aria-label="Vị trí hiện tại trong bộ từ đang chọn" value={progressPosition} max={Math.max(1, totalAvailable)} /></div>
      {collection === "ielts" && current && <Link className="vocab-to-translation" href={`/app/vocabulary/translation?word=${encodeURIComponent(current.source_id)}`}>Chép từ và viết câu với “{current.headword}” →</Link>}
      {mode === "cards" && <>
        <div className={`vocab-study-card${flipped ? " is-revealed" : ""}`} aria-label={`Thẻ từ ${current.headword}`}>
          <div className="vocab-study-card-image"><TopicArt topic={current.topics?.[0] ?? topic} word={current.headword} className="vocab-card-art" /><small>Hình gợi nhớ</small></div>
          <div className="vocab-study-card-word"><span>{current.pos || "TỪ VỰNG"} · {collection === "ielts" ? current.study_lane : level === "all" ? "CEFR" : level}</span><h2>{current.headword}</h2>{current.source_ipa && <p className="vocab-study-ipa">{current.source_ipa}</p>}
            <div id="vocab-study-definition" className={`vocab-study-card-definition${flipped ? " revealed" : ""}`} aria-live="polite">{flipped ? <><span>NGHĨA VÀ VÍ DỤ</span><h3>{collection === "ielts" ? current.source_definition_en : current.meaning_vi || current.source_definition_en}</h3>{collection === "cefr" && current.meaning_vi && <p>{current.source_definition_en}</p>}{current.source_example_en && <blockquote>{current.source_example_en}</blockquote>}</> : <p>Nhớ nghĩa của từ này rồi lật thẻ để kiểm tra.</p>}</div>
            <div className="vocab-study-card-controls"><button type="button" className="vocab-study-speak" onClick={() => speak(current.headword)}>🔊 Nghe phát âm</button><button type="button" className="vocab-study-reveal" onClick={() => { if (!flipped) markStudied(collection, current.source_id); setFlipped((value) => !value); }} aria-expanded={flipped} aria-controls="vocab-study-definition">{flipped ? "↩ Xem mặt trước" : "Lật thẻ · Xem nghĩa →"}</button></div>
          </div>
        </div>
        <div className="vocab-study-actions"><button className="vocab-button primary" onClick={next} disabled={index === words.length - 1 && (batchPage + 1) * batchSize >= totalAvailable}>{index === words.length - 1 ? (batchPage + 1) * batchSize >= totalAvailable ? "Đã hết từ trong bộ lọc" : "20 từ tiếp theo →" : "Từ tiếp theo →"}</button></div>
      </>}
      {(mode === "choice" || mode === "type") && <>
        <div className="vocab-study-question"><TopicArt topic={current.topics?.[0] ?? topic} word={current.headword} className="vocab-card-art" /><div><span className="vocab-kicker">{mode === "choice" ? "CHỌN NGHĨA ĐÚNG" : "GÕ TỪ PHÙ HỢP"}</span><h2>{mode === "choice" ? current.headword : current.source_definition_en}</h2></div></div>
        {mode === "choice" ? <div className="vocab-options">{options.map((item) => <button key={item.source_id} className={answer === item.source_id ? "selected" : ""} disabled={submitted} onClick={() => setAnswer(item.source_id)}>{item.source_definition_en}</button>)}</div> : <input className="vocab-study-input" aria-label="Gõ từ tiếng Anh" value={answer} disabled={submitted} onChange={(event) => setAnswer(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") check(); }} placeholder="Gõ từ tiếng Anh…" />}
        {submitted && <p className={`vocab-feedback ${isCorrect ? "correct" : "wrong"}`}>{isCorrect ? "Chính xác!" : `Đáp án: ${current.headword} — ${current.source_definition_en}`}</p>}
        <div className="vocab-study-actions">{!submitted ? <button className="vocab-button primary" disabled={!answer.trim()} onClick={check}>Kiểm tra</button> : <button className="vocab-button primary" onClick={next} disabled={index === words.length - 1 && (batchPage + 1) * batchSize >= totalAvailable}>{index === words.length - 1 ? (batchPage + 1) * batchSize >= totalAvailable ? "Đã hết từ trong bộ lọc" : "20 từ tiếp theo →" : "Câu tiếp theo →"}</button>}</div>
      </>}
      {mode === "match" && <><h2>Ghép từ với nghĩa · nhóm {matchGroup + 1}</h2><div className="vocab-match-grid"><div>{pairs.map((item) => <button key={item.source_id} disabled={matched.includes(item.source_id)} className={pickedWord === item.source_id ? "active" : ""} onClick={() => pick(item.source_id, "")}>{item.headword}</button>)}</div><div>{definitions.map((item) => <button key={item.source_id} disabled={matched.includes(item.source_id)} className={pickedDefinition === item.source_id ? "active" : ""} onClick={() => pick("", item.source_id)}>{item.source_definition_en}</button>)}</div></div>{matched.length === pairs.length && <div className="vocab-feedback correct">Hoàn thành {pairs.length} cặp! {matchGroup * 5 + pairs.length < words.length ? <button className="vocab-button primary" onClick={() => { setMatchGroup((group) => group + 1); setMatched([]); }}>5 cặp tiếp theo →</button> : (batchPage + 1) * batchSize < totalAvailable ? <button className="vocab-button primary" onClick={() => setBatchPage((page) => page + 1)}>20 từ tiếp theo →</button> : <span>Đã hết từ trong bộ lọc này.</span>}</div>}</>}
      {collection === "ielts" ? <p className="vocab-muted">Bộ IELTS gồm mục CSV do chủ dự án cung cấp và mục mới theo chủ đề học. Band là gợi ý học tập ước lượng dựa trên tần suất, không phải band chính thức của từng từ.</p> : <p className="vocab-muted">Nguồn nghĩa Việt: <a href="https://github.com/thichhoc-org/thichhoc-dict" target="_blank" rel="noopener noreferrer">Thichhoc</a> / <a href="https://github.com/skypediacode/english-vietnamese-dictionary" target="_blank" rel="noopener noreferrer">Skypedia</a> (CC BY-SA 4.0). Định nghĩa Anh: <a href="https://en-word.net/" target="_blank" rel="noopener noreferrer">Open English WordNet</a>.</p>}
    </section>}
  </div>;
}
