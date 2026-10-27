"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { ArrowRight, BookOpen, Headphones, Mic, NotebookPen } from "lucide-react";
import { balancedCatalog, catalogGroups, catalogHref, catalogSkills, type CatalogExam, type CatalogSkill } from "@/lib/ielts-bank/catalog";
import { BankLibrary, ExamCard } from "./bank-library";
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

export function BankCatalog() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const skill = catalogSkills.find((value) => value === searchParams.get("skill"));
  const [exams, setExams] = useState<CatalogExam[]>([]);
  const [history, setHistory] = useState<{ id: string; exam_id: string; state: string; score: number | null; total: number | null; ielts_exams: { title: string } }[]>([]);
  const [loading, setLoading] = useState(true), [error, setError] = useState("");

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

  function choose(nextSkill?: CatalogSkill, nextType?: string) {
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
      const previews = balancedCatalog(data, catalogGroups[name].map((group) => group.id)).slice(0, name === "Writing" || name === "Speaking" ? 2 : 3);
      return <section className={`bank-overview-panel bank-tone-${config.tone}`} key={name}>
        <div className="bank-overview-heading"><span className="bank-overview-icon"><Icon size={24} aria-hidden="true" /></span><div><span className="bank-catalog-kicker">{data.length} ĐỀ LUYỆN</span><h2>{config.title}</h2><p>{config.detail}</p></div></div>
        <div className="bank-overview-groups">{catalogGroups[name].filter((group) => groupCount(data, group.id)).map((group) => <Link key={group.id} href={catalogHref(name, group.id)}>{group.label}<b>{groupCount(data, group.id)}</b></Link>)}</div>
        <div className={`bank-overview-previews bl-grid bl-grid-${name.toLowerCase()}`}>{previews.map((exam) => <ExamCard key={exam.id} exam={exam} attempt={history.find((item) => item.exam_id === exam.id)} />)}</div>
        <Link className="bank-overview-more" href={catalogHref(name)}>Xem tất cả đề {name} <ArrowRight size={17} /></Link>
      </section>;
    })}</div>}

    {skill && <BankLibrary skill={skill} />}

    {history.length > 0 && <section className="bank-history"><h2>Bài bạn đã làm</h2><div>{history.slice(0, 5).map((item) => <Link key={item.id} href={item.state === "in_progress" ? `/app/question-bank/attempt/${item.id}` : `/app/question-bank/result/${item.id}`}><span>{item.ielts_exams?.title || "Bài luyện"}</span><small>{item.state === "in_progress" ? "Đang làm" : item.score === null ? "Chờ chấm thủ công" : `${item.score}/${item.total}`}</small><ArrowRight size={16} /></Link>)}</div></section>}
  </main>;
}
