"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { demoMode } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/browser";
import { useNotebook } from "@/features/notebook/notebook-store";
import { useMic, type Take } from "@/features/ielts/speaking-kit";
import { wordDifferences, youtubeId, type VideoLesson } from "@/lib/listening/youtube";
import { catalogVideos, findCatalogVideos, videoTopics, type CatalogVideo, type VideoTopic } from "@/lib/listening/video-catalog";
import { YoutubePlayer } from "./youtube-player";
import "./youtube-lab.css";

export const demoLessonsKey = "english-skill-lab-youtube-lessons-v1";
type Mode = "shadow" | "repeat" | "dictation" | "questions" | "words";

export function YoutubeLab() {
  const db = useMemo(() => demoMode ? null : createClient(), []);
  const { entries, addEntry } = useNotebook();
  const mic = useMic();
  const [lessons, setLessons] = useState<VideoLesson[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [customUrl, setCustomUrl] = useState("");
  const [selected, setSelected] = useState<VideoLesson | null>(null);
  const [catalogSelection, setCatalogSelection] = useState<CatalogVideo | null>(null);
  const [search, setSearch] = useState("");
  const [topic, setTopic] = useState<VideoTopic | "all">("all");
  const [cueIndex, setCueIndex] = useState(0);
  const [request, setRequest] = useState(0);
  const [loop, setLoop] = useState(false);
  const [time, setTime] = useState(0);
  const [mode, setMode] = useState<Mode>("shadow");
  const [take, setTake] = useState<Take | null>(null);
  const [answer, setAnswer] = useState("");
  const [checked, setChecked] = useState(false);
  const [quizAnswers, setQuizAnswers] = useState<Record<number, number>>({});
  const [quizChecked, setQuizChecked] = useState(false);
  const [word, setWord] = useState("");
  const [meaning, setMeaning] = useState("");

  useEffect(() => { let alive = true; void (async () => {
    if (demoMode) { try { const rows = JSON.parse(localStorage.getItem(demoLessonsKey) ?? "[]") as VideoLesson[]; if (alive) setLessons(rows.filter((row) => row.published)); } catch { if (alive) setError("Saved demo lessons could not be read."); } }
    else { const result = await db!.from("youtube_listening_lessons").select("*").eq("published", true).order("created_at", { ascending: false }); if (alive) { if (result.error) setError(result.error.message); else setLessons(result.data as VideoLesson[]); } }
    if (alive) setLoading(false);
  })(); return () => { alive = false; }; }, [db]);

  const cue = selected?.transcript?.[cueIndex];
  const videoId = selected?.youtube_id ?? catalogSelection?.id ?? youtubeId(customUrl);
  const filteredCatalog = useMemo(() => findCatalogVideos(search, topic), [search, topic]);
  const filteredLessons = useMemo(() => lessons.filter((lesson) => {
    const term = search.trim().toLocaleLowerCase("vi-VN");
    return !term || `${lesson.title} ${lesson.topic} ${lesson.cefr}`.toLocaleLowerCase("vi-VN").includes(term);
  }), [lessons, search]);
  const youtubeSearch = search.trim() || (topic === "all" ? "IELTS listening practice" : videoTopics.find((item) => item.id === topic)?.search ?? "IELTS listening practice");
  const authorized = Boolean(selected && selected.transcript.length && selected.rights_source && selected.rights_license);
  const active = selected?.transcript.findIndex((item) => time >= item.start && time < item.end) ?? -1;
  function pickLesson(lesson: VideoLesson) { if (take) mic.release(take.url); setTake(null); setSelected(lesson); setCatalogSelection(null); setCustomUrl(""); setCueIndex(0); setRequest(0); setChecked(false); setAnswer(""); setQuizChecked(false); setQuizAnswers({}); setError(""); }
  function pickCatalog(video: CatalogVideo) { if (take) mic.release(take.url); setTake(null); setSelected(null); setCatalogSelection(video); setCustomUrl(""); setError(""); window.requestAnimationFrame(() => document.getElementById("yt-watch")?.scrollIntoView({ behavior: "smooth", block: "start" })); }
  function playCue(index: number) { if (!selected?.transcript[index]) return; setCueIndex(index); setRequest((value) => value + 1); setChecked(false); setAnswer(""); }
  async function stopRecording() { const recorded = await mic.stop(); if (recorded) { if (take) mic.release(take.url); setTake(recorded); } }
  async function saveWord() {
    const candidate = word.trim();
    if (!cue || !candidate || !meaning.trim() || !new RegExp(`(^|[^\\p{L}])${candidate.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}(?=$|[^\\p{L}])`, "iu").test(cue.text)) { setError("Choose a word that appears in this transcript sentence and enter its meaning."); return; }
    if (entries.some((entry) => entry.kind === "word" && entry.title.toLowerCase().trim() === candidate.toLowerCase())) { setError("This word is already in your notebook."); return; }
    try { await addEntry({ kind: "word", title: candidate, body: "", meaningVi: meaning.trim(), example: cue.text, phonetic: "", partOfSpeech: "", topic: selected?.topic ?? "Listening", sourceUrl: `https://www.youtube.com/watch?v=${videoId}&t=${Math.floor(cue.start)}s` }, `/app/listening/youtube/${selected!.id}`); setWord(""); setMeaning(""); setError("Word saved to your Vocabulary notebook."); }
    catch (cause) { setError(cause instanceof Error ? cause.message : "Could not save the word."); }
  }

  return <main className="yt-lab">
    <header><Link href="/app/listening">← Listening</Link><h1>YouTube Shadowing & Listening Lab</h1><p>Chọn video theo chủ đề, tìm bài nghe phù hợp rồi phát bằng trình phát YouTube. Bài có phụ đề và câu hỏi do giáo viên biên soạn sẽ có thêm các chế độ luyện tập.</p></header>
    {error && <p role="status" className="yt-notice">{error}</p>}
    <section className="yt-panel yt-discover" aria-labelledby="yt-discover-title">
      <div className="yt-discover-head"><div><span className="yt-kicker">KHÁM PHÁ VIDEO</span><h2 id="yt-discover-title">Nghe tiếng Anh theo chủ đề</h2><p>{catalogVideos.length} video được chọn từ BBC Learning English. Tìm theo chủ đề hoặc từ khóa; có thể mở thêm kết quả trực tiếp trên YouTube.</p></div><span className="yt-discover-count">{filteredCatalog.length} video</span></div>
      <div className="yt-search-row"><label htmlFor="yt-video-search">Tìm video<input id="yt-video-search" type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Ví dụ: công nghệ, climate, health…" /></label><a className="yt-search-more" href={`https://www.youtube.com/results?search_query=${encodeURIComponent(youtubeSearch)}`} target="_blank" rel="noopener noreferrer">Tìm thêm trên YouTube ↗</a></div>
      <div className="yt-topic-tabs" role="group" aria-label="Lọc video theo chủ đề"><button type="button" className={topic === "all" ? "active" : ""} aria-pressed={topic === "all"} onClick={() => setTopic("all")}>Tất cả <span>{catalogVideos.length}</span></button>{videoTopics.map((item) => <button type="button" key={item.id} className={topic === item.id ? "active" : ""} aria-pressed={topic === item.id} onClick={() => setTopic(item.id)}>{item.label} <span>{catalogVideos.filter((video) => video.topic === item.id).length}</span></button>)}</div>
      {filteredCatalog.length ? videoTopics.filter((item) => topic === "all" || topic === item.id).map((item) => {
        const videos = filteredCatalog.filter((video) => video.topic === item.id);
        return videos.length ? <div className="yt-topic-section" key={item.id}><div className="yt-topic-heading"><h3>{item.label}</h3><a href={`https://www.youtube.com/results?search_query=${encodeURIComponent(item.search)}`} target="_blank" rel="noopener noreferrer">Xem thêm ↗</a></div><div className="yt-video-grid">{videos.map((video) => <button type="button" key={video.id} className={`yt-video-card ${catalogSelection?.id === video.id ? "active" : ""}`} onClick={() => pickCatalog(video)}><span className="yt-video-thumb" style={{ backgroundImage: `url(https://i.ytimg.com/vi/${video.id}/hqdefault.jpg)` }}><span>▶ Phát video</span></span><span className="yt-video-card-copy"><strong>{video.title}</strong><small>{video.channel} · {video.duration}</small></span></button>)}</div></div> : null;
      }) : <div className="yt-search-empty"><strong>Chưa có video trong thư viện khớp từ khóa này.</strong><p>Thử một chủ đề khác hoặc tìm toàn bộ YouTube bằng nút phía trên.</p></div>}
    </section>
    <section className="yt-panel"><h2>Bài luyện có phụ đề & câu hỏi</h2>{loading ? <p>Đang tải bài luyện…</p> : filteredLessons.length ? <div className="yt-lesson-list">{filteredLessons.map((lesson) => <button type="button" key={lesson.id} className={selected?.id === lesson.id ? "active" : ""} onClick={() => pickLesson(lesson)}><strong>{lesson.title}</strong><small>{lesson.cefr} · {lesson.topic}</small></button>)}</div> : <p>{lessons.length ? "Không có bài luyện khớp từ khóa." : "Chưa có bài do giáo viên xuất bản. Bạn vẫn có thể xem và luyện nghe với thư viện video ở trên."}</p>}
      <label>Xem video từ liên kết YouTube<input value={customUrl} onChange={(event) => { setSelected(null); setCatalogSelection(null); setCustomUrl(event.target.value); }} placeholder="https://www.youtube.com/watch?v=..." /></label>{customUrl && !videoId && <small role="alert">Hãy nhập URL HTTPS của một video YouTube hợp lệ.</small>}
    </section>
    {videoId && <section id="yt-watch" className="yt-panel yt-watch"><h2>{selected?.title ?? catalogSelection?.title ?? "Video YouTube"}</h2><YoutubePlayer key={videoId} id={videoId} segment={request ? cue : null} request={request} loop={loop} onTime={setTime} />{selected && <small>Nguồn phụ đề: {selected.rights_license} · {selected.rights_source}</small>}</section>}
    {videoId && !authorized && <section className="yt-panel"><p>Video này chưa có phụ đề và câu hỏi do giáo viên biên soạn. Bạn có thể xem, tạm dừng và chỉnh tốc độ để luyện nghe; các hoạt động chép chính tả, shadowing theo câu sẽ xuất hiện ở bài luyện có phụ đề.</p></section>}
    {authorized && selected && cue && <section className="yt-panel"><div className="yt-mode-tabs" role="group" aria-label="Listening mode">{([ ["shadow","Shadowing"], ["repeat","Repeat After Me"], ["dictation","Dictation"], ["questions","Comprehension"], ["words","Save words"] ] as const).map(([key,label]) => <button key={key} type="button" aria-pressed={mode === key} onClick={() => setMode(key)}>{label}</button>)}</div>
      <div className="yt-layout"><div><h3>Transcript</h3><div className="yt-cues">{selected.transcript.map((item, index) => <button key={`${item.start}-${index}`} type="button" className={`${index === cueIndex ? "selected" : ""} ${index === active ? "playing" : ""}`} onClick={() => playCue(index)}><time>{Math.floor(item.start / 60)}:{String(Math.floor(item.start % 60)).padStart(2, "0")}</time><span>{item.text}</span></button>)}</div></div>
      <div className="yt-activity"><h3>{mode === "shadow" ? "Shadow this sentence" : mode === "repeat" ? "Repeat after me" : mode === "dictation" ? "Type what you hear" : mode === "questions" ? "Teacher questions" : "Save a word"}</h3>
        {mode !== "questions" && <><p className="yt-sentence">{mode === "dictation" && !checked ? "Listen first, then type the sentence." : cue.text}</p><div className="yt-controls"><button type="button" onClick={() => playCue(cueIndex)}>Play sentence</button><label><input type="checkbox" checked={loop} onChange={(event) => setLoop(event.target.checked)} /> Loop</label></div></>}
        {(mode === "shadow" || mode === "repeat") && <div className="yt-record">{mic.recording ? <><span>{mic.paused ? "Paused" : `Recording ${mic.seconds}s`}</span><button type="button" onClick={mic.paused ? mic.resume : mic.pause}>{mic.paused ? "Resume" : "Pause"}</button><button type="button" onClick={() => void stopRecording()}>Stop</button></> : <button type="button" onClick={() => void mic.start()}>Record your voice</button>}{take && <><audio controls src={take.url} aria-label="Your recorded answer" /><button type="button" onClick={() => { mic.release(take.url); setTake(null); }}>Delete recording</button></>}{mic.error && <p role="alert">{mic.error}</p>}<small>Recordings stay in this tab and disappear when you leave.</small></div>}
        {mode === "dictation" && <div className="yt-dictation"><textarea value={answer} onChange={(event) => setAnswer(event.target.value)} aria-label="Type the sentence you heard" rows={3} /><button type="button" disabled={!answer.trim()} onClick={() => setChecked(true)}>Check</button>{checked && <><div className="yt-diff">{wordDifferences(cue.text, answer).map((item, index) => <span key={index} className={item.kind} title={item.kind}>{item.word}</span>)}</div><p>Green: correct · amber: missing · red: extra or incorrect.</p><button type="button" onClick={() => { setAnswer(""); setChecked(false); playCue(cueIndex); }}>Try again</button></>}</div>}
        {mode === "questions" && (selected.questions.length ? <div className="yt-questions">{selected.questions.map((question, index) => <fieldset key={index}><legend>{question.prompt}</legend>{question.options.map((option, optionIndex) => <label key={optionIndex}><input type="radio" name={`yt-q-${index}`} checked={quizAnswers[index] === optionIndex} onChange={() => setQuizAnswers((current) => ({ ...current, [index]: optionIndex }))} /> {option}</label>)}{quizChecked && <p>{quizAnswers[index] === question.answer ? "Correct" : `Answer: ${question.options[question.answer]}`}</p>}</fieldset>)}<button type="button" disabled={Object.keys(quizAnswers).length !== selected.questions.length} onClick={() => setQuizChecked(true)}>Check answers</button><button type="button" onClick={() => { setQuizChecked(false); setQuizAnswers({}); }}>Retry</button></div> : <p>No teacher questions for this lesson yet.</p>)}
        {mode === "words" && <div className="yt-word"><label>Word in this sentence<input value={word} onChange={(event) => setWord(event.target.value)} /></label><label>Meaning<input value={meaning} onChange={(event) => setMeaning(event.target.value)} /></label><button type="button" onClick={() => void saveWord()}>Save to Vocabulary</button><Link href="/app/vocabulary/notebook">Open saved words</Link></div>}
      </div></div></section>}
  </main>;
}
