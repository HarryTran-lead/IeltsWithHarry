"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowRight,
  Check,
  Headphones,
  Mic,
  RotateCcw,
  Save,
  Square,
  Volume2,
} from "lucide-react";
import { Mochi } from "@/components/illustrations/mochi";
import { useDemo } from "@/features/demo/demo-store";
import { stages, vocabulary } from "@/lib/demo-data";

const modules = [
  {
    name: "Vocabulary",
    href: "/app/vocabulary",
    icon: "🧠",
    description: "Build useful words with flashcards and examples.",
    color: "mint",
  },
  {
    name: "Grammar",
    href: "/app/grammar",
    icon: "📝",
    description: "Learn a simple rule and test your understanding.",
    color: "blue",
  },
  {
    name: "Reading",
    href: "/app/reading",
    icon: "📖",
    description: "Read an original short passage and check your answers.",
    color: "coral",
  },
  {
    name: "Listening",
    href: "/app/listening",
    icon: "🎧",
    description: "Listen to a short conversation and catch details.",
    color: "teal",
  },
  {
    name: "Writing",
    href: "/app/writing",
    icon: "✏️",
    description: "Plan, write and save a practice response.",
    color: "yellow",
  },
  {
    name: "Speaking",
    href: "/app/speaking",
    icon: "🎙️",
    description: "Record yourself and reflect on your answer.",
    color: "purple",
  },
];

function PageIntro({
  eyebrow,
  title,
  description,
  icon,
}: {
  eyebrow: string;
  title: string;
  description: string;
  icon: string;
}) {
  return (
    <div className="learning-intro">
      <div>
        <span className="eyebrow">{eyebrow}</span>
        <h1>
          <span>{icon}</span> {title}
        </h1>
        <p>{description}</p>
      </div>
      <Mochi size={92} />
    </div>
  );
}

