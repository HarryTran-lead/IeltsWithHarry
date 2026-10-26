"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpen, Headphones, Mic, NotebookPen, Search } from "lucide-react";
import { balancedCatalog, catalogGroups, catalogHref, catalogSkills, type CatalogExam, type CatalogSkill } from "@/lib/ielts-bank/catalog";
import "./bank.css";

const skillCopy = {
  Reading: { icon: BookOpen, title: "Reading", detail: "Đọc hiểu và luyện câu hỏi có đáp án", tone: "reading" },
  Listening: { icon: Headphones, title: "Listening", detail: "Nghe bài có âm thanh và làm câu hỏi", tone: "listening" },
  Writing: { icon: NotebookPen, title: "Writing", detail: "Chọn đúng Task 1 hoặc Task 2 để viết", tone: "writing" },
  Speaking: { icon: Mic, title: "Speaking", detail: "Luyện theo Part 1, Part 2 và Part 3", tone: "speaking" },
} as const;

async function loadCatalog(skill?: CatalogSkill): Promise<CatalogExam[]> {
  const response = await fetch(`/api/ielts/bank/catalog${skill ? `?skill=${skill}` : ""}`, { cache: "no-store" });
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || "Chưa tải được ngân hàng đề.");
  return data.exams || [];
}

function groupCount(exams: CatalogExam[], type: string) {
  return exams.filter((exam) => exam.practice_type === type).length;
}

function typeLabel(exam: CatalogExam) {
  return catalogGroups[exam.skill].find((group) => group.id === exam.practice_type)?.label || "Bài luyện";
}

export function CatalogCard({ exam }: { exam: CatalogExam }) {
  return <Link className={`bank-catalog-card bank-tone-${skillCopy[exam.skill].tone}`} href={`/app/question-bank/exam/${exam.id}`}>
    <span className="bank-catalog-card-top"><span className="bank-type-badge">{typeLabel(exam)}</span><ArrowRight size={17} aria-hidden="true" /></span>
    <h3>{exam.title}</h3>
    <span className="bank-catalog-card-meta">{exam.format} <span aria-hidden="true">·</span> {exam.duration_minutes} phút</span>
    <span className="bank-catalog-card-source">{exam.attribution} · {exam.license}{exam.ai_generated ? " · Nội dung AI" : ""}</span>
  </Link>;
}

