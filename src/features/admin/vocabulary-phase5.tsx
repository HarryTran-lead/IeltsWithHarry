"use client";

import { useEffect, useState } from "react";
import { LoadingBlock } from "@/components/layout/loading-block";
import { AdminCardHead, AdminNotice, AdminStat } from "./admin-ui";

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
      .catch((reason) => { if (!controller.signal.aborted) setError(reason instanceof Error ? reason.message : String(reason)); });
    return () => controller.abort();
  }, []);
  const number = (value: number) => value.toLocaleString("vi-VN");
  if (error) return <AdminNotice tone="error">{error}</AdminNotice>;
  if (!summary) return <section className="card admin-card"><LoadingBlock label="Đang tải tiến độ…" /></section>;
  return <div className="admin-stack">
    <div className="admin-stats-row">
      <AdminStat label="Mục CSV nguồn" value={number(summary.originalEntries)} hint={`${summary.sourceTopics} chủ đề nguồn`} />
      <AdminStat tone="teal" label="Đã xuất bản" value={number(summary.publishedNew)} hint="Mục biên soạn mới" />
      <AdminStat tone="sky" label="Đã duyệt" value={number(summary.approved + summary.packReviewed)} hint={`${number(summary.approved)} lô đầu · ${number(summary.packReviewed)} từ ZIP`} />
      <AdminStat tone="amber" label="Chờ rà soát" value={number(summary.proposed)} hint={`Mục tiêu dài hạn ${number(summary.targetNewUnique)} mục`} />
    </div>
    <section className="card admin-card">
      <AdminCardHead title="Tiến độ theo chủ đề học" count={summary.topics.length} description={`${summary.learningTopics} chủ đề học mở rộng, ${number(summary.topicPlacements)} lượt gắn chủ đề. Band trên kho IELTS là ước lượng để học.`} />
      <div className="admin-coverage is-topics">{summary.topics.map((topic) => <div className="admin-coverage-row" key={topic.title}><span title={topic.title}>{topic.title}</span><div className="admin-coverage-track"><i style={{ width: `${Math.min(100, topic.target ? topic.placements / topic.target * 100 : 0)}%` }} /></div><b>{topic.placements}/{topic.target}</b></div>)}</div>
    </section>
  </div>;
}
