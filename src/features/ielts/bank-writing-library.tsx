"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, CheckCircle2, ChevronDown, Clock3, FileText, Filter, Mail, NotebookPen, PenLine, Search, Sparkles, Target, X } from "lucide-react";
import { TopicArt } from "@/components/illustrations/topic-art";
import { catalogGroups, type CatalogExam } from "@/lib/ielts-bank/catalog";
import { displayExamTitle } from "@/lib/ielts-bank/display-title";
import { Pager, VisualThumb, artTopic, sourceLabel, writingKind, writingKinds, type Attempt, type LibraryViewProps } from "./bank-library";
import "./bank-writing-library.css";

type Option = { id: string; label: string; test: RegExp };

/** Task 2 question types, matched first on the title prefix and then on the prompt wording. */
const essayTypes: Option[] = [
  { id: "positive", label: "Positive or Negative Development", test: /positive\s+(?:or\s+)?negative/i },
  { id: "discussion", label: "Discussion", test: /\bdiscussion\b|discuss both/i },
  { id: "advantages", label: "Advantages and Disadvantages", test: /advantages?\s+(?:and\s+)?disadvantages?|adv\s+disadv|outweigh|drawbacks?/i },
  { id: "problem", label: "Causes, Problems and Solutions", test: /problems?\s+(?:and\s+)?solutions?|\bcauses?\b|measures? (?:could|should|can)|solve (?:this|these)/i },
  { id: "opinion", label: "Agree or Disagree", test: /agree|disagree|\bopinion\b|to what extent/i },
  { id: "two_part", label: "Two-Part Question", test: /two\s*part|direct\s+question/i },
];

const letterTones: Option[] = [
  { id: "semi", label: "Semi-formal", test: /semi[\s-]?formal/i },
  { id: "informal", label: "Informal", test: /\binformal\b|dear (?:mum|dad|[A-Z][a-z]+,)/i },
  { id: "formal", label: "Formal", test: /\bformal\b|dear sir|dear madam|to whom it may concern/i },
];

/** Broad Task 2 themes, the way learners search for essay topics. */
const essayTopics: Option[] = [
  { id: "education", label: "Education", test: /educat|school|universit|student|teacher|\blearn|\bstud(?:y|ies)\b|curricul|homework/i },
  { id: "environment", label: "Environment", test: /environment|climate|pollut|\benergy|recycl|\bwaste|wildlife|plastic|carbon|global warming|natur/i },
  { id: "work", label: "Work and Careers", test: /\bwork|\bjobs?\b|career|employ|office|salar|workplace|retire/i },
  { id: "government", label: "Government & Crime", test: /government|crime|criminal|prison|\blaws?\b|police|\btax|politic|punish/i },
  { id: "technology", label: "Science and Technology", test: /technolog|internet|computer|scien|robot|phone|online|digital|artificial|social media/i },
  { id: "health", label: "Health", test: /health|medic|disease|obes|\bdiet|\bfood|exercise|\bsports?\b|hospital|doctor|fitness/i },
  { id: "media", label: "Media & Entertainment", test: /\bmedia|advert|television|\btv\b|\bfilms?\b|\bmusic|\barts?\b|\bnews|entertain|celebrit|\bgames?\b|museum/i },
  { id: "society", label: "Society and Culture", test: /societ|cultur|famil|child|parent|elderly|tradition|communit|\bcit(?:y|ies)\b|urban|housing|language|generation/i },
  { id: "economy", label: "Economics", test: /econom|money|globali|\btrade|consum|shopping|wealth|poverty|\bincome|business/i },
  { id: "travel", label: "Travel and Transportation", test: /travel|transport|traffic|\bcars?\b|touris|flight|commut|vehicle|\broads?\b|abroad/i },
];
const otherOption = { id: "other", label: "Chủ đề khác" };