export function BankCatalog() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const skill = catalogSkills.find((value) => value === searchParams.get("skill"));
  const type = skill && catalogGroups[skill].some((group) => group.id === searchParams.get("type")) ? searchParams.get("type") || "" : "";
  const [exams, setExams] = useState<CatalogExam[]>([]);
  const [history, setHistory] = useState<{ id: string; state: string; score: number | null; total: number | null; ielts_exams: { title: string } }[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState(""), [query, setQuery] = useState(""), [page, setPage] = useState(0);

  useEffect(() => {
    let live = true;
    void Promise.all([
      loadCatalog(),
      fetch("/api/ielts/bank/attempt").then(async (response) => response.ok ? (await response.json()).attempts || [] : []),
    ]).then(([catalog, attempts]) => { if (live) { setExams(catalog); setHistory(attempts); } })
      .catch((cause) => { if (live) setError(String(cause)); })
      .finally(() => { if (live) setLoading(false); });
    return () => { live = false; };
  }, []);
  const counts = useMemo(() => Object.fromEntries(catalogSkills.map((name) => [name, exams.filter((exam) => exam.skill === name).length])) as Record<CatalogSkill, number>, [exams]);
  const skillExams = skill ? exams.filter((exam) => exam.skill === skill) : [];
  const filtered = skillExams.filter((exam) => (!type || exam.practice_type === type) && (!query || exam.title.toLocaleLowerCase().includes(query.toLocaleLowerCase())));
  const ordered = skill && !type ? balancedCatalog(filtered, catalogGroups[skill].map((group) => group.id)) : filtered;
  const pageSize = 12, pageCount = Math.max(1, Math.ceil(ordered.length / pageSize));
  const currentPage = Math.min(page, pageCount - 1);
  const visible = ordered.slice(currentPage * pageSize, (currentPage + 1) * pageSize);

  function choose(nextSkill?: CatalogSkill, nextType?: string) {
    setPage(0);
    setQuery("");
    router.push(nextSkill ? catalogHref(nextSkill, nextType) : "/app/question-bank");
  }

  return <main className="bank-page bank-catalog">
    <div className="bank-catalog-breadcrumb"><Link href="/app/dashboard">Tổng quan</Link><span>/</span> Ngân hàng IELTS</div>
    <header className="bank-catalog-hero">
      <div><span className="bank-catalog-kicker">IELTSWITHHARRY / LUYỆN ĐỀ</span><h1>{skill ? `Luyện ${skill} theo dạng bài` : "Chọn kỹ năng, luyện đúng dạng bài"}</h1><p>Bài luyện có nguồn rõ ràng, lưu tiến độ và xem lại bài làm. Nội dung dùng để luyện tập, không phải đề thi chính thức.</p></div>
      <div className="bank-catalog-total"><strong>{loading ? "…" : exams.length.toLocaleString("vi-VN")}</strong><span>đề đã xuất bản</span></div>
    </header>

    <nav className="bank-skill-tabs" aria-label="Chọn kỹ năng IELTS">
      <button type="button" className={!skill ? "active" : ""} aria-current={!skill ? "page" : undefined} onClick={() => choose()}>Tổng quan <b>{exams.length}</b></button>
      {catalogSkills.map((name) => { const Icon = skillCopy[name].icon; return <button type="button" key={name} className={skill === name ? `active bank-tone-${skillCopy[name].tone}` : ""} aria-current={skill === name ? "page" : undefined} onClick={() => choose(name)}><Icon size={17} aria-hidden="true" /> {name} <b>{counts[name]}</b></button>; })}
    </nav>

    {loading && <p className="bank-catalog-state" role="status">Đang tải các bài luyện…</p>}
    {error && <p className="bank-catalog-state" role="alert">{error}</p>}

    {!loading && !error && !skill && <div className="bank-overview-grid">{catalogSkills.map((name) => {
      const data = exams.filter((exam) => exam.skill === name), config = skillCopy[name], Icon = config.icon;
      const previews = balancedCatalog(data, catalogGroups[name].map((group) => group.id)).slice(0, 3);
      return <section className={`bank-overview-panel bank-tone-${config.tone}`} key={name}>
        <div className="bank-overview-heading"><span className="bank-overview-icon"><Icon size={24} aria-hidden="true" /></span><div><span className="bank-catalog-kicker">{data.length} ĐỀ LUYỆN</span><h2>{config.title}</h2><p>{config.detail}</p></div></div>
        <div className="bank-overview-groups">{catalogGroups[name].filter((group) => groupCount(data, group.id)).map((group) => <Link key={group.id} href={catalogHref(name, group.id)}>{group.label}<b>{groupCount(data, group.id)}</b></Link>)}</div>
        <div className="bank-overview-previews">{previews.map((exam) => <CatalogCard key={exam.id} exam={exam} />)}</div>
        <Link className="bank-overview-more" href={catalogHref(name)}>Xem tất cả đề {name} <ArrowRight size={17} /></Link>
      </section>;
    })}</div>}

    {!loading && !error && skill && <section className={`bank-skill-list bank-tone-${skillCopy[skill].tone}`}>
      <div className="bank-skill-list-heading"><div><span className="bank-catalog-kicker">{skill.toUpperCase()} / NGÂN HÀNG ĐỀ</span><h2>{counts[skill]} bài luyện {skill}</h2><p>Chọn dạng bài bên dưới. Mục “Tất cả” xếp luân phiên các dạng bài trước khi phân trang.</p></div><Link href={`/app/${skill.toLowerCase()}`}>Về trang {skill} <ArrowRight size={16} /></Link></div>
      <div className="bank-type-tabs" role="group" aria-label={`Lọc dạng bài ${skill}`}>
        <button type="button" className={!type ? "active" : ""} aria-pressed={!type} onClick={() => choose(skill)}>Tất cả <b>{counts[skill]}</b></button>
        {catalogGroups[skill].filter((group) => groupCount(skillExams, group.id)).map((group) => <button type="button" className={type === group.id ? "active" : ""} aria-pressed={type === group.id} key={group.id} onClick={() => choose(skill, group.id)}>{group.label} <b>{groupCount(skillExams, group.id)}</b></button>)}
      </div>
      {type && <p className="bank-type-description">{catalogGroups[skill].find((group) => group.id === type)?.detail}</p>}
      <div className="bank-list-tools"><label><Search size={17} aria-hidden="true" /><input type="search" value={query} onChange={(event) => { setQuery(event.target.value); setPage(0); }} placeholder={`Tìm đề ${skill}…`} aria-label={`Tìm đề ${skill}`} /></label><span>{ordered.length} bài phù hợp</span></div>
      <div className="bank-catalog-grid">{visible.map((exam) => <CatalogCard key={exam.id} exam={exam} />)}</div>
      {!visible.length && <p className="bank-catalog-state">Chưa có bài phù hợp. Thử chọn dạng bài khác.</p>}
      {pageCount > 1 && <nav className="bank-pagination" aria-label="Phân trang đề"><button type="button" disabled={currentPage === 0} onClick={() => setPage(currentPage - 1)}>← Trang trước</button><span>Trang {currentPage + 1} / {pageCount}</span><button type="button" disabled={currentPage + 1 >= pageCount} onClick={() => setPage(currentPage + 1)}>Trang sau →</button></nav>}
    </section>}

    {history.length > 0 && <section className="bank-history"><h2>Bài bạn đã làm</h2><div>{history.slice(0, 5).map((item) => <Link key={item.id} href={item.state === "in_progress" ? `/app/question-bank/attempt/${item.id}` : `/app/question-bank/result/${item.id}`}><span>{item.ielts_exams?.title || "Bài luyện"}</span><small>{item.state === "in_progress" ? "Đang làm" : item.score === null ? "Chờ chấm thủ công" : `${item.score}/${item.total}`}</small><ArrowRight size={16} /></Link>)}</div></section>}
  </main>;
}

