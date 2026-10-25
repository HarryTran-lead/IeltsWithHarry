"use client";

import Link from "next/link";
import { useState } from "react";
import {
  ArrowRight, AudioLines, BookOpen, ChartNoAxesCombined, Clock3, ExternalLink,
  FileText, Headphones, Languages, ListChecks, Mic, NotebookPen, Sparkles,
} from "lucide-react";
import type { StickerName } from "@/components/stickers/stickers";
import { PageHeader } from "@/components/ui/page-header";
import { useNotebook } from "@/features/notebook/notebook-store";
import type { IeltsSkill } from "./ielts-live-page";
import { useIeltsData } from "./use-ielts-data";
import { plannedModes } from "./planned-modes";
import "./ielts-dashboard.css";

const copy: Record<IeltsSkill, { title: string; intro: string; icon: typeof BookOpen; tone: string }> = {
  vocabulary: { title: "IELTS Vocabulary", intro: "Gặp từ trong ngữ cảnh bài mới, tra nghĩa và xây kho từ của riêng bạn.", icon: Languages, tone: "mint" },
  grammar: { title: "IELTS Grammar", intro: "Nhận diện cấu trúc trong câu thật, bắt đầu với các từ nối thường dùng khi viết và nói.", icon: ListChecks, tone: "lavender" },
  reading: { title: "IELTS Reading", intro: "Đọc bài toàn văn có nguồn rõ ràng và luyện điền từ theo dạng câu hỏi IELTS.", icon: BookOpen, tone: "peach" },
  listening: { title: "IELTS Listening", intro: "Nghe bản ghi tiếng Anh mới từ kho âm thanh công cộng và lưu ghi chú luyện nghe.", icon: Headphones, tone: "blue" },
  writing: { title: "IELTS Writing", intro: "Luyện Academic Task 1 bằng số liệu thật và Task 2 bằng chủ đề thời sự.", icon: NotebookPen, tone: "yellow" },
  speaking: { title: "IELTS Speaking", intro: "Chuẩn bị ý, bấm giờ và ghi âm với cue card từ các chủ đề đang diễn ra.", icon: Mic, tone: "pink" },
};
const skillOrder: IeltsSkill[] = ["vocabulary", "grammar", "reading", "listening", "writing", "speaking"];
const skillStickers: Record<IeltsSkill, StickerName> = { vocabulary: "abc", grammar: "pencil", reading: "book", listening: "headphones", writing: "chart", speaking: "mic" };

type Mode = { title: string; detail: string; source: string; href: string; available: boolean; icon: typeof BookOpen; tag?: string; planned?: boolean };

