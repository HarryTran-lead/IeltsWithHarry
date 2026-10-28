"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Check,
  CircleCheck,
  Headphones,
  Lightbulb,
  Target,
  TrendingUp,
  Mic,
  RotateCcw,
  Save,
  Square,
  Volume2,
} from "lucide-react";
import { Sticker, type StickerName } from "@/components/stickers/stickers";
import { HeadIcon } from "@/components/ui/head-icon";
import { PageHeader } from "@/components/ui/page-header";
import { celebrateScore } from "@/lib/celebrate";
import { OpenCourses, StageLessons, usePublishedCourses } from "./stage-courses";
import { StageMap, stageStops } from "./stage-map";
import { useDemo } from "@/features/demo/demo-store";
import { stages, vocabulary } from "@/lib/demo-data";
import { demoMode, lockedLearnerPath, releaseLocks } from "@/lib/runtime";
import { ProfilePage } from "@/features/account/profile-page";
import { useNotebook } from "@/features/notebook/notebook-store";
import { SavedWordReview } from "@/features/news/saved-word-review";

const modules = [
  {
    name: "Vocabulary",
    href: "/app/vocabulary",
    icon: "abc" as StickerName,
    description: "Learn IELTS vocabulary from current articles and review saved words.",
    color: "mint",
  },
  {
    name: "Grammar",
    href: "/app/grammar",
    icon: "pencil" as StickerName,
    description: "Identify grammar patterns in current English articles.",
    color: "blue",
  },
  {
    name: "Reading",
    href: "/app/reading",
    icon: "book" as StickerName,
    description: "Read source credited articles and answer IELTS style questions.",
    color: "coral",
  },
  {
    name: "Listening",
    href: "/app/listening",
    icon: "headphones" as StickerName,
    description: "Listen to updated public domain recordings and take notes.",
    color: "teal",
  },
  {
    name: "Writing",
    href: "/app/writing",
    icon: "chart" as StickerName,
    description: "Practise IELTS Academic Task 1 and Task 2 with current data.",
    color: "yellow",
  },
  {
    name: "Speaking",
    href: "/app/speaking",
    icon: "mic" as StickerName,
    description: "Use IELTS cue cards, a timer and recording to practise speaking.",
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
  icon: StickerName;
}) {
  return <PageHeader eyebrow={eyebrow} title={title} description={description} sticker={icon} />;
}

