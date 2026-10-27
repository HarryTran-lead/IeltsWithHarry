"use client";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { demoMode } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/browser";
import { useNotebook } from "@/features/notebook/notebook-store";
import { useMic, type Take } from "@/features/ielts/speaking-kit";
import { wordDifferences, youtubeId, type VideoLesson } from "@/lib/listening/youtube";
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
  const videoId = selected?.youtube_id ?? youtubeId(customUrl);
  const authorized = Boolean(selected && selected.transcript.length && selected.rights_source && selected.rights_license);
  const active = selected?.transcript.findIndex((item) => time >= item.start && time < item.end) ?? -1;
  function pickLesson(lesson: VideoLesson) { if (take) mic.release(take.url); setTake(null); setSelected(lesson); setCustomUrl(""); setCueIndex(0); setRequest(0); setChecked(false); setAnswer(""); setQuizChecked(false); setQuizAnswers({}); setError(""); }
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
    <header><Link href="/app/listening">← Listening</Link><h1>YouTube Shadowing & Listening Lab</h1><p>Practice with teacher supplied transcripts and questions. Videos play in the official YouTube player.</p></header>
    {error && <p role="status" className="yt-notice">{error}</p>}
    <section className="yt-panel"><h2>Video lessons</h2>{loading ? <p>Loading lessons…</p> : lessons.length ? <div className="yt-lesson-list">{lessons.map((lesson) => <button type="button" key={lesson.id} className={selected?.id === lesson.id ? "active" : ""} onClick={() => pickLesson(lesson)}><strong>{lesson.title}</strong><small>{lesson.cefr} · {lesson.topic}</small></button>)}</div> : <p>No published video lessons yet.</p>}
      <label>Watch a YouTube URL without transcript activities<input value={customUrl} onChange={(event) => { setSelected(null); setCustomUrl(event.target.value); }} placeholder="https://www.youtube.com/watch?v=..." /></label>{customUrl && !videoId && <small role="alert">Enter a valid HTTPS YouTube video URL.</small>}
    </section>
    {videoId && <section className="yt-panel"><h2>{selected?.title ?? "YouTube video"}</h2><YoutubePlayer key={videoId} id={videoId} segment={request ? cue : null} request={request} loop={loop} onTime={setTime} />{selected && <small>Transcript rights: {selected.rights_license} · {selected.rights_source}</small>}</section>}
    {videoId && !authorized && <section className="yt-panel"><p>Transcript activities require a licensed transcript supplied by an admin. You can watch this video normally.</p></section>}
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
