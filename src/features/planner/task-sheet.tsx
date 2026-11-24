"use client";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { BookOpenText, CalendarDays, Check, Flag, GraduationCap, Headphones, Languages, Newspaper, PenLine, Repeat, Search, SpellCheck, Trash2, X } from "lucide-react";
import { type Skill, type StudyTask, todayISO } from "@/lib/demo-data";
import { learnerSkillAvailable } from "@/lib/runtime";
import { addDay, dayLabel, inferSkill, mondayOf, seriesDates, weekdayOf, weekdayShort } from "@/lib/planner/core";
import { labIds, labInfo, lessonInfo, lessonSlug, type LessonKind } from "@/lib/planner/links";
import type { CatalogExam } from "@/lib/ielts-bank/catalog";
import type { CatalogEntry } from "@/lib/dictation-skill-lab/lessons";
import { fetchSkillLabCatalog } from "@/features/listening/skill-lab-catalog";
import { useDemo } from "@/features/demo/demo-store";
import { lessonOpen, plannerSkills, skillLabel, taskHref } from "./planner-widgets";

type Category = "exam" | "dictation" | "vocabulary" | "grammar" | "news" | "lab" | "translation" | "free";
const categories: { id: Category; label: string; icon: typeof BookOpenText; probe: string }[] = [
  { id: "exam", label: "Luyện đề", icon: BookOpenText, probe: "reading" },
  { id: "dictation", label: "Dictation", icon: Headphones, probe: "dictation" },
  { id: "vocabulary", label: "Từ vựng", icon: Languages, probe: "vocabulary-review" },
  { id: "grammar", label: "Grammar", icon: SpellCheck, probe: "grammar" },
  { id: "news", label: "Daily News", icon: Newspaper, probe: "news" },
  { id: "lab", label: "Lab tự học", icon: GraduationCap, probe: "lab:writing-task-2" },
  { id: "translation", label: "Luyện diễn đạt", icon: PenLine, probe: "translation" },
  { id: "free", label: "Việc tự do", icon: Check, probe: "" },
];
const examSkills = ["Reading", "Listening", "Writing", "Speaking"] as const;
const durations = [10, 15, 20, 30, 45, 60, 90];

type Choice = { lesson?: string; title: string; skill: Skill; duration: number };

