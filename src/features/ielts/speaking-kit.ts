"use client";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import type { ExamContent } from "@/lib/ielts-bank/schema";

export type SpeakingPart = 1 | 2 | 3;
export type SpeakingItem = { id: string; part: SpeakingPart; kind: "question" | "cue"; text: string; bullets?: string[] };
export type Take = { url: string; seconds: number; transcript: string };

const cueStart = /^(you should say|you should|say:)/i;
const clean = (line: string) => line.replace(/^[\s\-•*·–]+/, "").trim();

/** Splits a cue card written as text: the first line is the topic, lines after "You should say" are its points. */
export function parseCue(text: string): { topic: string; bullets: string[] } {
  const lines = text.split(/\n+/).map(clean).filter(Boolean);
  const topic = lines[0] ?? "";
  const after = lines.slice(1).filter((line) => !cueStart.test(line));
  return { topic, bullets: after };
}

/**
 * One speaking exam as the questions Harry asks, in order. Part 2 is a single
 * cue card: either its own lines (topic, then points) or a written cue card in
 * the prompt, in which case the exam's questions are its Part 3 follow-ups.
 */
export function speakingItems(content: ExamContent, practiceType?: string): SpeakingItem[] {
  const fromType = Number(practiceType?.replace(/\D/g, "")) as SpeakingPart;
  const part: SpeakingPart = (content.speakingPart as SpeakingPart | undefined) ?? ([1, 2, 3].includes(fromType) ? fromType : 1);
  const questions = content.sections.flatMap((section) => section.questions.map((question) => ({ question, section })));
  if (part !== 2) return questions.map(({ question }) => ({ id: question.id, part, kind: "question", text: question.prompt.trim() }));
  const written = content.prompt.trim();
  if (written.includes("\n") && questions.length && questions.every(({ section }) => /part[\s-]*3/i.test(`${section.id} ${section.title}`))) {
    const cue = parseCue(written);
    return [{ id: "cue-card", part: 2, kind: "cue", text: cue.topic, bullets: cue.bullets }, ...questions.map(({ question }) => ({ id: question.id, part: 3 as const, kind: "question" as const, text: question.prompt.trim() }))];
  }
  if (!questions.length) { const cue = parseCue(written); return [{ id: "cue-card", part: 2, kind: "cue", text: cue.topic, bullets: cue.bullets }]; }
  const [first, ...rest] = questions;
  return [{ id: first.question.id, part: 2, kind: "cue", text: first.question.prompt.trim(), bullets: rest.map(({ question }) => clean(question.prompt)) }];
}

export type HintStep = { title: string; probe: string; starters: string[] };

const yesNo = /^(do|does|did|are|is|was|were|have|has|had|can|could|would|will|should|shall)\b/i;
/** Step-by-step help for one question: what to say first, the follow-up Harry would ask, and sentence starters. */
export function hintSteps(item: SpeakingItem): HintStep[] {
  if (item.kind === "cue") {
    const points = (item.bullets ?? []).map((bullet) => {
      const text = bullet.replace(/^and\s+/i, "");
      const word = text.split(/\s+/)[0]?.toLowerCase() ?? "";
      const starters = word === "who" ? ["The person I'd like to talk about is…", "I've known them since…"]
        : word === "when" ? ["It was back in…", "If I remember correctly, it happened…"]
        : word === "where" ? ["It took place in…", "The place is located…"]
        : word === "how" ? ["The way it happened was…", "I usually… by…"]
        : word === "why" || word === "explain" ? ["The main reason it means so much to me is…", "Looking back, I think…"]
        : ["As for what…, I'd say…", "One thing I remember clearly is…"];
      return { title: `Ý: ${text}`, probe: `Tell me ${text.replace(/^explain\s+/i, "")}.`, starters };
    });
    return [
      { title: "Mở bài: nói ngay bạn chọn gì", probe: item.text, starters: ["I'd like to talk about…", "The … that comes to mind is…"] },
      ...points,
      { title: "Kết bài: cảm nghĩ của bạn", probe: "How do you feel about it now?", starters: ["All in all, …", "That's why it will always stay with me."] },
    ];
  }
  const q = item.text.trim();
  const lower = q.toLowerCase();
  if (item.part === 3) return [
    { title: "Nêu quan điểm rõ ràng", probe: q, starters: ["I'd argue that…", "From my point of view, …", "It depends, but generally…"] },
    { title: "Giải thích vì sao", probe: "Why do you think that is?", starters: ["This is mainly because…", "One reason is that…"] },
    { title: "Ví dụ từ xã hội / Việt Nam", probe: "Can you give an example?", starters: ["Take Vietnam, for instance: …", "A good example is…"] },
    { title: "Nhìn mặt còn lại", probe: "Are there any drawbacks?", starters: ["On the other hand, …", "That said, some people believe…"] },
    { title: "Chốt ý", probe: "So what's your overall view?", starters: ["So overall, I'd say…", "In the long run, …"] },
  ];
  if (/^why\b/i.test(q)) return [
    { title: "Lý do chính", probe: q, starters: ["The main reason is that…", "Mostly because…"] },
    { title: "Lý do thứ hai", probe: "Is there any other reason?", starters: ["Another thing is…", "Also, …"] },
    { title: "Ví dụ của bạn", probe: "Can you give me an example?", starters: ["For example, last week I…", "I remember when…"] },
  ];
  if (/^(how often|when|where|what time)\b/i.test(q)) return [
    { title: "Trả lời trực tiếp", probe: q, starters: ["Quite often, actually — about…", "Usually in the…", "Mostly at…"] },
    { title: "Thêm chi tiết: với ai, ở đâu", probe: "Who do you usually do that with?", starters: ["Normally I go with…", "It's usually just me and…"] },
    { title: "Vì sao", probe: "Why is that?", starters: ["I guess it's because…", "It fits my schedule because…"] },
    { title: "So với trước đây", probe: "Has that changed since you were younger?", starters: ["When I was a kid, I used to…", "These days, …"] },
  ];
  if (yesNo.test(lower)) return [
    { title: "Trả lời thẳng: có / không", probe: q, starters: ["Yes, definitely.", "Not really, to be honest.", "It depends."] },
    { title: "Nói lý do", probe: "Why is that?", starters: ["The main reason is that…", "I'd say it's because…"] },
    { title: "Thêm ví dụ của bạn", probe: "Can you give me an example?", starters: ["For instance, …", "I remember when…"] },
    { title: "Mở rộng ý", probe: "Do you think that will change in the future?", starters: ["That said, I might… in the future.", "So overall, …"] },
  ];
  return [
    { title: "Trả lời trực tiếp", probe: q, starters: ["Well, I'd say…", "Actually, it's…", "The first thing that comes to mind is…"] },
    { title: "Mô tả chi tiết", probe: "Can you tell me a bit more about it?", starters: ["What I like about it is…", "It's quite… and…"] },
    { title: "Vì sao / cảm nghĩ", probe: "Why is that important to you?", starters: ["I think that's because…", "It makes me feel…"] },
    { title: "Ví dụ của bạn", probe: "Can you give me an example?", starters: ["For example, …", "Just last month, …"] },
  ];
}