function LearnOverview({ stageId }: { stageId?: string }) {
  const selected = stages.find((stage) => stage.id === stageId);
  const published = usePublishedCourses();
  const { attempts } = useDemo();
  const { visits } = useNotebook();
  const stageCourses = published.courses.filter((course) => course.stage_id === (stageId ?? "foundation"));
  const stageLessons = stageCourses.flatMap((course) => course.units.flatMap((unit) => unit.lessons));
  const visited = new Set(visits.map((visit) => visit.path));
  const submitted = new Set(attempts.map((attempt) => attempt.lesson));
  const explored = stageLessons.filter((lesson) => visited.has(`/app/lesson/${lesson.slug}`) || submitted.has(lesson.slug)).length;
  const nextLesson = stageLessons.find((lesson) => !visited.has(`/app/lesson/${lesson.slug}`) && !submitted.has(lesson.slug));
  const total = stageLessons.length;
  const stops = stageStops(published.courses, (slug) => visited.has(`/app/lesson/${slug}`) || submitted.has(slug));
  return (
    <div className="content-page learn-overview">
      {selected ? <header className="learn-stage-heading learn-stage-tools">
        <Link href="/app/learn" aria-label="Toàn bộ lộ trình">← Lộ trình</Link>
        <div><span className="eyebrow">CHẶNG {stages.indexOf(selected) + 1} · {selected.range}</span><h1>{selected.name}</h1></div>
        <span className="learn-stage-count"><strong>{explored}/{total || "…"}</strong> bài đã mở</span>
        {nextLesson ? <Link className="button primary" href={`/app/lesson/${nextLesson.slug}`}>{explored ? "Học tiếp" : "Bắt đầu học"} <ArrowRight size={16} /></Link> : !published.loading && total > 0 ? <span className="learn-mission-complete">Đã xem hết bài · chọn unit để ôn lại</span> : null}
        <details><summary>Đổi chặng</summary><div className="learn-stage-menu">{stages.map((stage) => releaseLocks && ["foundation", "elementary", "pre-ielts"].includes(stage.id) ? <span key={stage.id} aria-disabled="true"><b>{stage.range}</b> {stage.name} · Sắp mở</span> : <Link key={stage.id} href={`/app/learn/${stage.id}`} aria-current={stage.id === selected.id ? "page" : undefined}><b>{stage.range}</b> {stage.name}</Link>)}</div></details>
      </header> : <section className="learn-mission" aria-label="Bài học tiếp theo">
        <div className="learn-mission-main"><span className="eyebrow">HÀNH TRÌNH CỦA BẠN · BẮT ĐẦU TỪ ĐÂY</span>
          <h1>Một bài nhỏ hôm nay, một bước tiến ngày mai</h1>
          <p>Chọn chặng học phù hợp. Mỗi unit là một trạm, mỗi bài học là một bước tiến có thể nhìn thấy.</p>
          {nextLesson && <Link className="button primary" href={`/app/lesson/${nextLesson.slug}`}>{explored ? "Tiếp tục hành trình" : "Bắt đầu bài đầu tiên"} <ArrowRight size={16} /></Link>}
          {demoMode && !nextLesson && <Link className="button primary" href="/app/learn/foundation">Xem hành trình Foundation <ArrowRight size={16} /></Link>}
          {!nextLesson && !published.loading && total > 0 && <span className="learn-mission-complete">Đã khám phá hết bài học ở chặng này. Bạn có thể ôn lại hoặc làm bài kiểm tra cuối khóa.</span>}
        </div>
        <div className="learn-mission-progress"><span>LỘ TRÌNH HỌC</span><strong>{demoMode && !total ? "7" : explored}<small>{demoMode && !total ? " chặng" : `/${total || "…"}`}</small></strong><span>{demoMode && !total ? "mốc trong lộ trình" : "bài đã mở"}</span><div className="study-map-bar"><i style={{ width: `${total ? Math.round(explored / total * 100) : 0}%` }} /></div><small>{demoMode && !total ? "Đăng nhập để lưu tiến độ học" : `Bước kế tiếp: ${nextLesson?.title ?? (total ? "Ôn tập" : "Đang tải bài học")}`}</small></div>
      </section>}
      {selected && <StageLessons stageId={selected.id} {...published} />}
      {!selected && <section className="card section-card">
        <div className="section-head">
          <h2>Bản đồ 7 chặng học</h2>
          <span>Chọn chặng để xem từng unit và bài học. Mốc band là định hướng nội bộ.</span>
        </div>
        <StageMap stops={stops} />
      </section>}
      {!selected && <OpenCourses courses={published.courses} loading={published.loading} />}
      <section className="card section-card">
        <div className="section-head">
          <h2>
            {selected ? `Luyện thêm kỹ năng` : "Chọn kỹ năng"}
          </h2>
          <span>Mỗi kỹ năng có một hoạt động mẫu hoàn chỉnh.</span>
        </div>
        <div className="module-grid">
          {modules.filter((module) => !lockedLearnerPath(module.href)).map((module) => (
            <Link
              key={module.name}
              href={module.href}
              className={`module-card ${module.color}`}
            >
              <Sticker name={module.icon} size={46} tilt={-6} />
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
        icon="rocket"
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
          {modules.filter((module) => !lockedLearnerPath(module.href)).map((module) => (
            <Link
              key={module.name}
              href={module.href}
              className={`module-card ${module.color}`}
            >
              <Sticker name={module.icon} size={46} tilt={-6} />
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
  const panel = useRef<HTMLDivElement>(null);
  useEffect(() => { celebrateScore(correct, total, panel.current); }, [correct, total]);
  return (
    <div className="result-panel" ref={panel}>
      <Sticker name={correct === total ? "star" : "heart"} size={52} tilt={10} />
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
  const { entries, addEntry, removeEntry, error: notebookError } = useNotebook();
  const [index, setIndex] = useState(0);
  const [flipped, setFlipped] = useState(false);
  const card = vocabulary[index];
  const savedEntry = entries.find((entry) => entry.kind === "word" && entry.title === card.word && entry.sourcePath === "/app/vocabulary");
  const savedCount = entries.filter((entry) => entry.kind === "word" && entry.sourcePath === "/app/vocabulary").length;
  return (
    <div className="content-page">
      <PageIntro
        eyebrow="LEARN · PRACTICE · REVIEW"
        title="Vocabulary Lab"
        description="Five practical words for Technology & Digital Life. Flip each card to see the meaning and example."
        icon="abc"
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
              onClick={async () => { try { if (savedEntry) await removeEntry(savedEntry.id); else await addEntry({ kind: "word", title: card.word, body: "", meaningVi: card.meaning, example: card.example }); } catch { /* Notebook shows the error. */ } }}
            >
              {savedEntry ? "Đã lưu vào sổ" : "Lưu vào sổ tay"}
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
          <h3><Lightbulb size={18} /> Study tip</h3>
          <p>
            Read the example aloud, then make one sentence about your own life.
          </p>
          <hr />
          <strong>{savedCount} từ đã lưu từ bài này</strong>
          <p>
            Từ đã lưu nằm trong Sổ tay. Bạn có thể mở lại từ bất kỳ trang học nào.
          </p>
          {notebookError && <p className="form-error" role="alert">{notebookError}</p>}
        </aside>
      </div>
      <SavedWordReview />
    </div>
  );
}

function GrammarPage() {
  const { submitExercise } = useDemo();
  const [answer, setAnswer] = useState("");
  const [result, setResult] = useState(false);
  const [score, setScore] = useState(0);
  return (
    <div className="content-page">
      <PageIntro
        eyebrow="GRAMMAR · BEGINNER"
        title="Present Simple"
        description="Use the present simple for habits and facts. The verb changes with he, she and it."
        icon="pencil"
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
              onClick={async () => {
                try {
                  const grade = await submitExercise("grammar-present-simple", { q1: [
                    "She study English every day.", "She studies English every day.", "She studying English every day.",
                  ].indexOf(answer) }, Number(answer === "She studies English every day."), 1);
                  setScore(grade.score);
                  setResult(true);
                } catch { /* The store displays the save error. */ }
              }}
            >
              Check answer <ArrowRight size={16} />
            </button>
          ) : (
            <ExerciseResult
              correct={score}
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
  const { submitExercise } = useDemo();
  const [answers, setAnswers] = useState<Record<number, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [correct, setCorrect] = useState(0);
  return (
    <div className="content-page">
      <PageIntro
        eyebrow="READING · FOUNDATION"
        title="City Gardens"
        description="Practice finding key details in a short, original passage."
        icon="book"
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
              onClick={async () => {
                try {
                  const grade = await submitExercise("reading-city-gardens", {
                    q1: answers[0], q2: answers[1], q3: answers[2],
                  }, readingQuestions.filter((q, i) => answers[i] === q.answer).length, readingQuestions.length);
                  setCorrect(grade.score);
                  setSubmitted(true);
                } catch { /* The store displays the save error. */ }
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
  const { submitExercise } = useDemo();
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState(1);
  const [answer, setAnswer] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const [score, setScore] = useState(0);
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
        icon="headphones"
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
              onClick={async () => {
                try {
                  const grade = await submitExercise("listening-daily-life", { q1: ["On Mondays", "On Wednesdays", "Every evening"].indexOf(answer) }, Number(answer === "On Wednesdays"), 1);
                  setScore(grade.score);
                  setSubmitted(true);
                } catch { /* The store displays the save error. */ }
              }}
            >
              Check answer
            </button>
          ) : (
            <ExerciseResult
              correct={score}
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
  const { draft, saveDraft, ready } = useDemo();
  const [text, setText] = useState(draft);
  const [saved, setSaved] = useState(false);
  useEffect(() => { if (ready) queueMicrotask(() => setText(draft)); }, [ready, draft]);
  const words = text.trim() ? text.trim().split(/\s+/).length : 0;
  return (
    <div className="content-page">
      <PageIntro
        eyebrow="WRITING · IELTS STARTER"
        title="Technology in daily life"
        description={demoMode ? "Write a short opinion paragraph. Your draft is stored in this browser." : "Write a short opinion paragraph. Your draft is saved to your account."}
        icon="pencil"
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
                ? demoMode ? "✓ Draft saved in this browser" : "✓ Draft saved to your account"
                : "Your draft has not been saved yet"}
            </span>
            <button
              className="button primary"
              onClick={async () => {
                try { await saveDraft(text); setSaved(true); }
                catch { setSaved(false); }
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
        icon="mic"
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
        description={demoMode ? "A snapshot of the activity saved in this browser." : "A snapshot of the activity saved to your account."}
        icon="chart"
      />
      <div className="progress-stat-grid">
        <div className="card">
          <HeadIcon icon={CircleCheck} tone="mint" />
          <strong>{completed}</strong>
          <small>Tasks completed</small>
        </div>
        <div className="card">
          <HeadIcon icon={Activity} tone="lavender" />
          <strong>{attempts.length}</strong>
          <small>Practice attempts</small>
        </div>
        <div className="card">
          <HeadIcon icon={Target} tone="coral" />
          <strong>{goal}</strong>
          <small>Daily task goal</small>
        </div>
        <div className="card">
          <HeadIcon icon={TrendingUp} tone="teal" />
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
        icon="bulb"
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
  if (section === "settings" || section === "profile") return <ProfilePage />;
  return (
    <UnavailablePage
      title={section.charAt(0).toUpperCase() + section.slice(1)}
    />
  );
}