const taskMeta: Record<string, { short: string; minimum: number; kindTitle: string; icon: typeof NotebookPen }> = {
  task1_academic: { short: "Task 1 · Academic", minimum: 150, kindTitle: "Dạng biểu đồ", icon: FileText },
  task1_general: { short: "Task 1 · General", minimum: 150, kindTitle: "Giọng văn thư", icon: Mail },
  task2: { short: "Task 2 · Essay", minimum: 250, kindTitle: "Dạng đề", icon: PenLine },
};

const firstMatch = (options: Option[], ...texts: (string | null | undefined)[]) => {
  for (const text of texts) {
    if (!text) continue;
    const found = options.find((option) => option.test.test(text));
    if (found) return found;
  }
  return undefined;
};

/** The title without "Writing Task 2:" and the type words the badges already show. */
function cleanTitle(exam: CatalogExam) {
  const title = displayExamTitle(exam.title)
    .replace(/^IELTS\s+/i, "")
    .replace(/^(?:Academic\s+|General\s+(?:Training\s+)?)?Writing\s+Task\s*[12]\s*(?:·\s*\w+\s*)?[:–-]\s*/i, "")
    .replace(/^(?:Advantages\s+Disadvantages|Adv\s+Disadv|Two\s+Part|Opinion|Discussion|Problem\s+Solution|Positive\s+Negative|Direct\s+Question|Agree\s+Disagree)\s+(?=\S)/i, "")
    .replace(/^(?:Semi[\s-]?Formal|Informal|Formal)\s+(?=\S)/i, "")
    .replace(/^(?:Line(?:\s+Graph)?|Bar(?:\s+Chart)?|Pie(?:\s+Chart)?|Table|Mixed|Map|Process|Diagram)\s+(?=\S+\s+\S)/i, "")
    .trim();
  return title || displayExamTitle(exam.title);
}

/** What a Writing exam is, for the filters and the card: kind (visual, letter tone or essay type) and theme. */
export function writingFacets(exam: CatalogExam) {
  const titleType = exam.title.replace(/^.*?Task\s*[12]\s*[:–-]\s*/i, "").split(/\s+/).slice(0, 3).join(" ");
  if (exam.practice_type === "task2") {
    const type = firstMatch(essayTypes, titleType, exam.prompt_preview) ?? (/\?[^?]+\?/.test(exam.prompt_preview ?? "") ? essayTypes.find((item) => item.id === "two_part") : undefined);
    const topic = firstMatch(essayTopics, (exam.topic ?? "").replace(/^topic_/, "").replace(/_/g, " "), cleanTitle(exam), exam.prompt_preview);
    return { kind: type?.id ?? "other", kindLabel: type?.label ?? "Dạng khác", topic: topic?.id ?? otherOption.id, topicLabel: topic?.label ?? otherOption.label };
  }
  if (exam.practice_type === "task1_general") {
    const tone = firstMatch(letterTones, titleType, exam.prompt_preview);
    return { kind: tone?.id ?? "other", kindLabel: tone ? `Thư ${tone.label}` : "Thư", topic: "", topicLabel: "" };
  }
  const kind = writingKind(exam);
  return { kind, kindLabel: writingKinds[kind], topic: "", topicLabel: "" };
}

/** Band from the AI feedback stored on a submitted attempt, if it was graded. */
function gradedBand(attempt?: Attempt) {
  const raw = attempt?.notes?.__ai_feedback;
  if (!raw) return null;
  try { const overall = Number(JSON.parse(raw).overall); return Number.isFinite(overall) ? overall : null; } catch { return null; }
}

const statusTabs = [
  { id: "all", label: "Tất cả" },
  { id: "todo", label: "Chưa làm" },
  { id: "doing", label: "Đang viết" },
  { id: "done", label: "Đã nộp" },
] as const;
type Status = (typeof statusTabs)[number]["id"];

/**
 * Writing question bank laid out like an exam-prep library: a filter column
 * (task, visual or essay type, theme, source) beside a two-column shelf of task
 * cards. Hovering a card shows the whole question and the button to start writing.
 */
