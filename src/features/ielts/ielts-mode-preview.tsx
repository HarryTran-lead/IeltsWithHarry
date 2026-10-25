"use client";

import Link from "next/link";
import { ArrowLeft, ArrowRight, CheckCircle2, Database, LockKeyhole } from "lucide-react";
import type { IeltsSkill } from "./ielts-live-page";
import { plannedModes } from "./planned-modes";
import "./ielts-dashboard.css";

const skillNames: Record<IeltsSkill, string> = {
  vocabulary: "Vocabulary", grammar: "Grammar", reading: "Reading",
  listening: "Listening", writing: "Writing", speaking: "Speaking",
};

export function IeltsModePreview({ skill, modeId }: { skill: IeltsSkill; modeId: string }) {
  const mode = plannedModes[skill].find((item) => item.id === modeId);
  if (!mode) return <main className="ielts-mode-preview"><h1>Không tìm thấy chế độ học</h1><Link href={`/app/${skill}`}>Quay lại {skillNames[skill]}</Link></main>;
  const Icon = mode.icon;

  return <main className="ielts-mode-preview">
    <Link className="ielts-mode-preview-back" href={`/app/${skill}`}><ArrowLeft size={18} /> Dashboard {skillNames[skill]}</Link>
    <section className="ielts-mode-preview-hero">
      <div><span className="ielts-dashboard-kicker">IELTSWITHHARRY / {skillNames[skill].toUpperCase()}</span><span className="ielts-mode-preview-status">Sắp triển khai</span>
        <h1>{mode.title}</h1><p>{mode.detail}</p>
        <div className="ielts-mode-preview-source"><Database size={17} /> Nguồn nội dung: {mode.source}</div>
      </div>
      <div className="ielts-mode-preview-art"><Icon size={72} strokeWidth={1.5} /><span>CHẾ ĐỘ HỌC SẮP TỚI</span></div>
    </section>
    <section className="ielts-mode-preview-layout">
      <div className="ielts-mode-preview-panel"><span className="ielts-dashboard-kicker">LUỒNG HỌC DỰ KIẾN</span><h2>Một buổi luyện sẽ diễn ra thế nào?</h2><div className="ielts-mode-preview-steps">{mode.steps.map((step, index) => <div key={step}><span>{String(index + 1).padStart(2, "0")}</span><div><h3>{step}</h3><p>{index === 0 ? "Bắt đầu từ nội dung phù hợp với mục tiêu học." : index === 1 ? "Thực hành trực tiếp trên bài học." : "Lưu kết quả vào lịch sử học của bạn."}</p></div>{index < mode.steps.length - 1 && <ArrowRight size={18} />}</div>)}</div></div>
      <aside className="ielts-mode-preview-panel ielts-mode-preview-requirement"><span className="ielts-dashboard-kicker">ĐIỀU KIỆN MỞ CHẾ ĐỘ</span><h2>Dữ liệu cần chuẩn bị</h2><p>{mode.needs}</p><div className="ielts-mode-preview-note"><LockKeyhole size={20} /><span>Chế độ này đang là bản xem trước. Khi nội dung và phần lưu kết quả hoàn chỉnh, nút bắt đầu học sẽ xuất hiện tại đây.</span></div><Link href={`/app/${skill}`}>Xem các chế độ đang dùng <ArrowRight size={16} /></Link></aside>
    </section>
    <div className="ielts-mode-preview-footer"><CheckCircle2 size={18} /> Các chế độ đang dùng vẫn có thể mở từ dashboard {skillNames[skill]}.</div>
  </main>;
}
