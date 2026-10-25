"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ExternalLink, Headphones, Mic, RotateCcw, Save, Volume2 } from "lucide-react";
import { useNotebook } from "@/features/notebook/notebook-store";
import type { IeltsLiveData, LiveArticle } from "@/lib/ielts/live";
import "./ielts-live.css";

export type IeltsSkill = "vocabulary" | "grammar" | "reading" | "listening" | "writing" | "speaking";
const skillNames: Record<IeltsSkill, string> = {
  vocabulary: "Vocabulary", grammar: "Grammar", reading: "Reading",
  listening: "Listening", writing: "Writing", speaking: "Speaking",
};
const skills = Object.keys(skillNames) as IeltsSkill[];
const sourceNote = "Bài luyện theo dạng IELTS Academic do IeltsWithHarry tạo từ dữ liệu nguồn. Đây không phải đề thi IELTS chính thức hay điểm band chính thức.";
const stopWords = new Set("about above after again against among around because before between could every first from have into other should their there these those through under until which while would your this that with were been they them than then also only more most each many such some when where very over said says will used using may can are was who what new its our out one two three four five six seven eight nine ten year years news nasa noaa government".split(" "));
const connectors = ["although", "however", "because", "whereas", "while", "therefore", "despite", "since", "moreover", "nevertheless"];

function sentences(text: string) {
  return text.replace(/\s+/g, " ").split(/(?<=[.!?])\s+(?=[A-Z])/).filter((sentence) => sentence.split(" ").length >= 10);
}
function readingQuestions(text: string) {
  const used = new Set<string>();
  return sentences(text).slice(0, 20).flatMap((sentence) => {
    const words = sentence.match(/\b[A-Za-z]{7,}\b/g) ?? [];
    const answer = words.find((word) => !used.has(word.toLowerCase()) && !stopWords.has(word.toLowerCase()));
    if (!answer) return [];
    used.add(answer.toLowerCase());
    return [{ prompt: sentence.replace(new RegExp(`\\b${answer}\\b`), "________"), answer }];
  }).slice(0, 5);
}
function grammarQuestions(text: string) {
  return sentences(text).flatMap((sentence) => {
    const connector = connectors.find((item) => new RegExp(`\\b${item}\\b`, "i").test(sentence));
    if (!connector) return [];
    return [{ prompt: sentence.replace(new RegExp(`\\b${connector}\\b`, "i"), "________"), answer: connector }];
  }).slice(0, 5);
}
function wordCandidates(text: string) {
  const counts = new Map<string, number>();
  for (const word of text.match(/\b[a-zA-Z]{7,}\b/g) ?? []) {
    const key = word.toLowerCase();
    if (!stopWords.has(key)) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 12).map(([word]) => word);
}
function wordCount(value: string) { return value.trim() ? value.trim().split(/\s+/).length : 0; }

