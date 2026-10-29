"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, BookOpenText, Download, Headphones } from "lucide-react";
import { useNotebook } from "@/features/notebook/notebook-store";
import { starterBookCourse, starterSupplementById, starterSupplementUnits } from "@/lib/starter-supplement";
import { CourseBook } from "./course-book";
import "./starter-supplement-page.css";

export function StarterBookPage() {
  const { visits } = useNotebook();
  const opened = new Set(visits.map((visit) => visit.path));
  return <CourseBook
    course={starterBookCourse}
    isDone={(lesson) => opened.has(`/app/learn/ielts-starter/supplement/${lesson.unit_id.toLowerCase()}`)}
    hasChecks={false}
    finalCheckSlug=""
  />;
}

export function StarterSupplementPage({ unitId }: { unitId: string }) {
  const unit = starterSupplementById(unitId);
  if (!unit) return <div className="content-page starter-material"><Link href="/app/learn/ielts-starter">← Về sách IELTS Starter</Link><h1>Không tìm thấy học liệu unit này</h1></div>;
  const previous = starterSupplementUnits[unit.order - 2];
  const next = starterSupplementUnits[unit.order];

  return <div className="content-page starter-material">
    <Link className="starter-material-back" href="/app/learn/ielts-starter"><ArrowLeft size={17} /> Về sách IELTS Starter</Link>
    <header className="starter-material-hero">
      <span>IELTS STARTER · BAND 4.0–5.0 · UNIT {String(unit.order).padStart(2, "0")}</span>
      <h1>{unit.title}</h1>
      <p>{unit.summaryVi}</p>
      <div className="starter-material-facts"><b>{unit.activityCount} nhóm bài tập</b><b>{unit.itemCount} câu / hoạt động</b><b>{unit.tracks.length} bài nghe</b></div>
    </header>

    <section className="starter-material-skills" aria-label="Nội dung theo kỹ năng">
      {unit.skills.map((skill) => <article key={skill.name}>
        <span>{skill.name}</span><strong>{skill.count} nhóm bài tập</strong>
        <ul>{skill.examples.map((example) => <li key={example}>{example}</li>)}</ul>
      </article>)}
    </section>

    <section className="starter-material-sheet">
      <div className="starter-material-section-head"><div><BookOpenText size={21} /><h2>Sách bài tập của Unit {unit.order}</h2></div><a href={unit.pdfUrl} target="_blank" rel="noopener noreferrer"><Download size={16} /> Mở PDF đầy đủ</a></div>
      <p>Đọc nội dung và làm bài trong PDF. Dùng các bản ghi bên dưới cho phần Listening.</p>
      <iframe src={unit.pdfUrl} title={`Sách bài tập Unit ${unit.order}: ${unit.title}`} loading="lazy" />
    </section>

    <section className="starter-material-audio">
      <div className="starter-material-section-head"><div><Headphones size={21} /><h2>Audio luyện nghe</h2></div><span>{unit.tracks.length} track</span></div>
      <p>Audio trong gói nguồn là giọng máy dùng để luyện tập. Đối chiếu câu trả lời với nội dung bài học.</p>
      <div className="starter-material-tracks">{unit.tracks.map((track, index) => <div key={track.url}>
        <label htmlFor={`starter-track-${index}`}><b>{String(index + 1).padStart(2, "0")}</b><span>{track.title}</span></label>
        <audio id={`starter-track-${index}`} controls preload="none" src={track.url}>Trình duyệt của bạn không hỗ trợ audio.</audio>
      </div>)}</div>
    </section>
    <nav className="starter-material-pager" aria-label="Chuyển unit">
      {previous ? <Link href={`/app/learn/ielts-starter/supplement/${previous.id.toLowerCase()}`}><ArrowLeft size={17} /> Unit {previous.order}: {previous.title}</Link> : <span />}
      {next ? <Link href={`/app/learn/ielts-starter/supplement/${next.id.toLowerCase()}`}>Unit {next.order}: {next.title} <ArrowRight size={17} /></Link> : <span />}
    </nav>
  </div>;
}
