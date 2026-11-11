"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { ArrowRight, BookOpen, ChevronDown, ChevronLeft, ChevronRight, Clock3, Filter, Headphones, Languages, Mic, NotebookPen, PlayCircle, Search, X } from "lucide-react";
import { TopicArt } from "@/components/illustrations/topic-art";
import { catalogGroups, catalogSkills, balancedCatalog, catalogEntriesForSelection, catalogQuestionTypes, catalogQuestionTypeIds, type CatalogExam, type CatalogSkill } from "@/lib/ielts-bank/catalog";
import { displayExamTitle } from "@/lib/ielts-bank/display-title";
import type { MockCatalogEntry } from "@/lib/listening-mocks/mocks";
import { gradedBand, visualKind, writingCardTitle, writingFacets, writingKind, writingKindOptions, writingKinds, writingSticker, writingTasks, writingTopicOptions } from "./bank-writing-library";
import "./bank-library.css";
import { Sticker } from "@/components/stickers/stickers";
import { TaskFigure } from "./writing-figure";

export type Attempt = { id: string; exam_id: string; state: string; score: number | null; total: number | null; notes?: Record<string, string> | null };

export const librarySkills: Record<CatalogSkill, { icon: typeof BookOpen; href: string; tone: string }> = {
  Reading: { icon: BookOpen, href: "/app/reading", tone: "reading" },
  Listening: { icon: Headphones, href: "/app/listening", tone: "listening" },
  Writing: { icon: NotebookPen, href: "/app/writing", tone: "writing" },
  Speaking: { icon: Mic, href: "/app/speaking", tone: "speaking" },
};

// Raw question types grouped the way learners know them.
const questionTypes = [
  { id: "matching_headings", label: "Matching Headings", test: /matching[_-]headings/ },
  { id: "tfng", label: "True - False - Not Given", test: /true[_-]false/ },
  { id: "ynng", label: "Yes - No - Not Given", test: /yes[_-]no/ },
  { id: "mc_one", label: "Multiple Choice (One Answer)", test: /^multiple[_-]choice(?:[_-]single[_-]answer)?$/ },
  { id: "mc_many", label: "Multiple Choice (Many Answers)", test: /multiple.*answers/ },
  { id: "matching_information", label: "Matching Information", test: /matching[_-]information/ },
  { id: "matching_features", label: "Matching Features", test: /matching[_-]features|^matching$/ },
  { id: "matching_endings", label: "Matching Sentence Endings", test: /sentence[_-]endings/ },
  { id: "sentence_completion", label: "Sentence Completion", test: /sentence[_-]completion/ },
  { id: "summary_completion", label: "Summary Completion", test: /summary[_-]completion/ },
  { id: "note_completion", label: "Note Completion", test: /note[_-]completion/ },
  { id: "table_completion", label: "Table Completion", test: /table[_-]completion/ },
  { id: "flow_chart", label: "Flow Chart Completion", test: /flow[_-]?chart[_-]completion/ },
  { id: "diagram", label: "Diagram Labelling", test: /diagram[_-]labelling/ },
  { id: "map_plan", label: "Map / Plan Labelling", test: /(map|plan)[_-]labelling/ },
  { id: "form_completion", label: "Form Completion", test: /form[_-]completion/ },
  { id: "short_answer", label: "Short Answer", test: /short[_-]answer/ },
] as const;
const otherType = { id: "other", label: "Other Types" };



function typeGroups(exam: CatalogExam) {
  const found = new Map<string, string>();
  for (const raw of exam.question_types ?? []) {
    const group = questionTypes.find((item) => item.test.test(raw)) ?? otherType;
    found.set(group.id, group.label);
  }
  return [...found.entries()].map(([id, label]) => ({ id, label }));
}


/** "Passage 2", "Section 1", "Part 3", "Full test"… for the badge on a card. */
function partBadge(exam: CatalogExam) {
  if (exam.practice_type === "full_test") return "Full test";
  const number = exam.title.match(/\b(?:passage|section|part)\s*(\d)/i)?.[1];
  if (exam.skill === "Reading") return number ? `Passage ${number}` : "Bài lẻ";
  if (exam.skill === "Listening") return number ? `Section ${number}` : "Một phần";
  if (exam.skill === "Speaking") return exam.practice_type.replace("part", "Part ");
  return writingKinds[writingKind(exam)];
}

/** The badge already names the part, so "Passage 2: Why flowers…" reads as "Why flowers…" on a card. */
function shelfTitle(title: string) {
  return title.replace(/^(?:reading\s+)?(?:passage|section|part)\s*\d\s*[:\-–—·]\s*/i, "") || title;
}

/** Words for the illustration: the topic code without its prefix, plus the title. */
export function artTopic(exam: CatalogExam) {
  return `${(exam.topic ?? "").replace(/^topic_/, "").replace(/_/g, " ")} ${exam.title}`;
}

const sentence = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