export function BankSkillShelf({ skill }: { skill: CatalogSkill }) {
  const [exams, setExams] = useState<CatalogExam[]>([]), [loading, setLoading] = useState(true), [error, setError] = useState(false);
  useEffect(() => { let live = true; void loadCatalog(skill).then((data) => { if (live) setExams(data); }).catch(() => { if (live) setError(true); }).finally(() => { if (live) setLoading(false); }); return () => { live = false; }; }, [skill]);
  const groups = catalogGroups[skill].filter((group) => groupCount(exams, group.id));
  const previews = balancedCatalog(exams, catalogGroups[skill].map((group) => group.id)).slice(0, 3);
  return <section className={`bank-skill-shelf bank-tone-${skillCopy[skill].tone}`}>
    <div className="bank-shelf-heading"><div><span className="bank-catalog-kicker">NGÂN HÀNG ĐỀ ĐÃ DUYỆT</span><h2>Luyện {skill} theo dạng bài</h2><p>{loading ? "Đang tải kho đề…" : error ? "Chưa tải được kho đề. Mở ngân hàng để thử lại." : `${exams.length} bài luyện có thể làm ngay`}</p></div><Link href={catalogHref(skill)}>Xem tất cả <ArrowRight size={17} /></Link></div>
    {groups.length > 0 && <div className="bank-shelf-groups">{groups.map((group) => <Link key={group.id} href={catalogHref(skill, group.id)}><strong>{group.label}</strong><span>{group.detail}</span><b>{groupCount(exams, group.id)} bài <ArrowRight size={15} /></b></Link>)}</div>}
    {previews.length > 0 && <div className="bank-shelf-previews">{previews.map((exam) => <CatalogCard key={exam.id} exam={exam} />)}</div>}
  </section>;
}