export function IeltsLivePage({ skill }: { skill: IeltsSkill }) {
  const { addEntry } = useNotebook();
  const [data, setData] = useState<IeltsLiveData | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(true);
  const [articleId, setArticleId] = useState("");
  const [audioId, setAudioId] = useState("");
  const [answers, setAnswers] = useState<string[]>([]);
  const [score, setScore] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const [writingTask, setWritingTask] = useState<1 | 2>(1);
  const [saved, setSaved] = useState("");
  const [dictionary, setDictionary] = useState<{ word: string; definition: string; meaningVi: string; sourceUrl: string } | null>(null);
  const [lookupBusy, setLookupBusy] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recordUrl, setRecordUrl] = useState("");
  const recorder = useRef<MediaRecorder | null>(null);
  const [seconds, setSeconds] = useState(0);
  const [timerRunning, setTimerRunning] = useState(false);

  useEffect(() => {
    let live = true;
    fetch("/api/ielts/live", { cache: "no-store" }).then(async (response) => {
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? "Không tải được dữ liệu.");
      if (live) setData(value as IeltsLiveData);
    }).catch((cause) => { if (live) setError(cause instanceof Error ? cause.message : "Không tải được dữ liệu."); })
      .finally(() => { if (live) setBusy(false); });
    return () => { live = false; };
  }, []);
  useEffect(() => {
    if (!timerRunning) return;
    const interval = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(interval);
  }, [timerRunning]);
  useEffect(() => () => { recorder.current?.stream.getTracks().forEach((track) => track.stop()); if (recordUrl) URL.revokeObjectURL(recordUrl); }, [recordUrl]);

  const article = data?.articles.find((item) => item.id === articleId) ?? data?.articles[0];
  const audio = data?.audio.find((item) => item.id === audioId) ?? data?.audio[0];
  const questions = useMemo(() => article ? (skill === "grammar" ? grammarQuestions(article.text) : readingQuestions(article.text)) : [], [article, skill]);
  const vocabulary = useMemo(() => article ? wordCandidates(article.text) : [], [article]);

  async function saveNote(title: string, body: string) {
    setSaved("");
    try {
      await addEntry({ kind: "note", title: title.slice(0, 100), body: body.slice(0, 5000), meaningVi: "", example: "" });
      setSaved("Đã lưu vào Sổ tay của bạn.");
    } catch (cause) { setSaved(cause instanceof Error ? cause.message : "Không lưu được."); }
  }
  async function checkAnswers() {
    const correct = questions.reduce((total, question, index) => total + (answers[index]?.trim().toLowerCase() === question.answer.toLowerCase() ? 1 : 0), 0);
    setScore(correct);
    await saveNote(`IELTS ${skillNames[skill]} · ${article?.title ?? "Practice"}`, `${correct}/${questions.length} câu điền từ đúng. Nguồn: ${article?.sourceUrl ?? ""}`);
  }
  async function lookup(word: string) {
    setDictionary(null); setLookupBusy(true);
    try {
      const response = await fetch(`/api/vocabulary/lookup?word=${encodeURIComponent(word)}`);
      const value = await response.json();
      if (!response.ok) throw new Error(value.error ?? "Không tra được từ.");
      setDictionary({ word, definition: value.meanings?.[0]?.definition ?? "", meaningVi: value.meanings?.[0]?.meaningVi ?? "", sourceUrl: value.source?.url ?? "" });
    } catch (cause) { setSaved(cause instanceof Error ? cause.message : "Không tra được từ."); }
    finally { setLookupBusy(false); }
  }
  async function saveWord() {
    if (!dictionary || !article) return;
    try {
      const example = sentences(article.text).find((sentence) => new RegExp(`\\b${dictionary.word}\\b`, "i").test(sentence))?.slice(0, 500) ?? "";
      await addEntry({ kind: "word", title: dictionary.word, body: "", meaningVi: dictionary.meaningVi || "Tự bổ sung nghĩa", example,
        definition: dictionary.definition, topic: article.category, sourceUrl: dictionary.sourceUrl });
      setSaved("Đã lưu từ vào Sổ tay.");
    } catch (cause) { setSaved(cause instanceof Error ? cause.message : "Không lưu được từ."); }
  }
  async function toggleRecording() {
    if (recorder.current?.state === "recording") { recorder.current.stop(); setRecording(false); return; }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const chunks: BlobPart[] = [];
      const nextRecorder = new MediaRecorder(stream);
      nextRecorder.ondataavailable = (event) => chunks.push(event.data);
      nextRecorder.onstop = () => { setRecordUrl(URL.createObjectURL(new Blob(chunks, { type: nextRecorder.mimeType }))); stream.getTracks().forEach((track) => track.stop()); };
      recorder.current = nextRecorder; nextRecorder.start(); setRecording(true);
    } catch { setSaved("Không truy cập được micro. Kiểm tra quyền micro của trình duyệt."); }
  }

  return <main className="ielts-live content-page">
    <div className="ielts-hero">
      <span className="eyebrow">IELTS ACADEMIC · LIVE PRACTICE</span>
      <h1>{skillNames[skill]}</h1>
      <p>{sourceNote}</p>
      <div className="ielts-skill-nav">{skills.map((item) => <Link key={item} className={item === skill ? "active" : ""} href={`/app/${item}`}>{skillNames[item]}</Link>)}</div>
    </div>
    {busy && <div className="ielts-panel">Đang lấy dữ liệu bài luyện mới nhất…</div>}
    {error && <div className="ielts-panel ielts-error">{error}</div>}
    {data && <>
      <div className="ielts-source-line"><span>Cập nhật lúc {new Date(data.checkedAt).toLocaleString("vi-VN")}</span><span>Daily News · LibriVox · World Bank</span></div>
      {data.warnings.length > 0 && <div className="ielts-warning">{data.warnings.join(" ")}</div>}
      {skill !== "listening" && skill !== "writing" && article && <div className="ielts-picker"><label htmlFor="ielts-article">Bài nguồn</label><select id="ielts-article" value={article.id} onChange={(event) => { setArticleId(event.target.value); setAnswers([]); setScore(null); setDictionary(null); }}>{data.articles.map((item) => <option key={item.id} value={item.id}>{item.title} · {item.publisher}</option>)}</select></div>}
      {skill === "vocabulary" && article && <div className="ielts-panel">
        <div className="ielts-panel-head"><div><span className="eyebrow">TỪ TRONG BÀI ĐỌC MỚI</span><h2>IELTS Vocabulary in context</h2></div><BookOpen size={25}/></div>
        <p>Chọn từ xuất hiện trong bài để xem nghĩa, ví dụ gốc và lưu vào sổ tay. Danh sách làm mới theo bài nguồn.</p>
        <div className="ielts-chips">{vocabulary.map((word) => <button key={word} onClick={() => void lookup(word)}>{word}</button>)}</div>
        {lookupBusy && <p>Đang tra từ…</p>}{dictionary && <div className="ielts-result"><strong>{dictionary.word}</strong><p>{dictionary.definition}</p><p>{dictionary.meaningVi || "Chưa có nghĩa tiếng Việt; bạn có thể tự ghi vào sổ tay."}</p><button className="ielts-primary" onClick={() => void saveWord()}><Save size={16}/> Lưu từ</button></div>}
        <div className="ielts-task-two"><Link href="/app/vocabulary/overview">Mở kho từ, thẻ ôn và luyện tập →</Link></div>
        <Source article={article}/>
      </div>}
      {(skill === "reading" || skill === "grammar") && article && <div className="ielts-two-col">
        <section className="ielts-panel"><span className="eyebrow">{skill === "reading" ? "ACADEMIC READING · SENTENCE COMPLETION" : "GRAMMAR FOR IELTS · LINKING WORDS"}</span><h2>{article.title}</h2><p className="ielts-article-text">{article.text}</p><Source article={article}/></section>
        <section className="ielts-panel"><span className="eyebrow">BÀI TẬP CÓ ĐÁP ÁN XÁC ĐỊNH</span><h2>{skill === "reading" ? "Điền MỘT từ từ bài đọc" : "Điền từ nối còn thiếu"}</h2><p>{skill === "reading" ? "Câu được trích từ văn bản gốc; đáp án là đúng một từ trong bài." : "Điền từ nối xuất hiện trong câu gốc. Đây là luyện nhận diện cấu trúc, không chấm toàn bộ IELTS Grammar."}</p>
          {questions.length ? <>{questions.map((question, index) => <label className="ielts-question" key={index}><span>{index + 1}. {question.prompt}</span><input value={answers[index] ?? ""} onChange={(event) => setAnswers((current) => { const next = [...current]; next[index] = event.target.value; return next; })} placeholder="Một từ"/>{score !== null && <small>{question.answer}</small>}</label>)}<button className="ielts-primary" onClick={() => void checkAnswers()}>Kiểm tra đáp án</button>{score !== null && <div className="ielts-result">Đúng {score}/{questions.length}. Kết quả đã lưu trong Sổ tay; đây không phải điểm band IELTS.</div>}</> : <p>Chưa đủ câu phù hợp từ bài này. Chọn bài nguồn khác.</p>}
        </section>
      </div>}
      {skill === "listening" && <div className="ielts-two-col"><section className="ielts-panel"><span className="eyebrow">LISTENING PRACTICE · PUBLIC DOMAIN AUDIO</span><h2>Nghe một đoạn và ghi ý chính</h2><p>LibriVox có bản ghi mới liên tục. Chỉ hiện tác phẩm tiếng Anh đã có file âm thanh. Đây là luyện nghe bổ trợ, không phải audio đề IELTS chính thức.</p>{audio ? <><label className="ielts-select-label">Chọn bản ghi<select value={audio.id} onChange={(event) => setAudioId(event.target.value)}>{data.audio.map((item) => <option key={item.id} value={item.id}>{item.title} — {item.author}</option>)}</select></label><h3>{audio.title}</h3><p>{audio.author} · {audio.chapter}</p><audio key={audio.audioUrl} controls preload="none" src={audio.audioUrl} className="ielts-audio"/><a href={audio.sourceUrl} target="_blank" rel="noreferrer">LibriVox · Bản gốc <ExternalLink size={14}/></a></> : <p>Kho LibriVox chưa trả bản ghi có audio. Hãy thử lại sau.</p>}</section><section className="ielts-panel"><span className="eyebrow">NOTE COMPLETION · TỰ ĐÁNH GIÁ</span><h2>Ghi ý chính và từ nghe được</h2><p>Viết các tên riêng, con số hoặc chi tiết bạn nghe thấy. Nội dung được lưu vào Sổ tay, chưa chấm tự động vì nguồn này chưa có transcript khớp từng đoạn.</p><textarea value={draft} onChange={(event) => setDraft(event.target.value)} placeholder="Main idea, names, dates, useful expressions…" rows={11}/><button className="ielts-primary" disabled={!draft.trim()} onClick={() => void saveNote(`IELTS Listening · ${audio?.title ?? "Practice"}`, `${draft}\nNguồn: ${audio?.sourceUrl ?? ""}`)}><Save size={16}/> Lưu ghi chú</button></section></div>}
      {skill === "writing" && <div className="ielts-two-col"><section className="ielts-panel"><div className="ielts-chips"><button onClick={() => { setWritingTask(1); setDraft(""); }}>Task 1 · Biểu đồ</button><button onClick={() => { setWritingTask(2); setDraft(""); }}>Task 2 · Essay</button></div>{writingTask === 1 ? <><span className="eyebrow">IELTS ACADEMIC WRITING · TASK 1</span><h2>Population in Viet Nam and Thailand</h2><p>The chart shows the population of two countries between 2010 and 2025. Summarise the main features and make comparisons where relevant. Write at least 150 words.</p>{data.chart.length ? <PopulationChart points={data.chart}/> : <p>Dữ liệu World Bank đang bận. Vui lòng thử lại sau.</p>}<a href="https://data.worldbank.org/indicator/SP.POP.TOTL?locations=VN-TH" target="_blank" rel="noreferrer">Source: World Bank, SP.POP.TOTL <ExternalLink size={14}/></a></> : <><span className="eyebrow">IELTS ACADEMIC WRITING · TASK 2</span><h2>Essay topic from current news</h2><p>Some people believe developments in {article?.category.toLowerCase() ?? "science"} bring more benefits than problems. To what extent do you agree or disagree? Give reasons and examples. Write at least 250 words.</p>{article && <><div className="ielts-story"><strong>{article.title}</strong><p>{article.text.slice(0, 600)}…</p></div><Source article={article}/></>}</>}</section><section className="ielts-panel"><span className="eyebrow">BÀI VIẾT CỦA BẠN</span><h2>Task {writingTask} response</h2><p>Thời gian gợi ý: {writingTask === 1 ? 20 : 40} phút. Hệ thống đếm từ và lưu bài, không tự chấm band cho bài viết mở.</p><Timer seconds={seconds} running={timerRunning} onToggle={() => setTimerRunning((value) => !value)} onReset={() => { setTimerRunning(false); setSeconds(0); }}/><textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={14} placeholder={writingTask === 1 ? "The chart illustrates…" : "It is often argued that…"}/><div className="ielts-actions"><span>{wordCount(draft)} / {writingTask === 1 ? 150 : 250} từ tối thiểu</span><button className="ielts-primary" disabled={!draft.trim()} onClick={() => void saveNote(`IELTS Academic Writing Task ${writingTask} · ${writingTask === 1 ? "World Bank population" : article?.title ?? "News topic"}`, `${draft}\nSource: ${writingTask === 1 ? "https://data.worldbank.org/indicator/SP.POP.TOTL?locations=VN-TH" : article?.sourceUrl ?? ""}`)}><Save size={16}/> Lưu bài viết</button></div></section></div>}
      {skill === "speaking" && article && <div className="ielts-two-col"><section className="ielts-panel"><span className="eyebrow">IELTS SPEAKING · PART 2 CUE CARD</span><h2>Describe a development you recently learned about</h2><p>You should say:</p><ul><li>what the development was</li><li>where you learned about it</li><li>why it interested you</li><li>and explain how it might affect people in the future.</li></ul><p>Chuẩn bị 1 phút, nói tối đa 2 phút. Bài báo dưới đây chỉ là gợi ý chủ đề, không phải câu hỏi thi chính thức.</p><div className="ielts-story"><strong>{article.title}</strong><p>{article.text.slice(0, 450)}…</p></div><Source article={article}/></section><section className="ielts-panel"><span className="eyebrow">RECORD & REFLECT</span><h2>Tập nói và nghe lại</h2><Timer seconds={seconds} running={timerRunning} onToggle={() => setTimerRunning((value) => !value)} onReset={() => { setTimerRunning(false); setSeconds(0); }}/><button className="ielts-primary" onClick={() => void toggleRecording()}>{recording ? <RotateCcw size={16}/> : <Mic size={16}/>} {recording ? "Dừng ghi âm" : "Bắt đầu ghi âm"}</button>{recordUrl && <audio controls src={recordUrl} className="ielts-audio"/>}<p className="ielts-small">Bản ghi âm chỉ ở trong phiên trình duyệt này. Viết tự nhận xét để lưu vào Sổ tay.</p><textarea value={draft} onChange={(event) => setDraft(event.target.value)} rows={7} placeholder="Từ vựng hay, điểm cần cải thiện, ý cho Part 3…"/><button className="ielts-secondary" disabled={!draft.trim()} onClick={() => void saveNote(`IELTS Speaking · ${article.title}`, `${draft}\nNguồn: ${article.sourceUrl}`)}><Save size={16}/> Lưu tự nhận xét</button><div className="ielts-task-two"><span className="eyebrow">PART 3 FOLLOW-UP</span><p>How can people keep themselves informed about developments in {article.category.toLowerCase()}? Should schools discuss such topics?</p></div></section></div>}
      {!article && skill !== "listening" && skill !== "writing" && <div className="ielts-panel">Chưa có bài toàn văn đã được phép sử dụng. Daily News vẫn tiếp tục đồng bộ; hãy quay lại sau.</div>}
      {saved && <div className="ielts-save-status" role="status">{saved} <Link href="/app/notebook">Mở Sổ tay →</Link></div>}
      <footer className="ielts-footer"><Headphones size={16}/> <span>Listening dùng bản ghi LibriVox thuộc public domain. Writing Task 1 dùng World Bank Open Data. Bài đọc lấy từ kho Daily News đã được kiểm tra quyền sử dụng. <a href="https://ielts.org/take-a-test/preparation-resources/sample-test-questions" target="_blank" rel="noreferrer">Luyện đề mẫu IELTS chính thức ↗</a></span><Volume2 size={16}/></footer>
    </>}
  </main>;
}

