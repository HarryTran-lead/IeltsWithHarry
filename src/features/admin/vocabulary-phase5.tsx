"use client";

import { useEffect, useState } from "react";

type Summary = {
  sourceTopics: number; learningTopics: number; targetNewUnique: number;
  originalEntries: number; publishedNew: number; proposed: number; approved: number;
  packReviewed: number; topicPlacements: number;
  topics: { title: string; target: number; approved: number; placements: number }[];
};

export function VocabularyPhase5() {
  const [summary, setSummary] = useState<Summary | null>(null);
  const [error, setError] = useState("");
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/admin/vocabulary-phase5", { signal: controller.signal, cache: "no-store" })
      .then(async (response) => {
        const body = await response.json();
        if (!response.ok) throw new Error(body.error || "Không tải được tiến độ từ vựng.");
        setSummary(body);
      })
      .catch((reason) => { if (!controller.signal.aborted) setError(String(reason)); });
    return () => controller.abort();
  }, []);
  return <section className="admin-content-form">
    <h2>Tiến độ bộ IELTS theo chủ đề học</h2>
    {error && <p role="alert">{error}</p>}
    {!summary && !error && <p>Đang tải tiến độ…</p>}
    {summary && <>
      <p>{summary.originalEntries.toLocaleString("vi-VN")} mục CSV nguồn · {summary.publishedNew.toLocaleString("vi-VN")} mục biên soạn đã xuất bản · {summary.topicPlacements.toLocaleString("vi-VN")} lượt gắn chủ đề.</p>
      <p>{summary.approved} mục duyệt từ các lô đầu · {summary.packReviewed} mục duyệt từ ZIP mới · {summary.proposed} mục chờ rà soát.</p>
      <p>{summary.sourceTopics} chủ đề từ kho nguồn và {summary.learningTopics} chủ đề học mở rộng được giữ song song. Mục tiêu mới dài hạn: {summary.targetNewUnique.toLocaleString("vi-VN")} mục duy nhất.</p>
      <div className="admin-row"><strong>Chủ đề học</strong><strong>Gắn chủ đề / mục tiêu dài hạn</strong></div>
      {summary.topics.map((topic) => <div className="admin-row" key={topic.title}><span>{topic.title}</span><strong>{topic.placements} / {topic.target}</strong></div>)}
      <p>Band trên kho IELTS là ước lượng để học; trạng thái rà soát hiển thị riêng trên từng mục.</p>
    </>}
  </section>;
}