export function WritingLibrary({ exams, attempts, loading, error }: Omit<LibraryViewProps, "skill">) {
  const params = useSearchParams();
  const groups = catalogGroups.Writing;
  const counts = new Map(groups.map((group) => [group.id, exams.filter((exam) => exam.practice_type === group.id).length]));
  const requested = params.get("type") ?? "";
  const type = groups.some((group) => group.id === requested) ? requested : groups.find((group) => counts.get(group.id))?.id ?? groups[0].id;
  // Filters belong to one task: switching task starts them afresh.
  return <WritingShelf key={type} type={type} exams={exams} attempts={attempts} loading={loading} error={error} counts={counts} />;
}

function WritingShelf({ type, exams, attempts, loading, error, counts }: Omit<LibraryViewProps, "skill"> & { type: string; counts: Map<string, number> }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const [kinds, setKinds] = useState<string[]>([]);
  const [topics, setTopics] = useState<string[]>([]);
  const [sources, setSources] = useState<string[]>([]);
  const [status, setStatus] = useState<Status>("all");
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const meta = taskMeta[type] ?? taskMeta.task2;
  const groups = catalogGroups.Writing;

  const latest = useMemo(() => {
    const byExam = new Map<string, Attempt>();
    for (const attempt of attempts) if (!byExam.has(attempt.exam_id)) byExam.set(attempt.exam_id, attempt);
    return byExam;
  }, [attempts]);
  const items = useMemo(() => exams.filter((exam) => exam.practice_type === type).map((exam) => ({ exam, facets: writingFacets(exam), title: cleanTitle(exam), source: sourceLabel(exam) })), [exams, type]);

  const tally = (pick: (item: (typeof items)[number]) => string) => {
    const found = new Map<string, number>();
    for (const item of items) { const id = pick(item); if (id) found.set(id, (found.get(id) ?? 0) + 1); }
    return found;
  };
  const kindCounts = tally((item) => item.facets.kind);
  const kindCatalog = type === "task2" ? essayTypes : type === "task1_general" ? letterTones.map((tone) => ({ ...tone, label: `Thư ${tone.label}` })) : Object.entries(writingKinds).filter(([id]) => !["letter", "essay"].includes(id)).map(([id, label]) => ({ id, label }));
  const kindOptions = [...kindCatalog, { id: "other", label: type === "task2" ? "Dạng khác" : "Khác" }].filter((option) => kindCounts.has(option.id)).map((option) => ({ id: option.id, label: option.label, count: kindCounts.get(option.id)! }));
  const topicCounts = tally((item) => item.facets.topic);
  const topicOptions = [...essayTopics, otherOption].filter((option) => topicCounts.has(option.id)).map((option) => ({ id: option.id, label: option.label, count: topicCounts.get(option.id)! }));
  const sourceCounts = tally((item) => item.source);
  const sourceOptions = [...sourceCounts.entries()].sort(([a], [b]) => a.localeCompare(b, "vi")).map(([id, count]) => ({ id, label: id, count }));

  const stateOf = (examId: string): Status => {
    const attempt = latest.get(examId);
    return !attempt ? "todo" : attempt.state === "in_progress" ? "doing" : "done";
  };
  const needle = query.trim().toLocaleLowerCase();
  const filtered = items.filter((item) => (!kinds.length || kinds.includes(item.facets.kind))
    && (!topics.length || topics.includes(item.facets.topic))
    && (!sources.length || sources.includes(item.source))
    && (status === "all" || stateOf(item.exam.id) === status)
    && (!needle || `${item.exam.title} ${item.exam.topic ?? ""} ${item.exam.prompt_preview ?? ""}`.toLocaleLowerCase().includes(needle)));
  const pageSize = 20;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const graded = attempts.filter((attempt) => gradedBand(attempt) !== null && items.some((item) => item.exam.id === attempt.exam_id)).length;

  const toggle = (list: string[], set: (value: string[]) => void, value: string) => { set(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]); setPage(0); };
  const clearAll = () => { setKinds([]); setTopics([]); setSources([]); setQuery(""); setStatus("all"); setPage(0); };
  const chooseType = (next: string) => {
    const search = new URLSearchParams(params);
    search.set("type", next);
    router.replace(`${pathname}?${search}`, { scroll: false });
  };
  const chips = [
    ...kinds.map((id) => ({ key: `k:${id}`, label: kindOptions.find((item) => item.id === id)?.label ?? id, clear: () => toggle(kinds, setKinds, id) })),
    ...topics.map((id) => ({ key: `t:${id}`, label: topicOptions.find((item) => item.id === id)?.label ?? id, clear: () => toggle(topics, setTopics, id) })),
    ...sources.map((id) => ({ key: `s:${id}`, label: id, clear: () => toggle(sources, setSources, id) })),
  ];

  return <section id="ngan-hang-de" className="bl-library bl-tone-writing wl-library" aria-label="Ngân hàng đề Writing">
    <aside className="wl-side" aria-label="Bộ lọc đề Writing">
      <div className="wl-side-head"><span><Filter size={16} /> Bộ lọc đề</span>{chips.length > 0 && <button type="button" onClick={clearAll}>Xóa lọc</button>}</div>
      <div className="wl-side-card is-active">
        <strong><NotebookPen size={17} /> Writing · Bài lẻ</strong>
        <div className="wl-tasks" role="radiogroup" aria-label="Chọn Task">
          {groups.map((group) => {
            const Icon = taskMeta[group.id]?.icon ?? PenLine;
            return <button type="button" role="radio" key={group.id} aria-checked={type === group.id} disabled={!counts.get(group.id)} onClick={() => chooseType(group.id)}>
              <i aria-hidden="true" /><Icon size={15} /><span>{group.label}</span><small>{counts.get(group.id) || 0}</small>
            </button>;
          })}
        </div>
      </div>
      {kindOptions.length > 1 && <FilterGroup title={meta.kindTitle} count={kinds.length}>
        {kindOptions.map((option) => <FilterCheck key={option.id} checked={kinds.includes(option.id)} onChange={() => toggle(kinds, setKinds, option.id)} label={option.label} count={option.count} icon={type === "task1_academic" ? <KindIcon kind={option.id} /> : undefined} />)}
      </FilterGroup>}
      {type === "task2" && topicOptions.length > 1 && <FilterGroup title="Chủ đề" count={topics.length}>
        {topicOptions.map((option) => <FilterCheck key={option.id} checked={topics.includes(option.id)} onChange={() => toggle(topics, setTopics, option.id)} label={option.label} count={option.count} />)}
      </FilterGroup>}
      {sourceOptions.length > 0 && <FilterGroup title="Nguồn tài liệu" count={sources.length}>
        {sourceOptions.map((option) => <FilterCheck key={option.id} checked={sources.includes(option.id)} onChange={() => toggle(sources, setSources, option.id)} label={option.label} count={option.count} />)}
      </FilterGroup>}
    </aside>

    <div className="wl-main">
      <div className="wl-banner">
        <span className="wl-banner-icon" aria-hidden="true"><Target size={24} /></span>
        <div><strong><mark>Chinh phục</mark> mọi dạng đề Writing</strong><p>Chốt band hiện tại, mục tiêu và thời gian thi để nhận lịch luyện đề Writing vừa sức mỗi tuần.</p></div>
        <Link href="/app/planner">Tạo Practice Plan <ArrowRight size={16} /></Link>
      </div>

      <div className="wl-toolbar">
        <div className="wl-status" role="group" aria-label="Trạng thái bài viết">
          {statusTabs.map((tab) => <button type="button" key={tab.id} aria-pressed={status === tab.id} onClick={() => { setStatus(tab.id); setPage(0); }}>{tab.label}</button>)}
        </div>
        <label className="bl-search wl-search"><Search size={16} /><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder="Tìm theo tên đề hoặc từ khóa…" aria-label="Tìm đề Writing" /></label>
      </div>

      <div className="wl-summary">
        <span className="wl-summary-task">{meta.short}</span>
        {chips.map((chip) => <button type="button" className="bl-active" key={chip.key} onClick={chip.clear} aria-label={`Bỏ lọc ${chip.label}`}>{chip.label} <X size={13} /></button>)}
        <span className="wl-summary-count" role="status">{loading ? "Đang tải đề…" : error ? "" : `${filtered.length} đề${graded ? ` · ${graded} bài đã chấm` : ""}`}</span>
      </div>

      {error && <p className="bl-state" role="alert">{error}</p>}
      {loading && <div className="wl-grid">{Array.from({ length: 6 }, (_, index) => <div key={index} className="wl-card wl-skeleton"><span /><div><i /><i /><i /></div></div>)}</div>}
      {!loading && !error && <div className="wl-grid">{visible.map((item) => <WritingCard key={item.exam.id} exam={item.exam} title={item.title} source={item.source} facets={item.facets} minimum={meta.minimum} attempt={latest.get(item.exam.id)} />)}</div>}
      {!loading && !error && !visible.length && <p className="bl-state">Chưa có đề phù hợp. Thử bỏ bớt bộ lọc hoặc đổi trạng thái bài viết.</p>}
      {!loading && pageCount > 1 && <Pager page={currentPage} count={pageCount} onPage={(next) => { setPage(next); document.getElementById("ngan-hang-de")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} />}
    </div>
  </section>;
}