export function sourceLabel(exam: CatalogExam) {
  return exam.attribution.split(/[·,(]/)[0].trim() || exam.source_id || "Nguồn khác";
}

async function loadLibrary(skill: CatalogSkill) {
  const [catalog, attempts] = await Promise.all([
    fetch(`/api/ielts/bank/catalog?skill=${skill}`, { cache: "no-store" }).then(async (response) => {
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Chưa tải được ngân hàng đề.");
      return (data.exams || []) as CatalogExam[];
    }),
    fetch("/api/ielts/bank/attempt").then(async (response) => response.ok ? ((await response.json()).attempts || []) as Attempt[] : []).catch(() => [] as Attempt[]),
  ]);
  return { catalog, attempts };
}

/**
 * The question bank inside a skill page: a filter bar for this skill (practice
 * type, question type or Writing visual, source) above a grid of exam cards with
 * pictures, badges and the learner's own results, paged like a library shelf.
 */
export function BankLibrary({ skill }: { skill: CatalogSkill }) {
  const [state, setState] = useState<{ skill: CatalogSkill; exams: CatalogExam[]; attempts: Attempt[]; error: string } | null>(null);
  useEffect(() => {
    let live = true;
    loadLibrary(skill).then(({ catalog, attempts }) => { if (live) setState({ skill, exams: catalog, attempts, error: "" }); }, (error: Error) => { if (live) setState({ skill, exams: [], attempts: [], error: error.message }); });
    return () => { live = false; };
  }, [skill]);
  const current = state?.skill === skill ? state : null;
  return <BankLibraryView skill={skill} exams={current?.exams ?? []} attempts={current?.attempts ?? []} loading={!current} error={current?.error ?? ""} />;
}

export type LibraryViewProps = { skill: CatalogSkill; exams: CatalogExam[]; attempts: Attempt[]; loading: boolean; error: string };

export function BankLibraryView(props: LibraryViewProps) {
  if (props.skill === "Writing") return <WritingLibraryView {...props} />;
  return props.skill === "Reading" || props.skill === "Listening"
    ? <SectionedLibrary {...props} skill={props.skill} />
    : <LegacyBankLibraryView {...props} />;
}

function LegacyBankLibraryView({ skill, exams, attempts, loading, error }: LibraryViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const groups = catalogGroups[skill];
  const type = groups.some((group) => group.id === params.get("type")) ? params.get("type")! : "";
  const [sources, setSources] = useState<string[]>([]);
  const [kinds, setKinds] = useState<string[]>([]);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [openMenu, setOpenMenu] = useState<string | null>(null);

  const latest = useMemo(() => {
    const byExam = new Map<string, Attempt>();
    for (const attempt of attempts) if (!byExam.has(attempt.exam_id)) byExam.set(attempt.exam_id, attempt);
    return byExam;
  }, [attempts]);
  const kindOf = (exam: CatalogExam) => skill === "Writing" ? [writingKind(exam)] : typeGroups(exam).map((group) => group.id);
  const typed = exams.filter((exam) => !type || exam.practice_type === type);
  const sourceOptions = useMemo(() => [...new Set(exams.map(sourceLabel))].sort(), [exams]);
  const kindCounts = new Map<string, number>();
  for (const exam of typed) for (const id of kindOf(exam)) kindCounts.set(id, (kindCounts.get(id) ?? 0) + 1);
  const kindLabels = skill === "Writing" ? Object.entries(writingKinds).map(([id, label]) => ({ id, label })) : [...questionTypes, otherType];
  const kindOptions = kindLabels.filter((item) => kindCounts.has(item.id)).map((item) => ({ id: item.id, label: item.label, count: kindCounts.get(item.id)! }));
  const needle = query.trim().toLocaleLowerCase();
  const filtered = typed.filter((exam) => (!sources.length || sources.includes(sourceLabel(exam)))
    && (!kinds.length || kindOf(exam).some((id) => kinds.includes(id)))
    && (!needle || `${exam.title} ${exam.topic ?? ""} ${exam.prompt_preview ?? ""}`.toLocaleLowerCase().includes(needle)));
  const ordered = type ? filtered : balancedCatalog(filtered, groups.map((group) => group.id));
  const pageSize = skill === "Reading" || skill === "Listening" ? 12 : 10;
  const pageCount = Math.max(1, Math.ceil(ordered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = ordered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const activeFilters = sources.length + kinds.length + (query ? 1 : 0);
  const readingFull = skill === "Reading" && (!type || type === "passage") ? exams.filter((exam) => exam.practice_type === "full_test" && (!needle || `${exam.title} ${exam.topic ?? ""}`.toLocaleLowerCase().includes(needle))).slice(0, 2) : [];

  function chooseType(next: string) {
    const search = new URLSearchParams(params);
    if (next) search.set("type", next); else search.delete("type");
    setPage(0);
    setKinds([]);
    router.replace(`${pathname}${search.size ? `?${search}` : ""}`, { scroll: false });
  }
  const toggle = (list: string[], set: (value: string[]) => void, value: string) => { set(list.includes(value) ? list.filter((item) => item !== value) : [...list, value]); setPage(0); };
  const clearAll = () => { setSources([]); setKinds([]); setQuery(""); setPage(0); };

  const counted = (id: string) => exams.filter((exam) => exam.practice_type === id).length;
  const activeChips = [
    ...kinds.map((value) => ({ value: kindOptions.find((item) => item.id === value)?.label ?? value, clear: () => toggle(kinds, setKinds, value) })),
    ...sources.map((value) => ({ value, clear: () => toggle(sources, setSources, value) })),
  ];

  return <section id="ngan-hang-de" className={`bl-library bl-tone-${librarySkills[skill].tone}`} aria-label={`Ngân hàng đề ${skill}`}>
    <div className="bl-filterbar">
      <div className="bl-filter-row">
        <div className="bl-chips" role="group" aria-label="Dạng bài">
          <button type="button" aria-pressed={!type} onClick={() => chooseType("")}>Tất cả <b>{exams.length || ""}</b></button>
          {groups.filter((group) => counted(group.id)).map((group) => <button type="button" key={group.id} aria-pressed={type === group.id} onClick={() => chooseType(group.id)}>{group.label} <b>{counted(group.id)}</b></button>)}
        </div>
        <label className="bl-search"><Search size={16} /><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder={`Tìm đề ${skill}…`} aria-label={`Tìm đề ${skill}`} /></label>
      </div>
      <div className="bl-filter-row is-secondary">
        <span className="bl-filter-label"><Filter size={15} /> Lọc theo</span>
        {kindOptions.length > 0 && skill !== "Reading" && <FilterMenu id="kinds" title={skill === "Writing" ? "Dạng đề" : "Loại câu hỏi"} count={kinds.length} open={openMenu === "kinds"} onOpen={setOpenMenu}>
          {kindOptions.map((item) => <Check key={item.id} checked={kinds.includes(item.id)} onChange={() => toggle(kinds, setKinds, item.id)} label={item.label} count={item.count} />)}
        </FilterMenu>}
        {sourceOptions.length > 1 && <FilterMenu id="sources" title="Nguồn tài liệu" count={sources.length} open={openMenu === "sources"} onOpen={setOpenMenu}>
          {sourceOptions.map((source) => <Check key={source} checked={sources.includes(source)} onChange={() => toggle(sources, setSources, source)} label={source} />)}
        </FilterMenu>}
        {activeChips.map((chip) => <button type="button" className="bl-active" key={chip.value} onClick={chip.clear} aria-label={`Bỏ lọc ${chip.value}`}>{chip.value} <X size={13} /></button>)}
        {activeFilters > 0 && <button type="button" className="bl-clear" onClick={clearAll}>Xóa lọc</button>}
        <span className="bl-count" role="status">{loading ? "Đang tải đề…" : error ? "" : `${ordered.length} đề phù hợp`}</span>
      </div>
      {skill === "Reading" && kindOptions.length > 0 && <div className="bl-reading-types" role="group" aria-label="Lọc Reading theo dạng câu hỏi"><strong>Dạng câu hỏi</strong>{kindOptions.map((item) => <button type="button" key={item.id} aria-pressed={kinds.includes(item.id)} onClick={() => toggle(kinds, setKinds, item.id)}>{item.label} <small>{item.count}</small></button>)}</div>}
    </div>
    {readingFull.length > 0 && <section className="bl-reading-parts"><div><h3>Luyện từng Passage từ đề full</h3><p>Passage 1, 2, 3 có đồng hồ 20 phút và kết quả riêng. Bạn cũng có thể mở đề full để làm cả ba.</p></div><div className="bl-reading-part-grid">{readingFull.flatMap((exam) => [1, 2, 3].map((part) => <Link key={`${exam.id}-${part}`} href={`/app/question-bank/exam/${exam.id}?part=${part}`}><span>PASSAGE {part}</span><strong>{displayExamTitle(exam.title)}</strong><small>20 phút · bài làm riêng <ArrowRight size={14} /></small></Link>))}</div></section>}
    {error && <p className="bl-state" role="alert">{error}</p>}
    {loading && <div className={`bl-grid bl-grid-${skill.toLowerCase()}`}>{Array.from({ length: 8 }, (_, index) => <div key={index} className="bl-card bl-skeleton"><span /><i /><i /></div>)}</div>}
    {!loading && !error && <div className={`bl-grid bl-grid-${skill.toLowerCase()}`}>{visible.map((exam) => <ExamCard key={exam.id} exam={exam} attempt={latest.get(exam.id)} />)}</div>}
    {!loading && !error && !visible.length && <p className="bl-state">Chưa có đề phù hợp. Thử bỏ bớt bộ lọc.</p>}
    {pageCount > 1 && <Pager page={currentPage} count={pageCount} onPage={(next) => { setPage(next); document.querySelector(".bl-library")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} />}
  </section>;
}

type LibraryStatus = "all" | "todo" | "progress" | "done";
const libraryStatuses: { id: LibraryStatus; label: string }[] = [
  { id: "all", label: "Tất cả" }, { id: "todo", label: "Chưa làm" }, { id: "progress", label: "Đang làm" }, { id: "done", label: "Đã làm" },
];

/** The skill's own word list, offered beside the shelf it belongs to. */
const vocabularyLinks: Partial<Record<CatalogSkill, { href: string; label: string; title: string }>> = {
  Reading: { href: "/app/reading/vocabulary", label: "607 từ vựng", title: "Học 607 từ IELTS Reading" },
  Listening: { href: "/app/listening/vocabulary", label: "1.200 từ vựng", title: "Học 1.200 từ IELTS Listening" },
};

/**
 * One compact panel on top of every shelf: section title and count, status tabs,
 * search and the skill's word list on one line, the filter chip rows under it.
 */
function LibraryHead({ skill, heading, count, busy, status, statusCounts, onStatus, query, onQuery, placeholder, children }: {
  skill: CatalogSkill; heading: string; count: number; busy: boolean;
  status: LibraryStatus; statusCounts: Record<LibraryStatus, number>; onStatus: (status: LibraryStatus) => void;
  query: string; onQuery: (query: string) => void; placeholder: string; children?: ReactNode;
}) {
  const Icon = librarySkills[skill].icon;
  const vocabulary = vocabularyLinks[skill];
  return <div className="bl-head">
    <div className="bl-head-top">
      <div className="bl-head-title">
        <span className="bl-head-icon" aria-hidden="true"><Icon size={18} /></span>
        <div><h2>{heading}</h2><p role="status">{busy ? "Đang tải đề…" : `${count} bài phù hợp`}</p></div>
      </div>
      <div className="bl-status-tabs" role="group" aria-label="Trạng thái bài luyện">{libraryStatuses.map((item) => <button type="button" key={item.id} aria-pressed={status === item.id} onClick={() => onStatus(item.id)}>{item.label}{!busy && <b>{statusCounts[item.id]}</b>}</button>)}</div>
      <label className="bl-search"><Search size={16} /><input type="search" value={query} onChange={(event) => onQuery(event.target.value)} placeholder={placeholder} aria-label={`Tìm đề ${skill}`} /></label>
      {vocabulary && <Link className="bl-head-vocab" href={vocabulary.href} title={vocabulary.title}><Languages size={15} /> {vocabulary.label} <ArrowRight size={14} /></Link>}
    </div>
    {children}
  </div>;
}

function SectionedLibrary({ skill, exams, attempts, loading, error }: LibraryViewProps & { skill: "Reading" | "Listening" }) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const isReading = skill === "Reading";
  const [mocks, setMocks] = useState<MockCatalogEntry[] | null>(isReading ? [] : null);
  const [mockError, setMockError] = useState("");
  useEffect(() => {
    if (isReading) return;
    let live = true;
    void fetch("/api/listening/mocks", { cache: "no-store" }).then(async (response) => {
      const data = await response.json() as { tests?: MockCatalogEntry[]; error?: string };
      if (!response.ok) throw new Error(data.error || "Chưa tải được đề Listening thi thử.");
      if (live) setMocks((data.tests ?? []).filter((test) => test.audio_ready));
    }).catch((cause: Error) => { if (live) { setMockError(cause.message); setMocks([]); } });
    return () => { live = false; };
  }, [isReading]);
  const limit = isReading ? 3 : 4;
  const full = params.get("type") === "full_test";
  const partValue = Number(params.get("part"));
  const part = !full && Number.isInteger(partValue) && partValue >= 1 && partValue <= limit ? partValue : 0;
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const base = catalogEntriesForSelection(exams, skill, full, part);
  const mockEntries = (mocks ?? []).flatMap((test) => full
    ? [{ test, part: 0, title: test.title, questionTypes: [...new Set(test.parts.flatMap((item) => item.question_types))] }]
    : test.parts.filter((item) => !part || item.number === part).map((item) => ({ test, part: item.number, title: `${test.title} · ${item.title}`, questionTypes: item.question_types })));
  const kindCounts = new Map<string, number>();
  for (const entry of base) for (const id of catalogQuestionTypeIds(entry.questionTypes)) kindCounts.set(id, (kindCounts.get(id) ?? 0) + 1);
  for (const entry of mockEntries) for (const id of catalogQuestionTypeIds(entry.questionTypes)) kindCounts.set(id, (kindCounts.get(id) ?? 0) + 1);
  const requestedKind = params.get("kind") ?? "";
  const selectedKind = kindCounts.has(requestedKind) ? requestedKind : "";
  const [status, setStatus] = useState<LibraryStatus>("all");
  const latest = new Map<string, Attempt>();
  for (const attempt of attempts) {
    const key = `${attempt.exam_id}:${attempt.notes?.__part || "full"}`;
    if (!latest.has(key)) latest.set(key, attempt);
  }
  const attemptFor = (entry: (typeof base)[number]) => latest.get(`${entry.exam.id}:${entry.splitFromFull ? entry.part : "full"}`);
  const statusOf = (attempt?: Attempt): Exclude<LibraryStatus, "all"> => !attempt ? "todo" : attempt.state === "in_progress" ? "progress" : "done";
  const needle = query.trim().toLocaleLowerCase();
  const kindMatches = (types: string[]) => !selectedKind || catalogQuestionTypeIds(types).includes(selectedKind);
  const mockMatches = mockEntries.filter((entry) => kindMatches(entry.questionTypes) && (!needle || entry.title.toLocaleLowerCase().includes(needle)));
  const bankMatches = base.filter((entry) => kindMatches(entry.questionTypes) && (!needle || `${entry.title} ${entry.exam.title} ${entry.exam.topic ?? ""}`.toLocaleLowerCase().includes(needle)));
  const statusCounts = { all: mockMatches.length + bankMatches.length, todo: mockMatches.length, progress: 0, done: 0 };
  for (const entry of bankMatches) statusCounts[statusOf(attemptFor(entry))]++;
  const filtered = [
    ...(status === "all" || status === "todo" ? mockMatches : []).map((entry) => ({ kind: "mock" as const, entry })),
    ...bankMatches.filter((entry) => status === "all" || statusOf(attemptFor(entry)) === status).map((entry) => ({ kind: "bank" as const, entry })),
  ];
  const busy = loading || mocks === null;
  const displayError = error || mockError;
  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  const name = isReading ? "Passage" : "Section";
  const heading = full ? "Full đề" : part ? `${name} ${part}` : "Bài lẻ";
  const kindOptions = catalogQuestionTypes.filter((item) => kindCounts.has(item.id));
  const chooseKind = (kind: string) => {
    const search = new URLSearchParams(params.toString());
    if (kind && kind !== selectedKind) search.set("kind", kind); else search.delete("kind");
    setPage(0);
    router.replace(`${pathname}${search.size ? `?${search}` : ""}`, { scroll: false });
  };
  const filtersOn = Boolean(selectedKind || needle || status !== "all");

  return <section id="ngan-hang-de" className={`bl-library bl-sectioned bl-tone-${skill.toLowerCase()}`} aria-label={`Ngân hàng đề ${skill}`}>
    <div className="bl-results">
      <LibraryHead skill={skill} heading={heading} count={filtered.length} busy={busy} status={status} statusCounts={statusCounts}
        onStatus={(next) => { setStatus(next); setPage(0); }} query={query} onQuery={(next) => { setQuery(next); setPage(0); }} placeholder="Tìm tên bài hoặc chủ đề…">
        {kindOptions.length > 1 && <div className="bl-kind-row" role="group" aria-label="Lọc theo dạng câu hỏi"><span className="bl-kind-label"><Filter size={13} /> Dạng câu hỏi</span>
          <button type="button" aria-pressed={!selectedKind} onClick={() => chooseKind("")}>Tất cả</button>
          {kindOptions.map((item) => <button type="button" key={item.id} aria-pressed={selectedKind === item.id} onClick={() => chooseKind(item.id)}>{item.label} <small>{kindCounts.get(item.id)}</small></button>)}
          {filtersOn && <button type="button" className="bl-kind-clear" onClick={() => { setQuery(""); setStatus("all"); chooseKind(""); }}><X size={13} /> Xóa lọc</button>}
        </div>}
      </LibraryHead>
      {displayError && <p className="bl-state" role="alert">{displayError}</p>}
      {busy && <div className="bl-grid bl-grid-sectioned">{Array.from({ length: 6 }, (_, index) => <div key={index} className="bl-card bl-skeleton"><span /><i /><i /></div>)}</div>}
      {!busy && !displayError && <div className="bl-grid bl-grid-sectioned">{visible.map(({ kind, entry }) => kind === "mock"
        ? <MockLibraryCard key={`${entry.test.test_id}:${entry.part}`} test={entry.test} part={entry.part} questionTypes={entry.questionTypes} title={entry.title} />
        : <ExamCard key={`${entry.exam.id}:${entry.part ?? "full"}`} exam={entry.exam} attempt={attemptFor(entry)} section={entry.splitFromFull && entry.part ? { part: entry.part, title: entry.title, questionTypes: entry.questionTypes, questionCount: entry.questionCount } : undefined} />)}</div>}
      {!busy && !displayError && !visible.length && <p className="bl-state">{status === "done" ? "Bạn chưa hoàn thành bài nào trong mục này." : status === "progress" ? "Không có bài nào đang làm dở." : "Chưa có bài phù hợp. Hãy thử dạng câu hỏi khác, đổi từ khóa hoặc chọn phần khác trong sidebar."}</p>}
      {!busy && pageCount > 1 && <Pager page={currentPage} count={pageCount} onPage={(next) => { setPage(next); document.getElementById("ngan-hang-de")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} />}
    </div>
  </section>;
}

/**
 * Writing uses the same shelf as Reading: the sidebar picks the task, the head
 * holds status tabs and search, chip rows filter by kind (and Task 2 topic),
 * and each task is a picture card.
 */
function WritingLibraryView({ exams, attempts, loading, error }: LibraryViewProps) {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const requestedTask = params.get("type") ?? "";
  const task = writingTasks.find((item) => item.id === requestedTask);
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(0);
  const [status, setStatus] = useState<LibraryStatus>("all");
  const latest = new Map<string, Attempt>();
  for (const attempt of attempts) if (!latest.has(attempt.exam_id)) latest.set(attempt.exam_id, attempt);
  const items = exams
    .filter((exam) => task ? exam.practice_type === task.id : writingTasks.some((item) => item.id === exam.practice_type))
    .map((exam) => ({ exam, facets: writingFacets(exam) }));
  const kindCounts = new Map<string, number>(), topicCounts = new Map<string, number>();
  for (const { facets } of items) {
    kindCounts.set(facets.kind, (kindCounts.get(facets.kind) ?? 0) + 1);
    if (facets.topic) topicCounts.set(facets.topic, (topicCounts.get(facets.topic) ?? 0) + 1);
  }
  const selectedKind = kindCounts.has(params.get("kind") ?? "") ? params.get("kind")! : "";
  const selectedTopic = topicCounts.has(params.get("topic") ?? "") ? params.get("topic")! : "";
  const statusOf = (attempt?: Attempt): Exclude<LibraryStatus, "all"> => !attempt ? "todo" : attempt.state === "in_progress" ? "progress" : "done";
  const needle = query.trim().toLocaleLowerCase();
  const matches = items.filter(({ exam, facets }) => (!selectedKind || facets.kind === selectedKind)
    && (!selectedTopic || facets.topic === selectedTopic)
    && (!needle || `${exam.title} ${exam.topic ?? ""} ${exam.prompt_preview ?? ""}`.toLocaleLowerCase().includes(needle)));
  const statusCounts = { all: matches.length, todo: 0, progress: 0, done: 0 };
  for (const { exam } of matches) statusCounts[statusOf(latest.get(exam.id))]++;
  const filtered = matches.filter(({ exam }) => status === "all" || statusOf(latest.get(exam.id)) === status);
  const pageSize = 12;
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = filtered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);
  const kindOptions = writingKindOptions.filter((item) => kindCounts.has(item.id));
  // Themes only mean something for essays, so the topic chips appear on Task 2 alone.
  const topicOptions = task?.id === "task2" ? writingTopicOptions.filter((item) => topicCounts.has(item.id)) : [];
  const choose = (key: "kind" | "topic", value: string) => {
    const search = new URLSearchParams(params.toString());
    if (value && value !== search.get(key)) search.set(key, value); else search.delete(key);
    setPage(0);
    router.replace(`${pathname}${search.size ? `?${search}` : ""}`, { scroll: false });
  };
  const clearAll = () => {
    const search = new URLSearchParams(params.toString());
    search.delete("kind"); search.delete("topic");
    setQuery(""); setStatus("all"); setPage(0);
    router.replace(`${pathname}${search.size ? `?${search}` : ""}`, { scroll: false });
  };
  const filtersOn = Boolean(selectedKind || selectedTopic || needle || status !== "all");

  return <section id="ngan-hang-de" className="bl-library bl-sectioned bl-tone-writing" aria-label="Ngân hàng đề Writing">
    <div className="bl-results">
      <LibraryHead skill="Writing" heading={task?.label ?? "Bài lẻ"} count={filtered.length} busy={loading} status={status} statusCounts={statusCounts}
        onStatus={(next) => { setStatus(next); setPage(0); }} query={query} onQuery={(next) => { setQuery(next); setPage(0); }} placeholder="Tìm tên đề hoặc chủ đề…">
        {kindOptions.length > 1 && <div className="bl-kind-row" role="group" aria-label="Lọc theo dạng đề"><span className="bl-kind-label"><Filter size={13} /> Dạng đề</span>
          <button type="button" aria-pressed={!selectedKind} onClick={() => choose("kind", "")}>Tất cả</button>
          {kindOptions.map((item) => <button type="button" key={item.id} aria-pressed={selectedKind === item.id} onClick={() => choose("kind", item.id)}>{item.label} <small>{kindCounts.get(item.id)}</small></button>)}
          {filtersOn && !(topicOptions.length > 1) && <button type="button" className="bl-kind-clear" onClick={clearAll}><X size={13} /> Xóa lọc</button>}
        </div>}
        {topicOptions.length > 1 && <div className="bl-kind-row" role="group" aria-label="Lọc theo chủ đề"><span className="bl-kind-label"><Filter size={13} /> Chủ đề</span>
          <button type="button" aria-pressed={!selectedTopic} onClick={() => choose("topic", "")}>Tất cả</button>
          {topicOptions.map((item) => <button type="button" key={item.id} aria-pressed={selectedTopic === item.id} onClick={() => choose("topic", item.id)}>{item.label} <small>{topicCounts.get(item.id)}</small></button>)}
          {filtersOn && <button type="button" className="bl-kind-clear" onClick={clearAll}><X size={13} /> Xóa lọc</button>}
        </div>}
      </LibraryHead>
      {error && <p className="bl-state" role="alert">{error}</p>}
      {loading && <div className="bl-grid wl-grid">{Array.from({ length: 6 }, (_, index) => <div key={index} className="bl-card bl-skeleton"><span /><i /><i /></div>)}</div>}
      {!loading && !error && <div className="bl-grid wl-grid">{visible.map(({ exam, facets }) => <WritingShelfCard key={exam.id} exam={exam} facets={facets} attempt={latest.get(exam.id)} />)}</div>}
      {!loading && !error && !visible.length && <p className="bl-state">{status === "done" ? "Bạn chưa nộp bài nào trong mục này." : status === "progress" ? "Không có bài nào đang viết dở." : "Chưa có đề phù hợp. Hãy thử dạng đề khác, đổi từ khóa hoặc chọn Task khác trong sidebar."}</p>}
      {!loading && pageCount > 1 && <Pager page={currentPage} count={pageCount} onPage={(next) => { setPage(next); document.getElementById("ngan-hang-de")?.scrollIntoView({ behavior: "smooth", block: "start" }); }} />}
    </div>
  </section>;
}

/**
 * A Writing task laid out like a workbook entry: the figure on the left (the
 * Task 1 chart itself, or a sticker for the Task 2 theme), the title and the
 * question beside it.
 */
function WritingShelfCard({ exam, facets, attempt }: { exam: CatalogExam; facets: ReturnType<typeof writingFacets>; attempt?: Attempt }) {
  const href = attempt?.state === "in_progress" ? `/app/question-bank/attempt/${attempt.id}` : `/app/question-bank/exam/${exam.id}`;
  const task1 = exam.practice_type === "task1_academic";
  const task = writingTasks.find((item) => item.id === exam.practice_type) ?? writingTasks[1];
  const band = gradedBand(attempt);
  const sticker = writingSticker(facets.topic);
  const figure = task1 ? exam.figure_url || (exam.image_url && !exam.image_url.includes("/ielts-images/covers/") ? exam.image_url : "") : "";
  const prompt = exam.prompt_preview?.replace(/\s+/g, " ").trim() || "Mở đề để xem yêu cầu đầy đủ.";
  return <Link href={href} className={`bl-card wl-card ${band !== null ? "is-graded" : ""}`}>
    <span className={`wl-cover ${task1 ? "is-figure" : "is-sticker"}`} style={task1 ? undefined : { background: sticker.tone }}>
      {/* Task figures come from many hosts, so a plain lazy image is used rather than next/image. */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {task1 ? figure ? <img src={figure} alt="" loading="lazy" /> : exam.visual ? <TaskFigure visual={exam.visual} /> : <Sticker name="chart" size={78} tilt={-5} pop={false} />
        : <Sticker name={sticker.name} size={92} tilt={-6} pop={false} />}
      <b className="wl-kind">{task1 ? facets.kindLabel : facets.topicLabel}</b>
    </span>
    <span className="wl-copy">
      <span className="wl-meta"><span className="wl-task">{task.label}</span>{band !== null ? <span className="bl-mine">Band {band.toFixed(1)}</span> : <AttemptChip attempt={attempt} />}</span>
      <strong className="wl-title">{writingCardTitle(exam)}</strong>
      {!task1 && <span className="wl-sub">{facets.kindLabel}</span>}
      <span className="wl-prompt">{prompt}</span>
      <span className="wl-foot"><span><Clock3 size={13} /> {exam.duration_minutes} phút</span><span>Tối thiểu {task.minimum} từ</span><span className="bl-source">{sourceLabel(exam)}</span><span className="bl-cta">{attempt?.state === "in_progress" ? "Viết tiếp" : attempt ? "Viết lại" : "Viết bài"} <ArrowRight size={15} /></span></span>
    </span>
  </Link>;
}

function MockLibraryCard({ test, part, title, questionTypes }: { test: MockCatalogEntry; part: number; title: string; questionTypes: string[] }) {
  const section = test.parts.find((item) => item.number === part);
  const href = `/app/listening/mock/${test.test_id}${part ? `?part=${part}` : ""}`;
  const duration = section?.duration_ms ?? test.duration_ms;
  const types = catalogQuestionTypeIds(questionTypes).map((id) => catalogQuestionTypes.find((group) => group.id === id)?.label ?? "Other Types");
  return <Link href={href} className="bl-card bl-card-shelf">
    <span className="bl-thumb">
      {section ? <figure className="bl-art">{/* eslint-disable-next-line @next/next/no-img-element -- cover supplied in the owner's package */}<img src={section.cover_url} alt="" loading="lazy" /></figure>
        : <figure className="bl-art bl-brand-art">{/* eslint-disable-next-line @next/next/no-img-element -- local brand asset */}<img src="/ieltswithharry-mascot.webp" alt="" loading="lazy" /><span className="bl-brand-wordmark">Ielts<b>WithHarry</b></span><small>IELTS LISTENING</small></figure>}
      <span className="bl-usage"><Clock3 size={13} /> {Math.max(1, Math.ceil(duration / 60000))} phút audio</span>
      <b className="bl-badge">{part ? `Section ${part}` : "Full test"}</b>
    </span>
    <span className="bl-body"><strong className="bl-title">{title}</strong>
      {types.length ? <ul className="bl-types">{types.slice(0, 3).map((type) => <li key={type}>{type}</li>)}</ul> : <span className="bl-types-plain">{part ? 10 : 40} câu hỏi</span>}
      <span className="bl-foot"><span className="bl-source">English Skill Lab · bản luyện thử</span><span className="bl-cta">Luyện đề <ArrowRight size={15} /></span></span>
    </span>
  </Link>;
}

/** A filter button that opens a checklist under it; closes on an outside click or Escape. */
function FilterMenu({ id, title, count, open, onOpen, children }: { id: string; title: string; count: number; open: boolean; onOpen: (id: string | null) => void; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const close = (event: MouseEvent) => { if (!box.current?.contains(event.target as Node)) onOpen(null); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") onOpen(null); };
    document.addEventListener("mousedown", close);
    document.addEventListener("keydown", escape);
    return () => { document.removeEventListener("mousedown", close); document.removeEventListener("keydown", escape); };
  }, [open, onOpen]);
  return <div ref={box} className={`bl-menu ${open ? "is-open" : ""} ${count ? "is-active" : ""}`}>
    <button type="button" aria-expanded={open} onClick={() => onOpen(open ? null : id)}>{title}{count > 0 && <b>{count}</b>}<ChevronDown size={15} /></button>
    {open && <div className="bl-menu-pop" role="group" aria-label={title}>{children}</div>}
  </div>;
}

function Check({ checked, onChange, label, count }: { checked: boolean; onChange: () => void; label: string; count?: number }) {
  return <label className="bl-check"><input type="checkbox" checked={checked} onChange={onChange} /><span>{label}</span>{count !== undefined && <small>{count}</small>}</label>;
}

export function Pager({ page, count, onPage }: { page: number; count: number; onPage: (page: number) => void }) {
  const numbers = [...new Set([0, page - 1, page, page + 1, count - 1].filter((value) => value >= 0 && value < count))].sort((a, b) => a - b);
  return <nav className="bl-pager" aria-label="Phân trang đề">
    <button type="button" disabled={page === 0} onClick={() => onPage(page - 1)}><ChevronLeft size={16} /> Trang trước</button>
    <div>{numbers.map((value, index) => <span key={value}>{index > 0 && value - numbers[index - 1] > 1 && <em>…</em>}<button type="button" aria-current={value === page ? "page" : undefined} onClick={() => onPage(value)}>{value + 1}</button></span>)}</div>
    <button type="button" disabled={page + 1 >= count} onClick={() => onPage(page + 1)}>Trang sau <ChevronRight size={16} /></button>
  </nav>;
}

function AttemptChip({ attempt }: { attempt?: Attempt }) {
  if (!attempt) return null;
  if (attempt.state === "in_progress") return <span className="bl-mine is-progress">Đang làm</span>;
  if (attempt.score === null || attempt.total === null) return <span className="bl-mine">Đã nộp</span>;
  const ratio = attempt.total ? attempt.score / attempt.total : 0;
  return <span className={`bl-mine ${ratio >= 0.75 ? "" : ratio >= 0.5 ? "is-mid" : "is-low"}`} title="Kết quả lần làm gần nhất">✓ {attempt.score}/{attempt.total} đúng</span>;
}

/** One exam on the shelf; its shape follows the skill, like a printed practice book. */
export function ExamCard({ exam, attempt, section }: { exam: CatalogExam; attempt?: Attempt; section?: { part: number; title: string; questionTypes: string[]; questionCount: number } }) {
  const href = attempt?.state === "in_progress" ? `/app/question-bank/attempt/${attempt.id}` : section ? `/app/question-bank/exam/${exam.id}?part=${section.part}` : `/app/question-bank/exam/${exam.id}`;
  const duration = section ? exam.skill === "Reading" ? 20 : 10 : exam.duration_minutes;
  const usage = !section && exam.attempt_count ? <span className="bl-usage"><PlayCircle size={13} /> {exam.attempt_count.toLocaleString("vi-VN")} lượt làm</span> : <span className="bl-usage"><Clock3 size={13} /> {duration} phút</span>;
  const cta = <span className="bl-cta">{attempt?.state === "in_progress" ? "Làm tiếp" : attempt ? "Luyện lại" : "Luyện đề"} <ArrowRight size={15} /></span>;

  const readingFullCover = exam.skill === "Reading" && exam.practice_type === "full_test" && !section;
  const suppliedReadingTest = exam.skill === "Reading"
    ? /^english-skill-lab-reading-0(0[1-9]|10)$/i.exec(exam.external_id ?? "")?.[1]
      ?? /^English Skill Lab · Reading Test (0[1-9]|10)(?: \(Bản luyện thử\))?$/.exec(exam.title)?.[1]
    : undefined;
  const coverUrl = readingFullCover
    ? null
    : suppliedReadingTest
    ? section && section.part >= 1 && section.part <= 3
      ? `/images/ielts/reading/test-${suppliedReadingTest}-passage-${section.part}.${Number(suppliedReadingTest) >= 6 ? "webp" : "png"}`
      : null
    : exam.image_url;
  const aiCover = Boolean(!exam.visual && (coverUrl?.includes("/ielts-images/covers/") || (section && suppliedReadingTest && Number(suppliedReadingTest) >= 6)));
  // Writing has its own card: the task figure or a theme sticker, never a stock picture.
  if (exam.skill === "Writing") return <WritingShelfCard exam={exam} facets={writingFacets(exam)} attempt={attempt} />;

  if (exam.skill === "Speaking") {
    const previews = exam.question_preview?.length ? exam.question_preview : exam.prompt_preview ? [exam.prompt_preview] : [];
    return <Link href={href} className="bl-card bl-card-speaking">
      <span className="bl-mic"><Sticker name="mic" size={48} tilt={-6} pop={false} /><b>{partBadge(exam)}</b><small>{exam.duration_minutes} phút</small></span>
      <span className="bl-speaking-copy">
        <span className="bl-speaking-top"><strong className="bl-title">{sentence(exam.title.replace(/^Speaking Part \d:\s*/i, ""))}</strong><span className="bl-qcount">{exam.question_count ? `${exam.question_count} câu` : partBadge(exam)}</span></span>
        <ul>{previews.slice(0, 3).map((question) => <li key={question}>{question}</li>)}</ul>
        <span className="bl-foot"><AttemptChip attempt={attempt} />{cta}</span>
      </span>
    </Link>;
  }

  const types = section ? catalogQuestionTypeIds(section.questionTypes).map((id) => ({ id, label: catalogQuestionTypes.find((group) => group.id === id)?.label ?? "Other Types" })) : typeGroups(exam);
  return <Link href={href} className="bl-card bl-card-shelf">
    <span className="bl-thumb">
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {/* A full test shows its three supplied passage covers side by side. */}
      {readingFullCover && suppliedReadingTest ? <figure className="bl-art bl-collage">{[1, 2, 3].map((part) => <img key={part} src={`/images/ielts/reading/test-${suppliedReadingTest}-passage-${part}.${Number(suppliedReadingTest) >= 6 ? "webp" : "png"}`} alt="" loading="lazy" />)}</figure>
      : readingFullCover ? <figure className="bl-art bl-brand-art">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/ieltswithharry-mascot.webp" alt="" loading="lazy" />
        <span className="bl-brand-wordmark">Ielts<b>WithHarry</b></span>
        <small>IELTS READING</small>
      </figure> : coverUrl ? <figure className="bl-art"><img src={coverUrl} alt="" loading="lazy" /></figure> : <TopicArt topic={artTopic(exam)} className="bl-art" />}
      {usage}
      <b className="bl-badge">{section ? `${exam.skill === "Reading" ? "Passage" : "Section"} ${section.part}` : partBadge(exam)}</b>
      {aiCover && <em className="bl-ai-badge" title="Ảnh minh họa do AI tạo theo chủ đề bài luyện">Ảnh AI</em>}
    </span>
    <span className="bl-body">
      <strong className="bl-title">{shelfTitle(displayExamTitle(section?.title ?? exam.title))}</strong>
      {types.length > 0 ? <ul className="bl-types">{types.slice(0, 3).map((item) => <li key={item.id}>{item.label}</li>)}</ul>
        : <span className="bl-types-plain">{section?.questionCount || exam.question_count ? `${section?.questionCount ?? exam.question_count} câu hỏi` : exam.format} · {duration} phút</span>}
      <span className="bl-foot"><AttemptChip attempt={attempt} /><span className="bl-source">{sourceLabel(exam)}</span>{cta}</span>
    </span>
  </Link>;
}

/** A small drawing of a Writing Task 1 visual: lines, bars, a pie, a table, a process or a map. */
export function VisualThumb({ visual, kind }: { visual: Record<string, unknown>; kind: string }) {
  const panel = Array.isArray(visual.panels) && visual.panels[0] && typeof visual.panels[0] === "object" ? visual.panels[0] as Record<string, unknown> : visual;
  if (panel !== visual) kind = visualKind(String(panel.kind ?? kind));
  const series = (Array.isArray(panel.series) ? panel.series : []).slice(0, 4) as Record<string, unknown>[];
  const colors = ["#e46f67", "#528add", "#cd8d22", "#22a660"];
  if (series.length && kind !== "table") {
    const values = series.map((item) => (Array.isArray(item.values) ? item.values : []).slice(0, 12).map((value) => Number(value) || 0));
    const max = Math.max(1, ...values.flat());
    const points = Math.max(1, ...values.map((row) => row.length));
    if (kind === "pie") {
      const slices = values[0] ?? [];
      const sum = slices.reduce((total, value) => total + value, 0) || 1;
      const top = slices.slice(0, 6);
      const ends = top.map((_, index) => -Math.PI / 2 + (top.slice(0, index + 1).reduce((total, value) => total + value, 0) / sum) * Math.PI * 2);
      return <svg viewBox="0 0 100 70" className="bl-visual" aria-hidden="true">{top.map((value, index) => {
        const start = index ? ends[index - 1] : -Math.PI / 2, end = ends[index];
        const large = end - start > Math.PI ? 1 : 0;
        return <path key={index} d={`M50 35 L${50 + 28 * Math.cos(start)} ${35 + 28 * Math.sin(start)} A28 28 0 ${large} 1 ${50 + 28 * Math.cos(end)} ${35 + 28 * Math.sin(end)} Z`} fill={colors[index % 4]} opacity={0.85} />;
      })}</svg>;
    }
    return <svg viewBox="0 0 100 70" className="bl-visual" aria-hidden="true">
      <path d="M10 8 V60 H94" fill="none" stroke="#c8d3dc" strokeWidth="1" />
      {kind === "bar" ? values.map((row, seriesIndex) => row.map((value, index) => {
        const slot = 80 / points, width = Math.max(2, slot / (values.length + 1));
        return <rect key={`${seriesIndex}-${index}`} x={12 + index * slot + seriesIndex * width} y={60 - (value / max) * 48} width={width - 0.6} height={(value / max) * 48} fill={colors[seriesIndex]} opacity={0.85} />;
      })) : values.map((row, seriesIndex) => <polyline key={seriesIndex} fill="none" stroke={colors[seriesIndex]} strokeWidth="1.8" strokeLinejoin="round" points={row.map((value, index) => `${12 + (index * 80) / Math.max(1, points - 1)},${60 - (value / max) * 48}`).join(" ")} />)}
    </svg>;
  }
  if (Array.isArray(panel.rows)) {
    const rows = (panel.rows as unknown[]).filter(Array.isArray).slice(0, 6) as unknown[][];
    const columns = Math.min(4, Math.max(1, ...rows.map((row) => row.length)));
    return <svg viewBox="0 0 100 70" className="bl-visual" aria-hidden="true">{rows.map((row, rowIndex) => Array.from({ length: columns }, (_, column) => <rect key={`${rowIndex}-${column}`} x={8 + column * (84 / columns)} y={6 + rowIndex * 10} width={84 / columns - 1.5} height={8.5} fill={rowIndex === 0 ? "#f3c7a4" : column === 0 ? "#fde6d3" : "#fff7ef"} stroke="#f0d2b8" strokeWidth="0.4" />))}</svg>;
  }
  if (Array.isArray(panel.steps)) {
    const steps = (panel.steps as unknown[]).slice(0, 6);
    return <svg viewBox="0 0 100 70" className="bl-visual" aria-hidden="true">{steps.map((_, index) => {
      const x = 10 + (index % 3) * 30, y = 12 + Math.floor(index / 3) * 30;
      return <g key={index}><rect x={x} y={y} width="20" height="16" rx="3" fill="#e5efff" stroke="#528add" strokeWidth="0.8" />{index < steps.length - 1 && index % 3 !== 2 && <path d={`M${x + 21} ${y + 8} h7`} stroke="#528add" strokeWidth="1" markerEnd="" />}</g>;
    })}</svg>;
  }
  if (Array.isArray(panel.snapshots)) {
    const features = ((panel.snapshots as Record<string, unknown>[])[0]?.features as Record<string, unknown>[] | undefined ?? []).slice(0, 14);
    return <svg viewBox="0 0 100 70" className="bl-visual is-map" aria-hidden="true"><rect x="4" y="4" width="92" height="62" fill="#eef6ee" stroke="#c4d7c4" />{features.map((feature, index) => <rect key={index} x={4 + (Number(feature.x) || 0) * 0.92} y={4 + (Number(feature.y) || 0) * 0.62} width={Math.max(2, (Number(feature.w) || 6) * 0.92)} height={Math.max(2, (Number(feature.h) || 6) * 0.62)} fill={["#cfe0f5", "#f6dcc4", "#d9ecd0", "#efd2e4"][index % 4]} stroke="#9fb3c4" strokeWidth="0.4" />)}</svg>;
  }
  return <TopicArt topic={String(visual.title ?? "chart")} className="bl-art" />;
}

export function SkillTabs({ skill }: { skill: string }) {
  return <nav className="bl-skill-tabs" aria-label="Kỹ năng IELTS">{catalogSkills.map((name) => {
    const config = librarySkills[name];
    const Icon = config.icon;
    return <Link key={name} href={config.href} className={`bl-tone-${config.tone}`} aria-current={name.toLowerCase() === skill ? "page" : undefined}><Icon size={16} /> {name}</Link>;
  })}</nav>;
}
