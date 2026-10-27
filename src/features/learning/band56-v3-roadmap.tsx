"use client";

import curriculum from "@/content/course-packages/band-5-6-v3/curriculum_v3.json";
import "./band56-v3-roadmap.css";

export function Band56V3Roadmap() {
  return <section className="card section-card b56-roadmap" aria-label="Lộ trình IELTS Builder V3">
    <div><span className="eyebrow">IELTS BUILDER 5.0–6.0 · V3</span><h2>Lộ trình 8 unit</h2><p>20 tuần gợi ý, khoảng 7,5 giờ mỗi tuần. Unit 1 có bài luyện gốc; 7 unit tiếp theo là kế hoạch nội dung đang biên soạn.</p></div>
    <div className="b56-roadmap-grid">{curriculum.units.map((unit) => <details key={unit.id}>
      <summary><span>Unit {unit.order}</span><strong>{unit.name}</strong><small>{unit.order === 1 ? "6 bài pilot đã mở" : "Bản thiết kế · chưa mở"}</small></summary>
      <p>{unit.objective}</p><ol>{unit.lesson_plan.map((lesson) => <li key={lesson.id}><b>{lesson.name}</b><small>{lesson.deliverable}</small></li>)}</ol>
    </details>)}</div>
    <small>Đây là lộ trình học nội bộ, không dự đoán band và không phải tài liệu IELTS chính thức.</small>
  </section>;
}