function FilterGroup({ title, count, children }: { title: string; count: number; children: ReactNode }) {
  const box = useRef<HTMLDetailsElement>(null);
  // On a phone the filters sit above the cards, so they start folded.
  useEffect(() => { if (box.current && window.matchMedia("(max-width: 860px)").matches) box.current.open = false; }, []);
  return <details ref={box} className="wl-side-card wl-filter" open>
    <summary><span>{title}</span>{count > 0 && <b>{count}</b>}<ChevronDown size={16} /></summary>
    <div className="wl-filter-list">{children}</div>
  </details>;
}

function FilterCheck({ checked, onChange, label, count, icon }: { checked: boolean; onChange: () => void; label: string; count: number; icon?: ReactNode }) {
  return <label className="wl-check"><input type="checkbox" checked={checked} onChange={onChange} />{icon}<span>{label}</span><small>{count}</small></label>;
}

/** Tiny pictogram for each Task 1 visual, so the list reads at a glance. */
function KindIcon({ kind }: { kind: string }) {
  const stroke = { fill: "none", stroke: "currentColor", strokeWidth: 1.6, strokeLinecap: "round" as const, strokeLinejoin: "round" as const };
  const shapes: Record<string, ReactNode> = {
    line: <><path d="M3 17 8 11l4 3 7-8" {...stroke} /><path d="M3 20h18" {...stroke} opacity={0.4} /></>,
    bar: <><rect x="4" y="11" width="3.5" height="8" rx="1" fill="currentColor" /><rect x="10.2" y="6" width="3.5" height="13" rx="1" fill="currentColor" opacity={0.75} /><rect x="16.5" y="9" width="3.5" height="10" rx="1" fill="currentColor" opacity={0.5} /></>,
    pie: <><circle cx="12" cy="12" r="8" {...stroke} /><path d="M12 4v8h8a8 8 0 0 0-8-8Z" fill="currentColor" /></>,
    table: <><rect x="3.5" y="5" width="17" height="14" rx="2" {...stroke} /><path d="M3.5 10h17M3.5 14.5h17M10 5v14" {...stroke} /></>,
    mixed: <><rect x="4" y="12" width="3.5" height="7" rx="1" fill="currentColor" opacity={0.6} /><rect x="10.2" y="9" width="3.5" height="10" rx="1" fill="currentColor" opacity={0.6} /><path d="M3 10 9 6l5 3 7-5" {...stroke} /></>,
    map: <><path d="m3.5 6.5 5-2 7 2.5 5-2v13l-5 2-7-2.5-5 2Z" {...stroke} /><path d="M8.5 4.5v13M15.5 7v13" {...stroke} opacity={0.5} /></>,
    process: <><circle cx="5.5" cy="12" r="2.5" {...stroke} /><circle cx="18.5" cy="12" r="2.5" {...stroke} /><path d="M8.5 12h6.5m-2-2.5 2.5 2.5-2.5 2.5" {...stroke} /></>,
  };
  return <svg className={`wl-kind-icon is-${kind}`} viewBox="0 0 24 24" aria-hidden="true">{shapes[kind] ?? <circle cx="12" cy="12" r="7" {...stroke} />}</svg>;
}