function Source({ article }: { article: LiveArticle }) {
  return <div className="ielts-source"><span>{article.publisher} · {new Date(article.publishedAt).toLocaleDateString("vi-VN")}</span><a href={article.sourceUrl} target="_blank" rel="noreferrer">Xem nguồn gốc <ExternalLink size={14}/></a></div>;
}
function Timer({ seconds, running, onToggle, onReset }: { seconds: number; running: boolean; onToggle: () => void; onReset: () => void }) {
  return <div className="ielts-timer"><strong>{String(Math.floor(seconds / 60)).padStart(2, "0")}:{String(seconds % 60).padStart(2, "0")}</strong><button onClick={onToggle}>{running ? "Tạm dừng" : "Bắt đầu"}</button><button onClick={onReset}><RotateCcw size={15}/> Đặt lại</button></div>;
}
function PopulationChart({ points }: { points: IeltsLiveData["chart"] }) {
  const years = [...new Set(points.map((item) => item.year))].filter((year) => year % 3 === 0 || year === Math.max(...points.map((item) => item.year)));
  const values = points.filter((item) => years.includes(item.year));
  const max = Math.max(...values.map((item) => item.value), 1);
  return <div className="ielts-chart" role="img" aria-label="Biểu đồ dân số Việt Nam và Thái Lan theo năm; số liệu chi tiết trong bảng dưới"><div className="ielts-chart-bars">{years.map((year) => <div className="ielts-chart-year" key={year}><div className="ielts-chart-pair">{["Viet Nam", "Thailand"].map((country) => { const item = values.find((point) => point.year === year && point.country === country); return <span key={country} className={country === "Viet Nam" ? "vn" : "th"} style={{ height: `${(item?.value ?? 0) / max * 100}%` }} title={`${country}: ${item ? (item.value / 1_000_000).toFixed(1) : "—"}m`}/>; })}</div><small>{year}</small></div>)}</div><div className="ielts-chart-legend"><span>● Viet Nam</span><span>● Thailand</span><span>Đơn vị: triệu người</span></div><details><summary>Xem số liệu chính xác</summary><table><thead><tr><th>Năm</th><th>Viet Nam</th><th>Thailand</th></tr></thead><tbody>{years.map((year) => <tr key={year}><td>{year}</td>{["Viet Nam", "Thailand"].map((country) => <td key={country}>{((values.find((item) => item.year === year && item.country === country)?.value ?? 0) / 1_000_000).toFixed(2)}</td>)}</tr>)}</tbody></table></details></div>;
}