function LearnOverview({ stageId }: { stageId?: string }) {
  const selected = stages.find((stage) => stage.id === stageId);
  return (
    <div className="content-page">
      <PageIntro
        eyebrow="YOUR ROADMAP"
        title={selected ? selected.name : "Explore your learning path"}
        description={
          selected
            ? selected.description
            : "Seven milestones from your first English words to confident IELTS practice."
        }
        icon="🗺️"
      />
      <section className="card section-card">
        <div className="section-head">
          <h2>Learning stages</h2>
          <span>Milestones are guidance, not official IELTS scores.</span>
        </div>
        <div className="stage-grid">
          {stages.map((stage, index) => (
            <Link
              key={stage.id}
              href={`/app/learn/${stage.id}`}
              className={`stage-card ${stage.status} ${selected?.id === stage.id ? "selected" : ""}`}
            >
              <span className="stage-index">
                {stage.status === "done" ? <Check size={17} /> : index + 1}
              </span>
              <strong>{stage.range}</strong>
              <h3>{stage.name}</h3>
              <p>{stage.description}</p>
              <span className="stage-status">
                {stage.status === "done"
                  ? "Demo milestone"
                  : stage.status === "current"
                    ? "Current stage"
                    : "Preview stage"}{" "}
                <ArrowRight size={14} />
              </span>
            </Link>
          ))}
        </div>
      </section>
      <section className="card section-card">
        <div className="section-head">
          <h2>
            {selected ? `Practice in ${selected.name}` : "Choose a skill"}
          </h2>
          <span>Try one complete sample activity in each skill.</span>
        </div>
        <div className="module-grid">
          {modules.map((module) => (
            <Link
              key={module.name}
              href={module.href}
              className={`module-card ${module.color}`}
            >
              <span>{module.icon}</span>
              <h3>{module.name}</h3>
              <p>{module.description}</p>
              <b>
                Start learning <ArrowRight size={15} />
              </b>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function LessonOverview() {
  return (
    <div className="content-page">
      <PageIntro
        eyebrow="CURRENT UNIT · IELTS STARTER"
        title="Technology & Digital Life"
        description="Explore everyday technology through vocabulary, examples and short practice tasks."
        icon="💻"
      />
      <section className="card section-card lesson-overview">
        <div className="section-head">
          <h2>What you’ll learn</h2>
          <span>About 25 minutes across six skills</span>
        </div>
        <div className="objective-list">
          <p>
            <Check size={18} /> Use five useful words about technology in a
            sentence.
          </p>
          <p>
            <Check size={18} /> Understand a short passage about digital habits.
          </p>
          <p>
            <Check size={18} /> Give a clear opinion about a useful device.
          </p>
        </div>
        <h3>Pick your next activity</h3>
        <div className="module-grid">
          {modules.map((module) => (
            <Link
              key={module.name}
              href={module.href}
              className={`module-card ${module.color}`}
            >
              <span>{module.icon}</span>
              <h3>{module.name}</h3>
              <p>{module.description}</p>
              <b>
                Practice now <ArrowRight size={15} />
              </b>
            </Link>
          ))}
        </div>
      </section>
    </div>
  );
}

function ExerciseResult({
  correct,
  total,
  onRetry,
  explanation,
}: {
  correct: number;
  total: number;
  onRetry: () => void;
  explanation: string[];
}) {
  return (
    <div className="result-panel">
      <span className="result-sparkle">✨</span>
      <h3>
        {correct === total
          ? "Wonderful work!"
          : "Good effort — keep practicing!"}
      </h3>
      <p>
        You answered {correct} of {total} correctly.
      </p>
      <div>
        {explanation.map((line, i) => (
          <p key={i}>
            <b>{i + 1}.</b> {line}
          </p>
        ))}
      </div>
      <button className="button subtle" onClick={onRetry}>
        <RotateCcw size={16} /> Try again
      </button>
    </div>
  );
}

function VocabularyPage() {
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const [saved, setSaved] = useState<string[]>([]);
  const card = vocabulary[index];
  return (
    <div className="content-page">
      <PageIntro
        eyebrow="LEARN · PRACTICE · REVIEW"
        title="Vocabulary Lab"
        description="Five practical words for Technology & Digital Life. Flip each card to see the meaning and example."
        icon="🧠"
      />
      <div className="practice-layout">
        <section className="card practice-main">
          <div className="lesson-topline">
            <span className="skill-tag vocabulary">
              Technology & Digital Life
            </span>
            <span>
              Card {index + 1} of {vocabulary.length}
            </span>
          </div>
          <div className="card-progress">
            <span
              style={{ width: `${((index + 1) / vocabulary.length) * 100}%` }}
            />
          </div>
          <button
            className={`flashcard ${flipped ? "flipped" : ""}`}
            onClick={() => setFlipped(!flipped)}
            aria-label={`Flashcard for ${card.word}. Click to flip.`}
          >
            {!flipped ? (
              <>
                <small>Tap to reveal the meaning</small>
                <strong>{card.word}</strong>
                <span>{card.phonetic}</span>
                <Volume2 size={23} />
              </>
            ) : (
              <>
                <small>VIETNAMESE MEANING</small>
                <strong>{card.meaning}</strong>
                <p>{card.definition}</p>
                <em>“{card.example}”</em>
                <span>Collocation: {card.collocation}</span>
              </>
            )}
          </button>
          <div className="flash-actions">
            <button
              className="button subtle"
              onClick={() =>
                setSaved((current) =>
                  current.includes(card.word)
                    ? current.filter((word) => word !== card.word)
                    : [...current, card.word],
                )
              }
            >
              {saved.includes(card.word) ? "★ Saved" : "☆ Save word"}
            </button>
            <button
              className="button primary"
              onClick={() => {
                setIndex((index + 1) % vocabulary.length);
                setFlipped(false);
              }}
            >
              Next word <ArrowRight size={16} />
            </button>
          </div>
        </section>
        <aside className="card practice-side">
          <h3>Study tip 💡</h3>
          <p>
            Read the example aloud, then make one sentence about your own life.
          </p>
          <hr />
          <strong>{saved.length} saved words</strong>
          <p>
            Saved words remain in this page during your current visit. Spaced
            review will arrive with accounts.
          </p>
        </aside>
      </div>
    </div>
  );
}

function GrammarPage() {
  const { saveAttempt } = useDemo();
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState(false);
  return (
    <div className="content-page">
      <PageIntro
        eyebrow="GRAMMAR · BEGINNER"
        title="Present Simple"
        description="Use the present simple for habits and facts. The verb changes with he, she and it."
        icon="📝"
      />
      <div className="practice-layout">
        <section className="card practice-main">
          <span className="lesson-kicker">QUICK LESSON</span>
          <h2>A small rule with a big impact</h2>
          <p>
            <b>I / you / we / they</b> use the base verb: “I study English.”
          </p>
          <p>
            <b>He / she / it</b> usually adds <b>-s</b>: “She studies English.”
          </p>
          <div className="tip-box">
            🇻🇳 Thì hiện tại đơn diễn tả thói quen, sự thật. Với “she”, động từ
            thường thêm -s hoặc -es.
          </div>
          <h3>Choose the correct sentence</h3>
          <div className="answer-options">
            {[
              "She study English every day.",
              "She studies English every day.",
              "She studying English every day.",
            ].map((option) => (
              <button
                key={option}
                className={answer === option ? "selected" : ""}
                onClick={() => setAnswer(option)}
                disabled={result}
              >
                {option}
              </button>
            ))}
          </div>
          {!result ? (
            <button
              className="button primary"
              disabled={!answer}
              onClick={() => {
                setResult(true);
                saveAttempt(
                  "grammar-present-simple",
                  Number(answer === "She studies English every day."),
                  1,
                );
              }}
            >
              Check answer <ArrowRight size={16} />
            </button>
          ) : (
            <ExerciseResult
              correct={Number(answer === "She studies English every day.")}
              total={1}
              explanation={[
                "“She” is third-person singular, so “study” becomes “studies”.",
              ]}
              onRetry={() => {
                setAnswer("");
                setResult(false);
              }}
            />
          )}
        </section>
        <aside className="card practice-side">
          <h3>Common mistake</h3>
          <p>
            Don’t forget the <b>-s</b> ending with he, she and it in positive
            statements.
          </p>
          <Link href="/app/learn" className="text-link">
            Explore more skills →
          </Link>
        </aside>
      </div>
    </div>
  );
}

const passage =
  "In a busy city, even a small garden can make a difference. Maya and her neighbours turned an empty space beside their apartment building into a community garden. They planted tomatoes, herbs and flowers. Every Saturday morning, families water the plants together. The garden gives people fresh food, but it also helps neighbours get to know each other. Maya says the best part is seeing children learn where vegetables come from.";
const readingQuestions = [
  {
    q: "What did Maya and her neighbours create?",
    options: ["A new apartment", "A community garden", "A shopping area"],
    answer: 1,
    why: "They turned an empty space into a community garden.",
  },
  {
    q: "When do families water the plants?",
    options: ["Every Saturday morning", "Every evening", "Once a month"],
    answer: 0,
    why: "The passage says families water the plants every Saturday morning.",
  },
  {
    q: "What does Maya like best?",
    options: [
      "Selling tomatoes",
      "Meeting visitors",
      "Children learning about vegetables",
    ],
    answer: 2,
    why: "Maya says the best part is seeing children learn where vegetables come from.",
  },
];

function ReadingPage() {
  const { saveAttempt } = useDemo();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const correct = readingQuestions.filter(
    (q, i) => answers[i] === q.answer,
  ).length;
  return (
    <div className="content-page">
      <PageIntro
        eyebrow="READING · FOUNDATION"
        title="City Gardens"
        description="Practice finding key details in a short, original passage."
        icon="📖"
      />
      <div className="reading-layout">
        <section className="card passage-card">
          <span className="lesson-kicker">READING PASSAGE</span>
          <h2>A garden for everyone</h2>
          <p>{passage}</p>
          <div className="passage-footer">
            Tip: look for words in the passage that match each question.
          </div>
        </section>
        <section className="card question-card">
          <div className="section-head">
            <h2>Check your understanding</h2>
            <span>
              {Object.keys(answers).length}/{readingQuestions.length} answered
            </span>
          </div>
          {readingQuestions.map((item, i) => (
            <div className="question-block" key={item.q}>
              <h3>
                {i + 1}. {item.q}
              </h3>
              <div className="answer-options">
                {item.options.map((option, optionIndex) => (
                  <button
                    key={option}
                    disabled={submitted}
                    className={`${answers[i] === optionIndex ? "selected" : ""} ${submitted && optionIndex === item.answer ? "correct" : ""} ${submitted && answers[i] === optionIndex && optionIndex !== item.answer ? "wrong" : ""}`}
                    onClick={() =>
                      setAnswers((current) => ({
                        ...current,
                        [i]: optionIndex,
                      }))
                    }
                  >
                    {option}
                  </button>
                ))}
              </div>
            </div>
          ))}
          {!submitted ? (
            <button
              className="button primary"
              disabled={Object.keys(answers).length !== readingQuestions.length}
              onClick={() => {
                setSubmitted(true);
                saveAttempt(
                  "reading-city-gardens",
                  correct,
                  readingQuestions.length,
                );
              }}
            >
              Submit answers <ArrowRight size={16} />
            </button>
          ) : (
            <ExerciseResult
              correct={correct}
              total={readingQuestions.length}
              explanation={readingQuestions.map((q) => q.why)}
              onRetry={() => {
                setAnswers({});
                setSubmitted(false);
              }}
            />
          )}
        </section>
      </div>
    </div>
  );
}

const listeningText =
  "Hi, I’m Lily. I usually study English after dinner. On Mondays, I listen to a short podcast. On Wednesdays, I practice speaking with my friend. My favourite part is learning new words because I can use them at work.";
function ListeningPage() {
  const { saveAttempt } = useDemo();
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [showTranscript, setShowTranscript] = useState(false);
  useEffect(() => () => window.speechSynthesis?.cancel(), []);
  function play() {
    if (!("speechSynthesis" in window)) return;
    window.speechSynthesis.cancel();
    const utterance = new SpeechSynthesisUtterance(listeningText);
    utterance.lang = "en-US";
    utterance.rate = speed;
    utterance.onend = () => setPlaying(false);
    utterance.onerror = () => setPlaying(false);
    setPlaying(true);
    window.speechSynthesis.speak(utterance);
  }
  return (
    <div className="content-page">
      <PageIntro
        eyebrow="LISTENING · BEGINNER"
        title="A weekly study routine"
        description="Listen for when Lily practices speaking. Audio is generated by your browser in this demo."
        icon="🎧"
      />
      <div className="practice-layout">
        <section className="card practice-main">
          <div className="audio-panel">
            <Headphones size={34} />
            <div>
              <h2>Listen to Lily</h2>
              <p>Short conversation · about 25 seconds</p>
            </div>
            <button
              className="button primary"
              onClick={
                playing
                  ? () => {
                      window.speechSynthesis.cancel();
                      setPlaying(false);
                    }
                  : play
              }
            >
              {playing ? <Square size={16} /> : <Volume2 size={17} />}{" "}
              {playing ? "Stop" : "Play audio"}
            </button>
          </div>
          <label className="speed-select">
            Playback speed{" "}
            <select
              value={speed}
              onChange={(e) => setSpeed(Number(e.target.value))}
            >
              <option value="0.8">0.8×</option>
              <option value="1">1×</option>
              <option value="1.2">1.2×</option>
            </select>
          </label>
          <h3>When does Lily practice speaking?</h3>
          <div className="answer-options">
            {["On Mondays", "On Wednesdays", "Every evening"].map((option) => (
              <button
                key={option}
                disabled={submitted}
                className={answer === option ? "selected" : ""}
                onClick={() => setAnswer(option)}
              >
                {option}
              </button>
            ))}
          </div>
          {!submitted ? (
            <button
              className="button primary"
              disabled={!answer}
              onClick={() => {
                setSubmitted(true);
                saveAttempt(
                  "listening-daily-life",
                  Number(answer === "On Wednesdays"),
                  1,
                );
              }}
            >
              Check answer
            </button>
          ) : (
            <ExerciseResult
              correct={Number(answer === "On Wednesdays")}
              total={1}
              explanation={[
                "Lily says she practices speaking with her friend on Wednesdays.",
              ]}
              onRetry={() => {
                setAnswer("");
                setSubmitted(false);
                setShowTranscript(false);
              }}
            />
          )}
          <button
            className="text-link transcript-toggle"
            onClick={() => setShowTranscript(!showTranscript)}
            disabled={!submitted}
          >
            {showTranscript
              ? "Hide transcript"
              : "Reveal transcript after answering"}
          </button>
          {showTranscript && <blockquote>{listeningText}</blockquote>}
        </section>
        <aside className="card practice-side">
          <h3>Listening tip</h3>
          <p>
            Listen once for the main idea. On the second play, focus on days and
            activities.
          </p>
          <small>
            Speech synthesis availability and voice quality depend on your
            browser.
          </small>
        </aside>
      </div>
    </div>
  );
}

function WritingPage() {
  const { draft, saveDraft } = useDemo();
  const [text, setText] = useState(draft);
  const [saved, setSaved] = useState(false);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return (
    <div className="content-page">
      <PageIntro
        eyebrow="WRITING · IELTS STARTER"
        title="Technology in daily life"
        description="Write a short opinion paragraph. Your draft is stored locally in this browser."
        icon="✏️"
      />
      <div className="practice-layout">
        <section className="card practice-main">
          <span className="lesson-kicker">WRITING PROMPT</span>
          <h2>Do digital devices make daily life easier?</h2>
          <p>Write 80–120 words. Give one reason and a personal example.</p>
          <div className="writing-toolbar">
            <span>{words} words</span>
            <span>Suggested: 80–120</span>
          </div>
          <textarea
            className="writing-editor"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setSaved(false);
            }}
            placeholder="In my opinion, digital devices make daily life easier because..."
            aria-label="Writing answer"
          />
          <div className="writing-actions">
            <span>
              {saved
                ? "✓ Draft saved in this browser"
                : "Your draft has not been saved yet"}
            </span>
            <button
              className="button primary"
              onClick={() => {
                saveDraft(text);
                setSaved(true);
              }}
            >
              <Save size={16} /> Save draft
            </button>
          </div>
        </section>
        <aside className="card practice-side">
          <h3>Self-check before you finish</h3>
          <p>✓ Did I give a clear opinion?</p>
          <p>✓ Did I explain one reason?</p>
          <p>✓ Did I include an example?</p>
          <hr />
          <small>
            AI feedback and official band scoring are not available in demo
            mode.
          </small>
        </aside>
      </div>
    </div>
  );
}

function SpeakingPage() {
  const recorder = useRef<MediaRecorder | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const chunks = useRef<Blob[]>([]);
  const currentURL = useRef<string | null>(null);
  const [recording, setRecording] = useState(false);
  const [audioURL, setAudioURL] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  useEffect(() => {
    if (!recording) return;
    const id = setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => clearInterval(id);
  }, [recording]);
  useEffect(
    () => () => {
      if (recorder.current?.state === "recording") recorder.current.stop();
      stream.current?.getTracks().forEach((track) => track.stop());
      if (currentURL.current) URL.revokeObjectURL(currentURL.current);
    },
    [],
  );
  async function start() {
    setError("");
    if (!navigator.mediaDevices?.getUserMedia || !window.MediaRecorder) {
      setError("Recording is not supported in this browser.");
      return;
    }
    try {
      const media = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.current = media;
      chunks.current = [];
      const instance = new MediaRecorder(media);
      instance.ondataavailable = (event) => {
        if (event.data.size) chunks.current.push(event.data);
      };
      instance.onstop = () => {
        const blob = new Blob(chunks.current, {
          type: instance.mimeType || "audio/webm",
        });
        if (currentURL.current) URL.revokeObjectURL(currentURL.current);
        currentURL.current = URL.createObjectURL(blob);
        setAudioURL(currentURL.current);
        media.getTracks().forEach((track) => track.stop());
      };
      instance.start();
      recorder.current = instance;
      setSeconds(0);
      setRecording(true);
    } catch {
      setError(
        "Microphone access was denied or is unavailable. Please allow access and try again.",
      );
    }
  }
  function stop() {
    recorder.current?.stop();
    setRecording(false);
  }
  return (
    <div className="content-page">
      <PageIntro
        eyebrow="SPEAKING · IELTS STARTER"
        title="Talk about technology"
        description="Record a short answer, listen back, and reflect on your clarity and fluency."
        icon="🎙️"
      />
      <div className="practice-layout">
        <section className="card practice-main">
          <span className="lesson-kicker">SPEAKING PROMPT</span>
          <h2>What digital device do you use most often?</h2>
          <p>
            Say what it is, how you use it, and why it is useful to you. Aim for
            30–60 seconds.
          </p>
          <div className="recording-panel">
            <div className={`record-icon ${recording ? "active" : ""}`}>
              <Mic size={32} />
            </div>
            <strong>
              {recording ? `Recording · ${seconds}s` : "Ready when you are"}
            </strong>
            <p>Your audio stays on this device during this visit.</p>
            <button
              className={`button ${recording ? "coral" : "primary"}`}
              onClick={recording ? stop : start}
            >
              {recording ? <Square size={16} /> : <Mic size={17} />}{" "}
              {recording ? "Stop recording" : "Start recording"}
            </button>
            {error && (
              <p className="error-message" role="alert">
                {error}
              </p>
            )}
            {audioURL && !recording && (
              <div className="playback">
                <audio
                  controls
                  src={audioURL}
                  aria-label="Your speaking recording"
                />
                <a
                  className="text-link"
                  href={audioURL}
                  download="speaking-practice.webm"
                >
                  Download recording
                </a>
              </div>
            )}
          </div>
        </section>
        <aside className="card practice-side">
          <h3>Helpful phrases</h3>
          <p>“I use my … every day.”</p>
          <p>“It helps me to …”</p>
          <p>“The main reason is …”</p>
          <hr />
          <small>
            Automatic pronunciation feedback is not available in this demo.
          </small>
        </aside>
      </div>
    </div>
  );
}

function ProgressPage() {
  const { tasks, attempts, goal } = useDemo();
  const completed = tasks.filter((t) => t.completed).length;
  const pct = tasks.length ? Math.round((completed / tasks.length) * 100) : 0;
  return (
    <div className="content-page">
      <PageIntro
        eyebrow="YOUR JOURNEY"
        title="Learning progress"
        description="A snapshot of the activity saved in this browser."
        icon="📊"
      />
      <div className="progress-stat-grid">
        <div className="card">
          <span>✅</span>
          <strong>{completed}</strong>
          <small>Tasks completed</small>
        </div>
        <div className="card">
          <span>⚡</span>
          <strong>{attempts.length}</strong>
          <small>Practice attempts</small>
        </div>
        <div className="card">
          <span>🎯</span>
          <strong>{goal}</strong>
          <small>Daily task goal</small>
        </div>
        <div className="card">
          <span>📈</span>
          <strong>{pct}%</strong>
          <small>Planner completion</small>
        </div>
      </div>
      <section className="card section-card">
        <div className="section-head">
          <h2>Recent practice</h2>
        </div>
        {attempts.length ? (
          <div className="attempt-list">
            {attempts
              .slice()
              .reverse()
              .map((attempt) => (
                <div key={attempt.id}>
                  <span>{attempt.lesson.replaceAll("-", " ")}</span>
                  <strong>
                    {attempt.score}/{attempt.total}
                  </strong>
                  <small>{attempt.date}</small>
                </div>
              ))}
          </div>
        ) : (
          <div className="empty-state">
            No practice attempts yet. Try a Reading or Grammar activity.
          </div>
        )}
        <Link href="/app/learn" className="button primary">
          Explore activities <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  );
}

function UnavailablePage({ title }: { title: string }) {
  return (
    <div className="content-page">
      <PageIntro
        eyebrow="COMING IN A LATER PHASE"
        title={title}
        description="This area needs account-backed progress and is not part of the current demo."
        icon="✨"
      />
      <section className="card section-card">
        <h2>Keep learning in demo mode</h2>
        <p>
          Explore the sample lessons and planner while this feature is being
          built.
        </p>
        <Link href="/app/learn" className="button primary">
          View learning path <ArrowRight size={16} />
        </Link>
      </section>
    </div>
  );
}

export function LearningPage({ section }: { section: string }) {
  const pathname = usePathname();
  const { ready } = useDemo();
  const stageId = section === "learn" ? pathname.split("/")[3] : undefined;
  if (section === "learn") return <LearnOverview stageId={stageId} />;
  if (section === "lesson") return <LessonOverview />;
  if (section === "vocabulary") return <VocabularyPage />;
  if (section === "grammar") return <GrammarPage />;
  if (section === "reading") return <ReadingPage />;
  if (section === "listening") return <ListeningPage />;
  if (section === "writing")
    return ready ? (
      <WritingPage />
    ) : (
      <div className="content-page">Loading draft…</div>
    );
  if (section === "speaking") return <SpeakingPage />;
  if (section === "progress" || section === "achievements")
    return <ProgressPage />;
  return (
    <UnavailablePage
      title={section.charAt(0).toUpperCase() + section.slice(1)}
    />
  );
}