/** One Writing task: the visual or a topic picture, its type, the question, and the way in. */
function WritingCard({ exam, title, source, facets, minimum, attempt }: { exam: CatalogExam; title: string; source: string; facets: ReturnType<typeof writingFacets>; minimum: number; attempt?: Attempt }) {
  const kind = writingKind(exam);
  const band = gradedBand(attempt);
  const inProgress = attempt?.state === "in_progress";
  const href = inProgress ? `/app/question-bank/attempt/${attempt!.id}` : `/app/question-bank/exam/${exam.id}`;
  const resultHref = attempt && !inProgress ? `/app/question-bank/result/${attempt.id}` : "";
  const aiCover = Boolean(!exam.visual && exam.image_url?.includes("/ielts-images/covers/"));
  const badge = exam.practice_type === "task2" ? facets.topicLabel || "Essay" : exam.practice_type === "task1_general" ? "Letter" : writingKinds[kind];
  const subtitle = exam.practice_type === "task1_academic" ? "" : facets.kindLabel;
  const cta = inProgress ? "Viết tiếp" : attempt ? "Viết lại" : "Viết bài này";
  const prompt = exam.prompt_preview?.trim() || "Mở đề để xem yêu cầu đầy đủ.";

  return <article className={`wl-card ${band !== null ? "is-graded" : ""}`}>
    <Link href={href} className={`wl-thumb ${aiCover ? "has-cover" : ""} ${exam.visual ? "has-visual" : ""}`} tabIndex={-1} aria-hidden="true">
      {/* Figures come from many hosts, so a plain lazy image is used rather than next/image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {exam.visual ? <VisualThumb visual={exam.visual} kind={kind} /> : exam.image_url ? <img src={exam.image_url} alt="" loading="lazy" /> : <TopicArt topic={artTopic(exam)} className="bl-art" />}
      <b className="wl-badge">{badge}</b>
      {aiCover && <em className="bl-ai-badge" title="Ảnh minh họa do AI tạo theo chủ đề bài luyện">Ảnh AI</em>}
    </Link>
    <div className="wl-body">
      <div className="wl-flags">
        {band !== null ? <span className="wl-band"><Sparkles size={12} /> Đã chấm · Band {band.toFixed(1)}</span>
          : inProgress ? <span className="wl-state is-doing">Đang viết</span>
          : attempt ? <span className="wl-state is-done"><CheckCircle2 size={12} /> Đã nộp</span> : null}
      </div>
      <Link href={href} className="wl-title"><span className="wl-source">[{source}]</span> {title}</Link>
      {subtitle && <span className="wl-subtitle">{subtitle}</span>}
      <p className="wl-prompt">{prompt}</p>
      <span className="wl-foot"><span><Clock3 size={13} /> {exam.duration_minutes} phút</span><span><PenLine size={13} /> ≥ {minimum} từ</span>{exam.attempt_count ? <span>{exam.attempt_count.toLocaleString("vi-VN")} lượt viết</span> : null}<Link className="wl-foot-cta" href={href}>{cta} <ArrowRight size={14} /></Link></span>
      {/* On hover the card turns over: the whole question and the buttons, as in a printed workbook. */}
      <div className="wl-reveal">
        <p>{prompt}</p>
        <div className="wl-reveal-actions">
          <Link href={href} className="wl-write">{cta} <ArrowRight size={16} /></Link>
          {resultHref && <Link href={resultHref} className="wl-review">{band !== null ? "Xem bài chấm" : "Xem bài đã nộp"}</Link>}
        </div>
      </div>
    </div>
  </article>;
}