type Recognition = { lang: string; continuous: boolean; interimResults: boolean; start: () => void; stop: () => void; onresult: ((event: { resultIndex: number; results: ArrayLike<{ isFinal: boolean; 0: { transcript: string } }> }) => void) | null; onend: (() => void) | null; onerror: (() => void) | null };
type RecognitionCtor = new () => Recognition;
const recognitionCtor = () => typeof window === "undefined" ? undefined : ((window as unknown as { SpeechRecognition?: RecognitionCtor; webkitSpeechRecognition?: RecognitionCtor }).SpeechRecognition ?? (window as unknown as { webkitSpeechRecognition?: RecognitionCtor }).webkitSpeechRecognition);
const noSubscription = () => () => undefined;

/**
 * The microphone for a speaking session: opens once, records one answer at a
 * time, measures the input level, transcribes where the browser can, and
 * reports when the speaker has gone quiet after talking.
 */
export function useMic() {
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const [level, setLevel] = useState(0);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState("");
  const stream = useRef<MediaStream | null>(null);
  const audio = useRef<{ context: AudioContext; analyser: AnalyserNode } | null>(null);
  const recorder = useRef<MediaRecorder | null>(null);
  const recognition = useRef<Recognition | null>(null);
  const finalText = useRef("");
  const startedAt = useRef(0);
  const pausedAt = useRef(0);
  const pausedTotal = useRef(0);
  const loop = useRef(0);
  const silence = useRef<{ ms: number; onSilence: () => void; spoke: number; quietSince: number; floor: number } | null>(null);
  const takes = useRef<string[]>([]);
  const canTranscribe = useSyncExternalStore(noSubscription, () => Boolean(recognitionCtor()), () => false);

  const open = useCallback(async () => {
    if (stream.current) return true;
    if (typeof navigator === "undefined" || !navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === "undefined") { setError("Trình duyệt chưa hỗ trợ ghi âm."); return false; }
    try {
      stream.current = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      const context = new AudioContext();
      const analyser = context.createAnalyser();
      analyser.fftSize = 1024;
      context.createMediaStreamSource(stream.current).connect(analyser);
      audio.current = { context, analyser };
      setError("");
      return true;
    } catch { setError("Không mở được micro. Hãy cho phép trình duyệt dùng micro rồi thử lại."); return false; }
  }, []);

  // Level meter and silence detection, sampled ten times a second.
  const sample = useCallback(() => {
    const node = audio.current?.analyser;
    if (!node) return;
    const data = new Uint8Array(node.fftSize);
    node.getByteTimeDomainData(data);
    let sum = 0;
    for (const value of data) sum += ((value - 128) / 128) ** 2;
    const rms = Math.sqrt(sum / data.length);
    setLevel(rms);
    const watch = silence.current;
    if (!watch || !startedAt.current) return;
    const now = Date.now();
    if (now - startedAt.current < 600) { watch.floor = Math.max(watch.floor, rms); return; }
    const loud = rms > Math.max(0.02, watch.floor * 2.2);
    if (loud) { watch.spoke += 100; watch.quietSince = 0; }
    else if (!watch.quietSince) watch.quietSince = now;
    if (watch.spoke >= 800 && watch.quietSince && now - watch.quietSince >= watch.ms) { silence.current = null; watch.onSilence(); }
  }, []);

  useEffect(() => {
    loop.current = window.setInterval(() => { if (!pausedAt.current) sample(); if (startedAt.current) setSeconds(Math.floor(((pausedAt.current || Date.now()) - startedAt.current - pausedTotal.current) / 1000)); }, 100);
    const urls = takes.current;
    return () => {
      window.clearInterval(loop.current);
      recognition.current?.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
      void audio.current?.context.close();
      urls.forEach((url) => URL.revokeObjectURL(url));
    };
  }, [sample]);

  const start = useCallback(async (options?: { silenceMs?: number; onSilence?: () => void }) => {
    if (recorder.current || !(await open()) || !stream.current) return false;
    await audio.current?.context.resume();
    const chunks: BlobPart[] = [];
    const next = new MediaRecorder(stream.current);
    next.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data); };
    (next as MediaRecorder & { chunks?: BlobPart[] }).chunks = chunks;
    recorder.current = next;
    next.start();
    startedAt.current = Date.now();
    pausedAt.current = 0; pausedTotal.current = 0; setPaused(false);
    finalText.current = "";
    setTranscript("");
    setSeconds(0);
    setRecording(true);
    silence.current = options?.onSilence && options.silenceMs ? { ms: options.silenceMs, onSilence: options.onSilence, spoke: 0, quietSince: 0, floor: 0 } : null;
    const Ctor = recognitionCtor();
    if (Ctor) {
      try {
        const rec = new Ctor();
        rec.lang = "en-GB"; rec.continuous = true; rec.interimResults = true;
        rec.onresult = (event) => {
          if (pausedAt.current) return;
          let interim = "";
          for (let index = event.resultIndex; index < event.results.length; index += 1) {
            const result = event.results[index];
            if (result.isFinal) finalText.current = `${finalText.current} ${result[0].transcript}`.trim();
            else interim += result[0].transcript;
          }
          setTranscript(`${finalText.current} ${interim}`.trim());
        };
        // Recognition stops by itself after pauses; keep it going while recording.
        rec.onend = () => { if (recognition.current === rec && recorder.current && !pausedAt.current) { try { rec.start(); } catch { /* already running */ } } };
        rec.onerror = () => undefined;
        recognition.current = rec;
        rec.start();
      } catch { recognition.current = null; }
    }
    return true;
  }, [open]);

  const stop = useCallback(() => new Promise<Take | null>((resolve) => {
    const current = recorder.current;
    silence.current = null;
    const rec = recognition.current;
    recognition.current = null;
    rec?.stop();
    if (!current || current.state === "inactive") { resolve(null); return; }
    const took = Math.max(1, Math.round(((pausedAt.current || Date.now()) - startedAt.current - pausedTotal.current) / 1000));
    startedAt.current = 0;
    current.onstop = () => {
      const chunks = (current as MediaRecorder & { chunks?: BlobPart[] }).chunks ?? [];
      const url = URL.createObjectURL(new Blob(chunks, { type: current.mimeType || "audio/webm" }));
      takes.current.push(url);
      recorder.current = null;
      setRecording(false);
      setPaused(false);
      // Late recognition results arrive just after stopping; give them a moment.
      window.setTimeout(() => resolve({ url, seconds: took, transcript: finalText.current.trim() }), 350);
    };
    current.stop();
  }), []);

  const pause = useCallback(() => { if (recorder.current?.state === "recording") { pausedAt.current = Date.now(); recorder.current.pause(); recognition.current?.stop(); setPaused(true); } }, []);
  const resume = useCallback(() => { if (recorder.current?.state === "paused") { pausedTotal.current += Date.now() - pausedAt.current; pausedAt.current = 0; recorder.current.resume(); try { recognition.current?.start(); } catch { /* provider may still be stopping */ } setPaused(false); } }, []);
  const release = useCallback((url: string) => { URL.revokeObjectURL(url); takes.current = takes.current.filter((item) => item !== url); }, []);
  return { open, start, stop, pause, resume, release, recording, paused, seconds, level, transcript, error, canTranscribe };
}

export const clock = (value: number) => `${Math.floor(Math.max(0, value) / 60)}:${String(Math.max(0, value) % 60).padStart(2, "0")}`;
export const wordsIn = (text: string) => text.trim() ? text.trim().split(/\s+/).length : 0;