/** The planner's one add/edit dialog. Adding starts from *what* to study, so the task links to it. */
export function TaskSheet({ task, defaultDate, onClose, onDone }: {
  task?: StudyTask; defaultDate: string; onClose: () => void; onDone?: (message: string) => void;
}) {
  const { tasks, addTask, addTasks, updateTask, deleteTask } = useDemo();
  const today = todayISO();
  const editing = Boolean(task);
  const [category, setCategory] = useState<Category | null>(task ? (task.lesson ? null : "free") : null);
  const [choice, setChoice] = useState<Choice | null>(task ? { lesson: task.lesson, title: task.title, skill: task.skill, duration: task.duration ?? lessonInfo(task.lesson)?.minutes ?? 20 } : null);
  const [title, setTitle] = useState(task?.title ?? "");
  const [skill, setSkill] = useState<Skill | null>(task?.skill ?? null);
  const [duration, setDuration] = useState<number>(task?.duration ?? lessonInfo(task?.lesson)?.minutes ?? 20);
  const [date, setDate] = useState(task?.date ?? defaultDate);
  const [withTime, setWithTime] = useState(Boolean(task?.time));
  const [time, setTime] = useState(task?.time || "19:00");
  const [high, setHigh] = useState(task?.priority === "High");
  const [repeat, setRepeat] = useState(false);
  const [weekdays, setWeekdays] = useState<number[]>([weekdayOf(defaultDate)]);
  const [weeks, setWeeks] = useState(4);
  const [wholeSeries, setWholeSeries] = useState(false);
  const [saving, setSaving] = useState(false);
  const [problem, setProblem] = useState("");
  const dialog = useRef<HTMLDivElement>(null);

  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  // Focus the first choice once on open; the parent re-rendering must not pull focus back here.
  useEffect(() => { dialog.current?.querySelector<HTMLElement>("[data-autofocus]")?.focus(); }, []);
  useEffect(() => {
    const node = dialog.current;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.preventDefault(); close.current(); return; }
      if (event.key !== "Tab" || !node) return;
      const items = [...node.querySelectorAll<HTMLElement>("button:not([disabled]), input, select, a[href]")].filter((item) => item.offsetParent !== null);
      if (!items.length) return;
      const first = items[0], last = items[items.length - 1];
      if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
      else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  function pick(next: Choice) {
    setChoice(next);
    setTitle(next.title);
    setSkill(next.skill);
    setDuration(next.duration);
  }
  function chooseCategory(next: Category) {
    setCategory(next);
    setChoice(null);
    setProblem("");
    if (next === "free") { setTitle(""); setSkill(null); setDuration(20); }
  }

  const dates = repeat && !editing ? seriesDates(date, weekdays, weeks) : [date];
  const resolvedSkill: Skill | null = skill ?? (title.trim() ? inferSkill(title) : null);
  const ready = Boolean(title.trim()) && Boolean(resolvedSkill) && (category === "free" || Boolean(choice) || editing);

  async function save() {
    if (!ready || saving) return;
    setSaving(true); setProblem("");
    const base = {
      title: title.trim().slice(0, 100), skill: resolvedSkill!, duration, time: withTime ? time : "",
      priority: (high ? "High" : task?.priority === "Low" ? "Low" : "Medium") as StudyTask["priority"],
    };
    try {
      if (task) {
        const shared = { title: base.title, skill: base.skill, duration: base.duration, time: base.time, priority: base.priority };
        await updateTask(task.id, { ...shared, date, ...(choice?.lesson !== task.lesson ? { lesson: choice?.lesson } : {}) });
        if (wholeSeries && task.seriesId) {
          for (const other of tasks.filter((item) => item.seriesId === task.seriesId && item.id !== task.id && !item.completed && item.date >= today)) {
            await updateTask(other.id, shared);
          }
        }
        onDone?.("Đã lưu thay đổi");
      } else {
        const seriesId = dates.length > 1 ? crypto.randomUUID() : undefined;
        const source = choice?.lesson ? lessonInfo(choice.lesson)?.source ?? "manual" : "manual";
        const drafts = dates.map((day) => ({ ...base, date: day, completed: false, lesson: choice?.lesson, source, seriesId }));
        if (drafts.length === 1) {
          const existing = tasks.find((item) => item.lesson && item.lesson === drafts[0].lesson && item.date === drafts[0].date && !item.completed);
          await addTask(drafts[0]);
          onDone?.(existing ? `Việc này đã có trong ${dayLabel(drafts[0].date, today).toLowerCase()}` : `Đã thêm vào ${dayLabel(drafts[0].date, today).toLowerCase()}`);
        } else {
          const made = await addTasks(drafts);
          onDone?.(`Đã thêm ${made.length} việc lặp lại`);
        }
      }
      onClose();
    } catch {
      setProblem("Chưa lưu được. Kiểm tra kết nối rồi thử lại.");
    } finally { setSaving(false); }
  }

  async function remove() {
    if (!task || saving) return;
    setSaving(true);
    try {
      const targets = wholeSeries && task.seriesId
        ? tasks.filter((item) => item.seriesId === task.seriesId && !item.completed && item.date >= today && item.id !== task.id) : [];
      for (const item of [task, ...targets]) await deleteTask(item.id);
      onDone?.(targets.length ? `Đã xoá ${targets.length + 1} việc trong chuỗi` : "Đã xoá việc");
      onClose();
    } catch { setProblem("Chưa xoá được. Thử lại sau ít phút."); }
    finally { setSaving(false); }
  }

  async function toggleDone() {
    if (!task) return;
    await updateTask(task.id, { completed: !task.completed }).catch(() => {});
    onClose();
  }

  const linked = choice?.lesson ? lessonInfo(choice.lesson) : null;
  const linkedHref = choice?.lesson ? taskHref(choice.lesson) : null;
  // Today, tomorrow and the rest of this week as one-tap chips; any other day comes from the date field.
  const sunday = addDay(mondayOf(today), 6);
  const dayChips = Array.from({ length: 7 }, (_, index) => addDay(today, index)).filter((day, index) => index < 2 || day <= sunday);

  return (
    <div className="modal-backdrop" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <div className="pl-sheet" role="dialog" aria-modal="true" aria-labelledby="pl-sheet-title" ref={dialog}>
        <header className="pl-sheet-head">
          <div>
            <h2 id="pl-sheet-title">{editing ? "Sửa việc" : "Thêm việc vào kế hoạch"}</h2>
            <p>{editing ? "Đổi tên, ngày hoặc thời lượng. Việc có liên kết sẽ tự đánh dấu xong khi bạn học xong." : "Chọn thứ bạn muốn học để việc mở đúng bài và tự đánh dấu xong khi học xong."}</p>
          </div>
          <button type="button" className="icon-button" onClick={onClose} aria-label="Đóng"><X size={20} /></button>
        </header>

        <div className="pl-sheet-body">
          {!editing && <section className="pl-field">
            <span className="pl-label" id="pl-cat-label">1. Học gì?</span>
            <div className="pl-chips" role="group" aria-labelledby="pl-cat-label">
              {categories.filter((item) => item.id === "free" || lessonOpen(item.probe) || (item.id === "lab" && labIds.some((id) => lessonOpen(`lab:${id}`)))).map(({ id, label, icon: Icon }, index) => (
                <button key={id} type="button" className={`pl-chip${category === id ? " is-on" : ""}`} aria-pressed={category === id} onClick={() => chooseCategory(id)} data-autofocus={index === 0 ? "" : undefined}>
                  <Icon size={15} aria-hidden="true" /> {label}
                </button>
              ))}
            </div>
          </section>}

          {!editing && category && category !== "free" && <section className="pl-field">
            <span className="pl-label">2. Chọn bài</span>
            <Picker category={category} choice={choice} onPick={pick} />
          </section>}

          {editing && linked && <p className="pl-linked">Liên kết: <b>{linked.label}</b>{linkedHref && <> · <Link href={linkedHref}>Mở bài</Link></>}</p>}

          {(editing || category === "free" || choice) && <>
            <label className="pl-field">
              <span className="pl-label">{editing ? "Tên việc" : category === "free" ? "2. Tên việc" : "3. Tên việc"}</span>
              <input value={title} maxLength={100} required onChange={(event) => setTitle(event.target.value)} placeholder="VD: Ôn lại 20 từ chủ đề Environment" data-autofocus={editing || category === "free" ? "" : undefined} />
            </label>

            {(category === "free" || (editing && !task?.lesson)) && <section className="pl-field">
              <span className="pl-label" id="pl-skill-label">Kỹ năng</span>
              <div className="pl-chips" role="group" aria-labelledby="pl-skill-label">
                {plannerSkills.map((item) => <button key={item} type="button" className={`pl-chip${resolvedSkill === item ? " is-on" : ""}`} aria-pressed={resolvedSkill === item} onClick={() => setSkill(item)}>{skillLabel(item)}</button>)}
              </div>
              {!skill && resolvedSkill && title.trim() && <small className="pl-hint">Đoán theo tên việc: {skillLabel(resolvedSkill)}. Bấm để đổi.</small>}
            </section>}

            <section className="pl-field">
              <span className="pl-label" id="pl-duration-label">Thời lượng</span>
              <div className="pl-chips" role="group" aria-labelledby="pl-duration-label">
                {durations.map((value) => <button key={value} type="button" className={`pl-chip${duration === value ? " is-on" : ""}`} aria-pressed={duration === value} onClick={() => setDuration(value)}>{value} phút</button>)}
              </div>
            </section>

            <section className="pl-field">
              <span className="pl-label" id="pl-date-label">Ngày</span>
              <div className="pl-chips" role="group" aria-labelledby="pl-date-label">
                {dayChips.map((day) => <button key={day} type="button" className={`pl-chip${date === day ? " is-on" : ""}`} aria-pressed={date === day} onClick={() => setDate(day)}>{dayLabel(day, today)}</button>)}
                <label className="pl-date-input"><CalendarDays size={15} aria-hidden="true" /><span className="sr-only">Chọn ngày khác</span>
                  <input type="date" lang="vi" value={date} min={editing ? undefined : today} onChange={(event) => event.target.value && setDate(event.target.value)} />
                </label>
              </div>
              <small className="pl-hint">{dayLabel(date, today)}</small>
            </section>

            {!editing && <section className="pl-field">
              <label className="pl-toggle"><input type="checkbox" checked={repeat} onChange={(event) => { setRepeat(event.target.checked); if (event.target.checked) setWeekdays([weekdayOf(date)]); }} /><Repeat size={15} aria-hidden="true" /> Lặp lại hằng tuần</label>
              {repeat && <div className="pl-repeat">
                <div className="pl-chips" role="group" aria-label="Các ngày lặp lại">
                  {weekdayShort.map((label, index) => <button key={label} type="button" className={`pl-chip pl-day-chip${weekdays.includes(index + 1) ? " is-on" : ""}`} aria-pressed={weekdays.includes(index + 1)} onClick={() => setWeekdays((current) => current.includes(index + 1) ? current.filter((value) => value !== index + 1) : [...current, index + 1])}>{label}</button>)}
                </div>
                <label className="pl-inline">Trong <select value={weeks} onChange={(event) => setWeeks(Number(event.target.value))}>{[1, 2, 3, 4, 6, 8].map((value) => <option key={value} value={value}>{value} tuần</option>)}</select></label>
                <small className="pl-hint">Tạo {dates.length} việc, từ {dayLabel(dates[0], today).toLowerCase()} tới {dayLabel(dates[dates.length - 1], today).toLowerCase()}.</small>
              </div>}
            </section>}

            <section className="pl-field pl-row-fields">
              <label className="pl-toggle"><input type="checkbox" checked={withTime} onChange={(event) => setWithTime(event.target.checked)} /> Đặt giờ</label>
              {withTime && <input type="time" value={time} onChange={(event) => setTime(event.target.value)} aria-label="Giờ học" />}
              <button type="button" className={`pl-chip pl-flag-chip${high ? " is-on" : ""}`} aria-pressed={high} onClick={() => setHigh(!high)}><Flag size={14} aria-hidden="true" /> Ưu tiên cao</button>
            </section>

            {editing && task?.seriesId && <label className="pl-toggle"><input type="checkbox" checked={wholeSeries} onChange={(event) => setWholeSeries(event.target.checked)} /> Áp dụng cho các việc chưa xong cùng chuỗi lặp lại</label>}
          </>}
          {problem && <p className="pl-problem" role="alert">{problem}</p>}
        </div>

        <footer className="pl-sheet-foot">
          {editing && <button type="button" className="button subtle is-danger" onClick={() => void remove()} disabled={saving}><Trash2 size={16} /> Xoá</button>}
          {editing && <button type="button" className="button subtle" onClick={() => void toggleDone()}><Check size={16} /> {task?.completed ? "Bỏ đánh dấu xong" : "Đánh dấu xong"}</button>}
          <span className="pl-spacer" />
          <button type="button" className="button subtle" onClick={onClose}>Huỷ</button>
          <button type="button" className="button primary" onClick={() => void save()} disabled={!ready || saving}>
            {saving ? "Đang lưu…" : editing ? "Lưu thay đổi" : dates.length > 1 ? `Thêm ${dates.length} việc` : "Thêm việc"}
          </button>
        </footer>
      </div>
    </div>
  );
}

/** Second step of adding: the concrete lesson, test or habit for the chosen category. */
function Picker({ category, choice, onPick }: { category: Exclude<Category, "free">; choice: Choice | null; onPick: (choice: Choice) => void }) {
  const option = (lesson: string, title: string, note?: string, durationOverride?: number) => {
    const info = lessonInfo(lesson);
    if (!info || !lessonOpen(lesson)) return null;
    const selected = choice?.lesson === lesson;
    return <button key={lesson} type="button" className={`pl-option${selected ? " is-on" : ""}`} aria-pressed={selected}
      onClick={() => onPick({ lesson, title, skill: info.skill, duration: durationOverride ?? info.minutes })}>
      <b>{title}</b>{note && <small>{note}</small>}
    </button>;
  };
  if (category === "exam") return <ExamPicker choice={choice} onPick={onPick} />;
  if (category === "dictation") return <DictationPicker choice={choice} onPick={onPick} />;
  if (category === "vocabulary") return <div className="pl-options">
    {option("vocabulary-review", "Ôn từ đến hạn", "Tự đánh dấu xong khi ôn hết từ tới lịch")}
    {option("vocabulary-study", "Học từ mới", "Tự đánh dấu xong khi bạn lưu từ mới đầu tiên")}
  </div>;
  if (category === "grammar") return <div className="pl-options">
    {option("grammar", "Grammar theo lộ trình", "Tự đánh dấu xong khi bạn làm bài Grammar")}
    {option("grammar-review", "Ôn tập & Sổ lỗi Grammar", "Tự đánh dấu xong khi bạn làm bài Grammar")}
  </div>;
  if (category === "news") return <div className="pl-options">
    {option("news", "Đọc 1 bài Daily News + quiz", "Tự đánh dấu xong khi bạn nộp quiz")}
  </div>;
  if (category === "translation") return <div className="pl-options">
    {option("translation", "Luyện diễn đạt 15 phút", "Đánh dấu xong bằng tay")}
  </div>;
  return <div className="pl-options">
    {labIds.map((id) => option(lessonSlug("lab", id), labInfo(id)!.label, "Mở Lab ở bài bạn đang học · đánh dấu xong bằng tay"))}
  </div>;
}

function ExamPicker({ choice, onPick }: { choice: Choice | null; onPick: (choice: Choice) => void }) {
  const skills = examSkills.filter((skill) => learnerSkillAvailable(skill) && lessonOpen(skill.toLowerCase()));
  const [skill, setSkill] = useState<(typeof examSkills)[number]>(skills[0] ?? "Reading");
  const [specific, setSpecific] = useState(false);
  const [exams, setExams] = useState<Record<string, CatalogExam[] | "error">>({});
  const [query, setQuery] = useState("");
  const list = exams[skill];
  useEffect(() => {
    if (!specific || list) return;
    let active = true;
    fetch(`/api/ielts/bank/catalog?skill=${skill}`).then((response) => response.ok ? response.json() as Promise<{ exams: CatalogExam[] }> : Promise.reject(new Error("catalog")))
      .then(({ exams: found }) => { if (active) setExams((current) => ({ ...current, [skill]: found })); })
      .catch(() => { if (active) setExams((current) => ({ ...current, [skill]: "error" })); });
    return () => { active = false; };
  }, [specific, skill, list]);
  const generic = lessonSlug(skill.toLowerCase() as LessonKind);
  const anyTitle = (value: (typeof examSkills)[number]) => `${value} · ${value === "Reading" ? "1 passage" : value === "Listening" ? "1 section" : value === "Writing" ? "1 bài viết" : "1 lượt luyện nói"}`;
  function pickAny(value: (typeof examSkills)[number]) {
    const lesson = lessonSlug(value.toLowerCase() as LessonKind);
    onPick({ lesson, title: anyTitle(value), skill: value, duration: lessonInfo(lesson)?.minutes ?? 20 });
  }
  const filtered = useMemo(() => Array.isArray(list) ? list.filter((exam) => exam.title.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 40) : [], [list, query]);
  if (!skills.length) return <p className="pl-hint">Ngân hàng đề chưa mở cho tài khoản này.</p>;
  return <div className="pl-picker">
    <div className="pl-chips" role="group" aria-label="Kỹ năng">
      {skills.map((item) => <button key={item} type="button" className={`pl-chip${skill === item ? " is-on" : ""}`} aria-pressed={skill === item} onClick={() => { setSkill(item); if (!specific) pickAny(item); }}>{item}</button>)}
    </div>
    <div className="pl-options">
      <button type="button" className={`pl-option${!specific && choice?.lesson === generic ? " is-on" : ""}`} aria-pressed={!specific && choice?.lesson === generic}
        onClick={() => { setSpecific(false); pickAny(skill); }}>
        <b>Bài bất kỳ</b><small>Chọn bài khi vào luyện · tự đánh dấu xong khi nộp một bài {skill}</small>
      </button>
      <button type="button" className={`pl-option${specific ? " is-on" : ""}`} aria-pressed={specific} onClick={() => setSpecific(true)}>
        <b>Chọn đề cụ thể</b><small>Tìm trong Ngân hàng đề · tự đánh dấu xong khi nộp đúng đề này</small>
      </button>
    </div>
    {specific && <div className="pl-search">
      <label className="pl-search-box"><Search size={15} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={`Tìm đề ${skill}…`} aria-label={`Tìm đề ${skill}`} /></label>
      {list === "error" ? <p className="pl-hint">Không tải được danh sách đề. Bạn vẫn có thể chọn “Bài bất kỳ”.</p>
        : !list ? <p className="pl-hint">Đang tải danh sách đề…</p>
        : filtered.length ? <div className="pl-results">{filtered.map((exam) => {
          const lesson = lessonSlug("ielts", exam.id);
          return <button key={exam.id} type="button" className={`pl-result${choice?.lesson === lesson ? " is-on" : ""}`} aria-pressed={choice?.lesson === lesson}
            onClick={() => onPick({ lesson, title: exam.title.slice(0, 100), skill: exam.skill as Skill, duration: Math.max(5, Math.min(240, exam.duration_minutes || 20)) })}>
            <span>{exam.title}</span><small>{exam.practice_type === "full_test" ? "Full đề" : "Bài lẻ"} · {exam.duration_minutes} phút</small>
          </button>;
        })}</div> : <p className="pl-hint">Không có đề nào khớp “{query}”.</p>}
    </div>}
  </div>;
}

function DictationPicker({ choice, onPick }: { choice: Choice | null; onPick: (choice: Choice) => void }) {
  const [lessons, setLessons] = useState<CatalogEntry[] | "error" | null>(null);
  const [query, setQuery] = useState("");
  const [specific, setSpecific] = useState(false);
  useEffect(() => {
    if (!specific || lessons) return;
    let active = true;
    fetchSkillLabCatalog().then((found) => { if (active) setLessons(found.filter((lesson) => lesson.audio_ready)); }).catch(() => { if (active) setLessons("error"); });
    return () => { active = false; };
  }, [specific, lessons]);
  const filtered = Array.isArray(lessons) ? lessons.filter((lesson) => `${lesson.title} ${lesson.topic}`.toLowerCase().includes(query.trim().toLowerCase())).slice(0, 40) : [];
  return <div className="pl-picker">
    <div className="pl-options">
      <button type="button" className={`pl-option${!specific && choice?.lesson === "dictation" ? " is-on" : ""}`} aria-pressed={!specific && choice?.lesson === "dictation"}
        onClick={() => { setSpecific(false); onPick({ lesson: "dictation", title: "Dictation 15 phút", skill: "Listening", duration: 15 }); }}>
        <b>Dictation 15 phút</b><small>Học tiếp bài đang dở · tự đánh dấu xong khi bạn chép câu đầu tiên trong ngày</small>
      </button>
      <button type="button" className={`pl-option${specific ? " is-on" : ""}`} aria-pressed={specific} onClick={() => setSpecific(true)}>
        <b>Chọn một bài cụ thể</b><small>Tự đánh dấu xong khi bạn làm hết bài đó</small>
      </button>
    </div>
    {specific && <div className="pl-search">
      <label className="pl-search-box"><Search size={15} aria-hidden="true" /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Tìm bài Dictation…" aria-label="Tìm bài Dictation" /></label>
      {lessons === "error" ? <p className="pl-hint">Không tải được danh sách bài.</p>
        : !lessons ? <p className="pl-hint">Đang tải danh sách bài…</p>
        : <div className="pl-results">{filtered.map((lesson) => {
          const slug = lessonSlug("dictation", lesson.lesson_id);
          const minutes = Math.max(10, Math.min(60, Math.round((lesson.duration_ms / 60000) * 4 / 5) * 5 || 15));
          return <button key={lesson.lesson_id} type="button" className={`pl-result${choice?.lesson === slug ? " is-on" : ""}`} aria-pressed={choice?.lesson === slug}
            onClick={() => onPick({ lesson: slug, title: `Dictation · ${lesson.title}`.slice(0, 100), skill: "Listening", duration: minutes })}>
            <span>{lesson.title}</span><small>{lesson.topic} · {lesson.level}</small>
          </button>;
        })}</div>}
    </div>}
  </div>;
}
