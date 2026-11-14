"use client";
import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { Check, ChevronDown, ChevronRight, Search } from "lucide-react";
import type { CatalogExam } from "@/lib/ielts-bank/catalog";
import { speakingCardTitle, speakingParts } from "./bank-writing-library";

type Row = { id: string; exam_id: string; answered?: string[]; notes?: Record<string, string> | null };
type Shelf = { exams: CatalogExam[]; spoken: Map<string, Set<string>> };

let cached: Promise<Shelf> | null = null;
/** The Speaking shelf and what the learner has spoken, loaded once per page when the picker first opens. */
function loadShelf() {
  cached ??= Promise.all([
    fetch("/api/ielts/bank/catalog?skill=Speaking", { cache: "no-store" }).then(async (response) => response.ok ? ((await response.json()).exams ?? []) as CatalogExam[] : []),
    fetch("/api/ielts/bank/attempt?skill=Speaking").then(async (response) => response.ok ? ((await response.json()).attempts ?? []) as Row[] : []).catch(() => [] as Row[]),
  ]).then(([exams, attempts]) => {
    const spoken = new Map<string, Set<string>>();
    for (const attempt of attempts) {
      const ids = spoken.get(attempt.exam_id) ?? new Set<string>();
      for (const id of [...(attempt.answered ?? []), ...(attempt.notes?.__spoken ?? "").split(",")]) if (id) ids.add(id);
      spoken.set(attempt.exam_id, ids);
    }
    return { exams, spoken };
  }).catch((error) => { cached = null; throw error; });
  return cached;
}

/**
 * The room's breadcrumb, "Part 1 / Hometown ▾", which opens a three-column
 * picker: the part, its topics with how many questions the learner has spoken,
 * and the chosen topic's questions. Picking a question moves the room there.
 */
export function SpeakingPicker({ examId, examTitle, practiceType, currentId, spokenHere }: { examId: string; examTitle: string; practiceType?: string; currentId?: string; spokenHere: Set<string> }) {
  const [open, setOpen] = useState(false);
  const [shelf, setShelf] = useState<Shelf | null>(null);
  const [failed, setFailed] = useState(false);
  const [part, setPart] = useState(practiceType && speakingParts.some((item) => item.id === practiceType) ? practiceType : "part1");
  const [topicId, setTopicId] = useState(examId);
  const [filter, setFilter] = useState("");
  const box = useRef<HTMLDivElement>(null);
  const current = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    let live = true;
    void loadShelf().then((value) => { if (live) setShelf(value); }, () => { if (live) setFailed(true); });
    const close = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { live = false; document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [open]);
  // Bring the set being practised into view when the list arrives.
  useEffect(() => { if (open && shelf) current.current?.scrollIntoView({ block: "nearest" }); }, [open, shelf]);

  const spokenIn = (exam: CatalogExam) => {
    const ids = exam.id === examId ? new Set([...(shelf?.spoken.get(exam.id) ?? []), ...spokenHere]) : shelf?.spoken.get(exam.id);
    return (exam.questions ?? []).filter((question) => ids?.has(question.id)).length;
  };
  const partCounts = useMemo(() => new Map(speakingParts.map((item) => [item.id, shelf?.exams.filter((exam) => exam.practice_type === item.id).length ?? 0])), [shelf]);
  const needle = filter.trim().toLocaleLowerCase();
  const topics = (shelf?.exams ?? []).filter((exam) => exam.practice_type === part && (!needle || `${exam.title} ${(exam.questions ?? []).map((question) => question.prompt).join(" ")}`.toLocaleLowerCase().includes(needle)));
  const topic = shelf?.exams.find((exam) => exam.id === topicId) ?? topics[0];
  const partLabel = speakingParts.find((item) => item.id === practiceType)?.badge ?? "Speaking";

  return <div ref={box} className={`sp-picker ${open ? "is-open" : ""}`}>
    <button type="button" className="sp-crumb" aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}>
      <span>{partLabel}</span><i>/</i><b>{speakingCardTitle({ title: examTitle })}</b><ChevronDown size={15} />
    </button>
    {open && <div className="sp-pop" role="dialog" aria-label="Chọn câu hỏi Speaking">
      <section className="sp-col sp-parts" aria-label="Part">
        <h4>Part</h4>
        {speakingParts.map((item) => <button type="button" key={item.id} aria-pressed={part === item.id} onClick={() => { setPart(item.id); setTopicId(""); }}>
          <span>{item.label}</span><small>{shelf ? partCounts.get(item.id) : "…"}</small><ChevronRight size={14} />
        </button>)}
      </section>
      <section className="sp-col sp-topics" aria-label="Chủ đề">
        <h4>Chủ đề</h4>
        <label className="sp-filter"><Search size={14} /><input value={filter} onChange={(event) => setFilter(event.target.value)} placeholder="Tìm chủ đề…" aria-label="Tìm chủ đề" /></label>
        <div className="sp-scroll">
          {!shelf && !failed && <p className="sp-state">Đang tải…</p>}
          {failed && <p className="sp-state">Chưa tải được danh sách đề.</p>}
          {shelf && !topics.length && <p className="sp-state">Không có chủ đề phù hợp.</p>}
          {topics.map((exam) => {
            const total = exam.practice_type === "part2" ? 0 : exam.questions?.length ?? 0;
            const said = total ? spokenIn(exam) : 0;
            const chosen = topic?.id === exam.id;
            return <button type="button" key={exam.id} ref={exam.id === examId ? current : undefined} aria-pressed={chosen} className={exam.id === examId ? "is-here" : ""} onClick={() => setTopicId(exam.id)}>
              <span>{speakingCardTitle(exam)}</span>{total ? <small className={said === total ? "is-done" : ""}>{said}/{total}</small> : null}<ChevronRight size={14} />
            </button>;
          })}
        </div>
      </section>
      <section className="sp-col sp-questions" aria-label="Câu hỏi">
        <h4>{topic ? speakingCardTitle(topic) : "Câu hỏi"}</h4>
        <div className="sp-scroll">
          {topic && (topic.practice_type === "part2"
            ? <Link href={`/app/question-bank/exam/${topic.id}`} className={topic.id === examId ? "is-current" : ""} onClick={() => setOpen(false)}>{topic.questions?.[0]?.prompt ?? topic.prompt_preview ?? speakingCardTitle(topic)}</Link>
            : (topic.questions ?? []).map((question) => {
              const said = topic.id === examId ? spokenHere.has(question.id) || shelf?.spoken.get(topic.id)?.has(question.id) : shelf?.spoken.get(topic.id)?.has(question.id);
              return <Link key={question.id} href={`/app/question-bank/exam/${topic.id}?q=${encodeURIComponent(question.id)}`} scroll={false} replace={topic.id === examId}
                className={`${topic.id === examId && question.id === currentId ? "is-current" : ""} ${said ? "is-said" : ""}`} onClick={() => setOpen(false)}>
                {said ? <Check size={13} /> : <i />}<span>{question.prompt}</span>
              </Link>;
            }))}
        </div>
      </section>
    </div>}
  </div>;
}