export function IeltsSkillDashboard({ skill }: { skill: IeltsSkill }) {
  const [modeFilter, setModeFilter] = useState<"all" | "live" | "planned">("all");
  const { data, busy, error } = useIeltsData(skill);
  const { entries, visits, ready: notebookReady } = useNotebook();
  const config = copy[skill];
  const Icon = config.icon;
  const savedWords = entries.filter((entry) => entry.kind === "word");
  const savedWork = skill === "vocabulary"
    ? savedWords
    : entries.filter((entry) => entry.kind === "note" && entry.title.startsWith(skill === "writing" ? "IELTS Academic Writing" : config.title));
  const practiceVisits = visits.filter((visit) => visit.path.startsWith(`/app/${skill}/live`) || (skill === "writing" && visit.path.startsWith("/app/writing/task-")));
  const recent = savedWork.slice(0, 3);
  const articles = data?.articles ?? [];
  const audio = data?.audio ?? [];
  const chart = data?.chart ?? [];
  const hasArticle = articles.length > 0;
  const hasGrammar = articles.some((article) => /\b(although|however|because|whereas|while|therefore|despite|since|moreover|nevertheless)\b/i.test(article.text));
  const latestArticle = articles[0];
  const latestYear = chart.length ? Math.max(...chart.map((point) => point.year)) : null;
  const latest = skill === "listening" ? "Kiểm tra trực tiếp" : skill === "writing" ? (latestYear ? `Số liệu ${latestYear}` : "Chưa có số liệu") : latestArticle ? new Date(latestArticle.publishedAt).toLocaleDateString("vi-VN") : "Chưa có bài";
  const sourceCount = skill === "listening" ? audio.length : skill === "writing" ? chart.length : articles.length;
  const sourceUnit = skill === "listening" ? "bản ghi có audio" : skill === "writing" ? "mốc dữ liệu" : "bài toàn văn gần nhất";

  const modes: Mode[] = skill === "vocabulary" ? [
    { title: "Từ trong bài mới", detail: "Chọn từ trong bài đọc hiện tại, tra định nghĩa và lưu ví dụ có nguồn.", source: "Daily News + từ điển mở", href: "/app/vocabulary/live", available: hasArticle, icon: Sparkles, tag: "Tự cập nhật" },
    { title: "Kho từ & thẻ ôn", detail: "Học bộ từ đã biên soạn và xem lại các từ đã lưu.", source: "Kho từ của IeltsWithHarry", href: "/app/vocabulary/overview", available: true, icon: Languages },
    { title: "Tra cứu từ", detail: "Tra nghĩa, từ loại, phiên âm và lưu vào sổ tay.", source: "FreeDictionaryAPI / Wiktionary", href: "/app/vocabulary/explore", available: true, icon: BookOpen },
  ] : skill === "grammar" ? [
    { title: "Từ nối trong ngữ cảnh", detail: "Đọc câu trích từ bài nguồn và điền lại từ nối chính xác.", source: "Daily News toàn văn", href: "/app/grammar/live", available: hasGrammar, icon: ListChecks, tag: "Có đáp án" },
  ] : skill === "reading" ? [
    { title: "Sentence completion", detail: "Đọc văn bản thật và điền một từ được rút từ chính câu nguồn.", source: "Daily News toàn văn", href: "/app/reading/live", available: hasArticle, icon: FileText, tag: "Có đáp án" },
    { title: "Đọc toàn văn", detail: "Mở bài gốc trong kho Daily News để đọc sâu và lưu từ.", source: latestArticle?.publisher ?? "Daily News", href: latestArticle ? `/app/news/${latestArticle.id}` : "/app/news", available: hasArticle, icon: BookOpen },
  ] : skill === "listening" ? [
    { title: "Nghe và ghi ý chính", detail: "Chọn bản ghi đã kiểm tra file, nghe rồi lưu ghi chú vào Sổ tay.", source: "LibriVox · public domain", href: "/app/listening/live", available: audio.length > 0, icon: AudioLines, tag: "Audio mới" },
  ] : skill === "writing" ? [
    { title: "Academic Task 1", detail: "Mô tả và so sánh biểu đồ dân số từ số liệu World Bank.", source: `World Bank · ${latestYear ?? "đang tải"}`, href: "/app/writing/task-1", available: chart.length >= 2, icon: ChartNoAxesCombined, tag: "Dữ liệu thật" },
    { title: "Academic Task 2", detail: "Viết essay theo một chủ đề rút từ bài mới được phép dùng.", source: "Daily News toàn văn", href: "/app/writing/task-2", available: hasArticle, icon: NotebookPen },
  ] : [
    { title: "Part 2 cue card", detail: "Chuẩn bị 1 phút, nói tối đa 2 phút, ghi âm và tự nghe lại.", source: "Chủ đề từ Daily News", href: "/app/speaking/live", available: hasArticle, icon: Mic, tag: "Có ghi âm" },
    { title: "Part 3 follow-up", detail: "Thảo luận sâu về cùng chủ đề và lưu tự nhận xét.", source: "Chủ đề từ Daily News", href: "/app/speaking/live", available: hasArticle, icon: ListChecks },
  ];
  const allModes: Mode[] = [
    ...modes,
    ...plannedModes[skill].map((mode) => ({
      title: mode.title, detail: mode.detail, source: mode.source,
      href: `/app/${skill}/mode/${mode.id}`, available: false,
      icon: mode.icon, planned: true,
    })),
  ];
  const availableModes = modes.filter((mode) => mode.available);
  const displayedModes = allModes.filter((mode) => modeFilter === "all" || (modeFilter === "live" ? !mode.planned : mode.planned));

  return <main className={`ielts-dashboard ielts-dashboard-${config.tone}`}>
    <PageHeader eyebrow={<><Icon size={12} /> KỸ NĂNG {String(skillOrder.indexOf(skill) + 1).padStart(2, "0")} / 06</>} title={config.title} description={config.intro} sticker={skillStickers[skill]}
      actions={<><a className="page-head-link" href="https://ielts.org/take-a-test/preparation-resources/sample-test-questions" target="_blank" rel="noreferrer">Đề mẫu IELTS <ExternalLink size={14}/></a>{availableModes[0] ? <Link className="ielts-dashboard-start" href={availableModes[0].href}>Bắt đầu học <ArrowRight size={17}/></Link> : <span className="ielts-dashboard-wait">Đang chờ dữ liệu nguồn</span>}</>} />

    <div className="ielts-dashboard-section-head"><div><span className="ielts-dashboard-kicker">TỔNG QUAN</span><h2>Tiến độ của bạn</h2></div><Link href="/app/notebook">Xem Sổ tay <ArrowRight size={15}/></Link></div>
    <div className="ielts-dashboard-stats">
      <Stat icon={FileText} value={busy ? "…" : String(sourceCount)} label={sourceUnit} note="Nguồn đang hiển thị"/>
      <Stat icon={ListChecks} value={notebookReady ? String(savedWork.length) : "…"} label={skill === "vocabulary" ? "từ đã lưu" : "bài/ghi chú đã lưu"} note="Trong tài khoản của bạn"/>
      <Stat icon={Clock3} value={notebookReady ? String(practiceVisits.length) : "…"} label="lượt mở bài gần đây" note="Theo lịch sử học"/>
      <Stat icon={ChartNoAxesCombined} value={busy ? "…" : latest} label="mốc dữ liệu mới" note={skill === "listening" ? "LibriVox" : skill === "writing" ? "World Bank" : "Daily News"}/>
    </div>

    <div className="ielts-dashboard-section-head"><div><span className="ielts-dashboard-kicker">CHẾ ĐỘ HỌC</span><h2>Lộ trình luyện {config.title}</h2><p>{allModes.length} chế độ trong kế hoạch. Thẻ có nhãn “Sắp triển khai” là bản xem trước giao diện.</p></div><strong>{busy ? "Đang kiểm tra…" : `${availableModes.length} đang dùng · ${plannedModes[skill].length} dự kiến`}</strong></div>
    <div className="ielts-dashboard-mode-filters" role="group" aria-label="Lọc chế độ học">
      <button type="button" className={modeFilter === "all" ? "active" : ""} aria-pressed={modeFilter === "all"} onClick={() => setModeFilter("all")}>Tất cả <span>{allModes.length}</span></button>
      <button type="button" className={modeFilter === "live" ? "active" : ""} aria-pressed={modeFilter === "live"} onClick={() => setModeFilter("live")}>Đang có <span>{modes.length}</span></button>
      <button type="button" className={modeFilter === "planned" ? "active" : ""} aria-pressed={modeFilter === "planned"} onClick={() => setModeFilter("planned")}>Sắp triển khai <span>{plannedModes[skill].length}</span></button>
    </div>
    {error && <div className="ielts-dashboard-notice">{error} Hãy tải lại trang để kiểm tra nguồn.</div>}
    {data?.warnings.map((warning) => <div className="ielts-dashboard-notice" key={warning}>{warning}</div>)}
    <div className="ielts-dashboard-modes">{displayedModes.map((mode) => <article className={`ielts-dashboard-mode ${mode.planned ? "planned" : mode.available ? "" : "disabled"}`} key={mode.title}><div className="ielts-dashboard-mode-top"><span className="ielts-dashboard-mode-icon"><mode.icon size={23}/></span><span className="ielts-dashboard-mode-number">{String(allModes.indexOf(mode) + 1).padStart(2, "0")}</span></div><div><div className="ielts-dashboard-mode-title"><h3>{mode.title}</h3>{mode.planned ? <span className="ielts-dashboard-planned-tag">Sắp triển khai</span> : mode.tag && mode.available ? <span>{mode.tag}</span> : null}</div><p>{mode.detail}</p></div><div className="ielts-dashboard-mode-bottom"><small>{mode.source}</small>{mode.planned ? <Link href={mode.href} className="ielts-dashboard-preview-link" aria-label={`Xem trước ${mode.title}`}>Xem trước <ArrowRight size={16}/></Link> : mode.available ? <Link href={mode.href} aria-label={`Mở ${mode.title}`}><ArrowRight size={19}/></Link> : <span>Chờ dữ liệu</span>}</div></article>)}</div>

    <div className="ielts-dashboard-bottom"><section className="ielts-dashboard-detail"><div className="ielts-dashboard-detail-head"><span className="ielts-dashboard-kicker">NGUỒN ĐANG KẾT NỐI</span><span className={`ielts-dashboard-dot ${sourceCount > 0 ? "online" : ""}`}/></div><h2>{skill === "listening" ? "LibriVox" : skill === "writing" ? "World Bank + Daily News" : skill === "vocabulary" ? "Daily News + từ điển mở" : "Daily News toàn văn"}</h2><p>{skill === "listening" ? `${audio.length} bản ghi tiếng Anh có file nghe hợp lệ trong nhóm mới nhất.` : skill === "writing" ? `${chart.length} mốc dân số, mới nhất năm ${latestYear ?? "—"}; ${articles.length} bài toàn văn gần đây cho Task 2.` : `${articles.length} bài toàn văn gần nhất đã được xuất bản và kiểm tra quyền.`}</p><div className="ielts-dashboard-check"><span>{busy ? "Đang kiểm tra" : data ? `Kiểm tra lúc ${new Date(data.checkedAt).toLocaleString("vi-VN")}` : "Chưa có dữ liệu"}</span><span>Không cần AI key</span></div></section><section className="ielts-dashboard-detail"><span className="ielts-dashboard-kicker">LỊCH SỬ HỌC</span><h2>Gần đây của bạn</h2>{recent.length ? <ul>{recent.map((item) => <li key={item.id}><span>{item.title}</span><small>{new Date(item.createdAt).toLocaleDateString("vi-VN")}</small></li>)}</ul> : <div className="ielts-dashboard-empty">Chưa có bài hoặc ghi chú nào. Bắt đầu một chế độ học để xây lịch sử học của bạn.</div>}<Link href="/app/notebook">Mở lịch sử trong Sổ tay <ArrowRight size={15}/></Link></section></div>
    <p className="ielts-dashboard-disclaimer">Các hoạt động được tạo theo định dạng luyện IELTS Academic từ nguồn được phép dùng. Điểm các câu ngắn không phải điểm band IELTS.</p>
  </main>;
}

function Stat({ icon: Icon, value, label, note }: { icon: typeof FileText; value: string; label: string; note: string }) {
  return <div className="ielts-dashboard-stat"><span><Icon size={19}/></span><strong>{value}</strong><b>{label}</b><small>{note}</small></div>;
}
