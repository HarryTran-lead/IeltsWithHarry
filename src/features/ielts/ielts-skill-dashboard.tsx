"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowRight, AudioLines, BookOpen, ChartNoAxesCombined, Clock3, ExternalLink,
  FileText, Headphones, Languages, ListChecks, Mic, NotebookPen, Sparkles,
} from "lucide-react";
import { useNotebook } from "@/features/notebook/notebook-store";
import type { IeltsSkill } from "./ielts-live-page";
import { useIeltsData } from "./use-ielts-data";
import { plannedModes } from "./planned-modes";
import { BankLibrary } from "./bank-library";
import { SpeakingMockCta } from "./speaking-mock";
import { catalogHref, catalogSkills } from "@/lib/ielts-bank/catalog";
import { createClient } from "@/lib/supabase/browser";
import { demoMode, lockedLearnerPath, releaseLocks } from "@/lib/runtime";
import sourceTopics from "@/lib/vocabulary/source-topics.json";
import ieltsTopics from "@/lib/vocabulary/ielts-topics.json";
import { cefrLevels } from "@/lib/vocabulary/cefr-levels";
import { ieltsBands } from "@/lib/vocabulary/ielts-bands";
import "./ielts-dashboard.css";

const copy: Record<IeltsSkill, { title: string; intro: string; icon: typeof BookOpen; tone: string }> = {
  vocabulary: { title: "IELTS Vocabulary", intro: "Học với hai bộ từ A1–C2 và IELTS Band 1–7+.", icon: Languages, tone: "mint" },
  grammar: { title: "IELTS Grammar", intro: "Nhận diện cấu trúc trong câu thật, bắt đầu với các từ nối thường dùng khi viết và nói.", icon: ListChecks, tone: "lavender" },
  reading: { title: "IELTS Reading", intro: "Chọn Passage hoặc full đề, lọc theo dạng câu hỏi rồi bắt đầu luyện.", icon: BookOpen, tone: "peach" },
  listening: { title: "IELTS Listening", intro: "Chọn Section hoặc full đề, lọc theo dạng câu hỏi rồi bắt đầu nghe.", icon: Headphones, tone: "blue" },
  writing: { title: "IELTS Writing", intro: "Luyện Academic Task 1 bằng số liệu thật và Task 2 bằng chủ đề thời sự.", icon: NotebookPen, tone: "yellow" },
  speaking: { title: "IELTS Speaking", intro: "Chuẩn bị ý, bấm giờ và ghi âm với cue card từ các chủ đề đang diễn ra.", icon: Mic, tone: "pink" },
};

type Mode = { title: string; detail: string; source: string; href: string; available: boolean; icon: typeof BookOpen; tag?: string; planned?: boolean };

export function IeltsSkillDashboard({ skill }: { skill: IeltsSkill }) {
  const [modeFilter, setModeFilter] = useState<"all" | "live" | "planned">("all");
  const [selectedTopic, setSelectedTopic] = useState("");
  const [selectedLevel, setSelectedLevel] = useState("");
  const [selectedCollection, setSelectedCollection] = useState<"cefr" | "ielts">("cefr");
  const [vocabularyCount, setVocabularyCount] = useState<number | null>(null);
  const [ieltsVocabularyCount, setIeltsVocabularyCount] = useState<number | null>(null);
  useEffect(() => {
    const hash = window.location.hash;
    if (hash !== "#che-do-hoc" && hash !== "#ngan-hang-de") return;
    const frame = window.requestAnimationFrame(() => {
      document.getElementById(hash.slice(1))?.scrollIntoView({ block: "start" });
    });
    return () => window.cancelAnimationFrame(frame);
  }, [skill]);
  useEffect(() => {
    if (skill !== "vocabulary" || demoMode) return;
    let active = true;
    const db = createClient();
    void db.rpc("list_vocabulary_reference_by_level", {
      p_query: "", p_level: "", p_topic: "", p_page: 0,
    }).then(({ data, error }) => {
      if (active && !error) setVocabularyCount(Number(data?.[0]?.total_count ?? 0));
    });
    void db.from("ielts_vocabulary_entries").select("source_key", { count: "exact", head: true })
      .eq("published", true).then(({ count, error }) => {
        if (active && !error) setIeltsVocabularyCount(count ?? 0);
      });
    return () => { active = false; };
  }, [skill]);
  const { data, busy, error } = useIeltsData(skill);
  const { entries, visits, ready: notebookReady } = useNotebook();
  const config = copy[skill];
  const bankSkill = catalogSkills.find((value) => value.toLowerCase() === skill);
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
  const selectedVocabularyCount = selectedCollection === "ielts" ? ieltsVocabularyCount : vocabularyCount;
  const sourceCount = skill === "vocabulary" ? selectedVocabularyCount ?? 0 : skill === "listening" ? audio.length : skill === "writing" ? chart.length : articles.length;
  const sourceUnit = skill === "vocabulary" ? selectedCollection === "ielts" ? "từ IELTS" : "từ CEFR nguồn" : skill === "listening" ? "bản ghi có audio" : skill === "writing" ? "mốc dữ liệu" : "bài toàn văn gần nhất";
  const vocabularyQuery = new URLSearchParams();
  vocabularyQuery.set("collection", selectedCollection);
  if (selectedTopic) vocabularyQuery.set("topic", selectedTopic);
  if (selectedLevel) vocabularyQuery.set("level", selectedLevel);
  const vocabularyHref = `/app/vocabulary/library${vocabularyQuery.size ? `?${vocabularyQuery}` : ""}`;

  const modes: Mode[] = skill === "vocabulary" ? [
    { title: "Từ A1–C2", detail: "Học từ trong kho cũ theo sáu mức CEFR và chủ đề nguồn.", source: "Kho CEFR · 36 chủ đề", href: "/app/vocabulary/library?collection=cefr", available: true, icon: Languages, tag: "Học ngay" },
    { title: "Từ IELTS · Band 1–7+", detail: "Học 5.000 từ theo topic và band học gợi ý ước lượng.", source: "Kho IELTS · 25 chủ đề", href: "/app/vocabulary/library?collection=ielts", available: true, icon: Languages, tag: "Học ngay" },
    { title: "Từ trong bài mới", detail: "Chọn từ trong bài đọc hiện tại, tra định nghĩa và lưu ví dụ có nguồn.", source: "Daily News + từ điển mở", href: "/app/vocabulary/live", available: hasArticle, icon: Sparkles, tag: "Tự cập nhật" },
    { title: "Từ đã lưu & thẻ ôn", detail: "Xem lại từ bạn đã lưu và ôn theo tiến độ cá nhân.", source: "Sổ từ của bạn", href: "/app/vocabulary/overview", available: true, icon: Languages },
    { title: "Tra cứu từ", detail: "Tra nghĩa, từ loại, phiên âm và lưu vào sổ tay.", source: "FreeDictionaryAPI / Wiktionary", href: "/app/vocabulary/explore", available: true, icon: BookOpen },
  ] : skill === "grammar" ? [
    { title: "Từ nối trong ngữ cảnh", detail: "Đọc câu trích từ bài nguồn và điền lại từ nối chính xác.", source: "Daily News toàn văn", href: "/app/grammar/live", available: hasGrammar, icon: ListChecks, tag: "Có đáp án" },
  ] : skill === "reading" ? [
    { title: "Sentence completion", detail: "Đọc văn bản thật và điền một từ được rút từ chính câu nguồn.", source: "Daily News toàn văn", href: "/app/reading/live", available: hasArticle, icon: FileText, tag: "Có đáp án" },
    { title: "Đọc toàn văn", detail: "Mở bài gốc trong kho Daily News để đọc sâu và lưu từ.", source: latestArticle?.publisher ?? "Daily News", href: latestArticle ? `/app/news/${latestArticle.id}` : "/app/news", available: hasArticle, icon: BookOpen },
  ] : skill === "listening" ? [
    { title: "1.200 từ vựng Listening", detail: "Học theo 35 chủ đề, nghe chọn nghĩa và chép chính tả với ví dụ song ngữ.", source: "Bộ Listening do chủ dự án cung cấp", href: "/app/listening/vocabulary", available: true, icon: Languages, tag: "1.200 mục" },
    { title: "YouTube Shadowing & Listening Lab", detail: "Luyện shadowing, chép chính tả và câu hỏi với phụ đề được cấp quyền.", source: "Bài học do giáo viên xuất bản", href: "/app/listening/youtube", available: !lockedLearnerPath("/app/listening/youtube"), icon: Headphones, tag: "YouTube" },
    { title: "Nghe và ghi ý chính", detail: "Chọn bản ghi đã kiểm tra file, nghe rồi lưu ghi chú vào Sổ tay.", source: "LibriVox · public domain", href: "/app/listening/live", available: audio.length > 0, icon: AudioLines, tag: "Audio mới" },
  ] : skill === "writing" ? [
    { title: "Academic Task 1", detail: "Mô tả và so sánh biểu đồ dân số từ số liệu World Bank.", source: `World Bank · ${latestYear ?? "đang tải"}`, href: "/app/writing/task-1", available: chart.length >= 2, icon: ChartNoAxesCombined, tag: "Dữ liệu thật" },
    { title: "Academic Task 2", detail: "Viết essay theo một chủ đề rút từ bài mới được phép dùng.", source: "Daily News toàn văn", href: "/app/writing/task-2", available: hasArticle, icon: NotebookPen },
  ] : [
    { title: "Part 1 interview", detail: "Câu hỏi ngắn về bản thân, công việc, học tập và đời sống.", source: "Ngân hàng đề đã duyệt", href: "/app/speaking?type=part1", available: true, icon: Mic, tag: "Có ghi âm" },
    { title: "Part 2 cue card", detail: "Chuẩn bị 1 phút, nói tối đa 2 phút, ghi âm và tự nghe lại.", source: "Chủ đề từ Daily News", href: "/app/speaking/live", available: hasArticle, icon: Mic, tag: "Có ghi âm" },
    { title: "Part 3 follow-up", detail: "Thảo luận sâu về cùng chủ đề và lưu tự nhận xét.", source: "Chủ đề từ Daily News", href: "/app/speaking/part-3", available: hasArticle, icon: ListChecks },
  ];
  if (!demoMode && bankSkill) modes.unshift({ title: "Ngân hàng đề đã duyệt", detail: "Luyện với đề có nguồn, chọn đúng dạng bài và xem lại kết quả.", source: "BandReady · IELTS AI Dataset", href: catalogHref(bankSkill), available: true, icon: BookOpen, tag: "Đề luyện" });
  const allModes: Mode[] = [
    ...modes,
    ...(!releaseLocks ? plannedModes[skill] : []).map((mode) => ({
      title: mode.title, detail: mode.detail, source: mode.source,
      href: `/app/${skill}/mode/${mode.id}`, available: false,
      icon: mode.icon, planned: true,
    })),
  ];
  const availableModes = modes.filter((mode) => mode.available);
  const displayedModes = allModes.filter((mode) => modeFilter === "all" || (modeFilter === "live" ? mode.available : mode.planned));

  const showLibrary = !demoMode && Boolean(bankSkill);
  if (showLibrary && bankSkill && (skill === "reading" || skill === "listening")) {
    return <main className={`ielts-dashboard ielts-dashboard-${config.tone} has-library`}>
      <div className="ielts-dashboard-titlebar">
        <span className="ielts-dashboard-titlebar-icon"><Icon size={18} /></span>
        <h1>{config.title}</h1>
        <p title={config.intro}>{config.intro}</p>
        {skill === "listening" && <Link className="ielts-dashboard-start" href="/app/listening/vocabulary">Học 1.200 từ IELTS Listening <ArrowRight size={17} /></Link>}
      </div>
      <BankLibrary skill={bankSkill} />
    </main>;
  }
  return <main className={`ielts-dashboard ielts-dashboard-${config.tone} ${bankSkill ? "has-library" : ""}`}>
    <div className="ielts-dashboard-titlebar">
      <span className="ielts-dashboard-titlebar-icon"><Icon size={18} /></span>
      <h1>{config.title}</h1>
      <p title={config.intro}>{config.intro}</p>
      <a className="page-head-link" href="https://ielts.org/take-a-test/preparation-resources/sample-test-questions" target="_blank" rel="noreferrer">Đề mẫu IELTS <ExternalLink size={14}/></a>
      {availableModes[0] ? <Link className="ielts-dashboard-start" href={availableModes[0].href}>{skill === "vocabulary" ? "Khám phá từ vựng" : "Bắt đầu học"} <ArrowRight size={17}/></Link> : <span className="ielts-dashboard-wait">Đang chờ dữ liệu nguồn</span>}
    </div>

    {skill === "vocabulary" && <section className="ielts-vocab-picker" aria-labelledby="ielts-vocab-picker-title">
      <div className="ielts-vocab-picker-heading"><div><span className="ielts-dashboard-kicker">BẮT ĐẦU TẠI ĐÂY</span><h2 id="ielts-vocab-picker-title">Chọn bộ từ vựng</h2><p>Chọn bộ A1–C2 hoặc IELTS, rồi lọc theo topic và trình độ.</p></div><span className="ielts-vocab-picker-count">{selectedVocabularyCount === null ? "Đang tải kho từ…" : `${selectedVocabularyCount.toLocaleString("vi-VN")} từ đang mở`}</span></div>
      <div className="ielts-vocab-picker-controls">
        <label><span>1. Bộ từ</span><select value={selectedCollection} onChange={(event) => { setSelectedCollection(event.target.value as "cefr" | "ielts"); setSelectedTopic(""); setSelectedLevel(""); }}><option value="cefr">Từ A1–C2</option><option value="ielts">Từ IELTS · Band 1–7+</option></select></label>
        <label><span>2. Chọn chủ đề</span><select value={selectedTopic} onChange={(event) => setSelectedTopic(event.target.value)}><option value="">Tất cả {selectedCollection === "ielts" ? ieltsTopics.length : sourceTopics.length} chủ đề</option>{(selectedCollection === "ielts" ? ieltsTopics : sourceTopics).map((topic) => <option key={topic} value={topic}>{topic}</option>)}</select></label>
        <label><span>3. Chọn trình độ</span><select value={selectedLevel} onChange={(event) => setSelectedLevel(event.target.value)}><option value="">{selectedCollection === "ielts" ? "Mọi band gợi ý" : "Mọi mức CEFR"}</option>{(selectedCollection === "ielts" ? ieltsBands : cefrLevels).map((level) => <option key={level} value={level}>{selectedCollection === "ielts" ? `Band ${level}` : level}</option>)}</select></label>
        <Link className="ielts-vocab-picker-action" href={vocabularyHref}>Xem danh sách từ <ArrowRight size={18}/></Link>
      </div>
      <p className="ielts-vocab-picker-note">Band trong bộ IELTS là gợi ý ước lượng, không phải band IELTS chính thức của từng từ.</p>
    </section>}

    {/* The question bank leads the four exam skills; stats and other study modes follow. */}
    {skill === "speaking" && <SpeakingMockCta />}
    {showLibrary && bankSkill && <BankLibrary skill={bankSkill} />}

    <div className="ielts-dashboard-stats" aria-label="Tiến độ của bạn">
      <Stat icon={FileText} value={skill === "vocabulary" ? selectedVocabularyCount === null ? "…" : selectedVocabularyCount.toLocaleString("vi-VN") : busy ? "…" : String(sourceCount)} label={sourceUnit} note="Nguồn đang hiển thị"/>
      <Stat icon={ListChecks} value={notebookReady ? String(savedWork.length) : "…"} label={skill === "vocabulary" ? "từ đã lưu" : "bài/ghi chú đã lưu"} note="Trong tài khoản của bạn"/>
      <Stat icon={Clock3} value={notebookReady ? String(practiceVisits.length) : "…"} label="lượt mở bài gần đây" note="Theo lịch sử học"/>
      <Stat icon={ChartNoAxesCombined} value={skill === "vocabulary" ? String(selectedCollection === "ielts" ? ieltsTopics.length : sourceTopics.length) : busy ? "…" : latest} label={skill === "vocabulary" ? "chủ đề trong kho" : "mốc dữ liệu mới"} note={skill === "vocabulary" ? "Kho từ nguồn" : skill === "listening" ? "LibriVox" : skill === "writing" ? "World Bank" : "Daily News"}/>
      <Link className="ielts-dashboard-stats-link" href="/app/notebook">Xem Sổ tay <ArrowRight size={15}/></Link>
    </div>


    <div id="che-do-hoc" className="ielts-dashboard-modes-head">
    <h2 title={`${allModes.length} chế độ trong kế hoạch. Thẻ “Sắp triển khai” là bản xem trước giao diện.`}>Chế độ học</h2>
    <div className="ielts-dashboard-mode-filters" role="group" aria-label="Lọc chế độ học">
      <button type="button" className={modeFilter === "all" ? "active" : ""} aria-pressed={modeFilter === "all"} onClick={() => setModeFilter("all")}>Tất cả <span>{allModes.length}</span></button>
      <button type="button" className={modeFilter === "live" ? "active" : ""} aria-pressed={modeFilter === "live"} onClick={() => setModeFilter("live")}>Đang có <span>{availableModes.length}</span></button>
      {!releaseLocks && <button type="button" className={modeFilter === "planned" ? "active" : ""} aria-pressed={modeFilter === "planned"} onClick={() => setModeFilter("planned")}>Sắp triển khai <span>{plannedModes[skill].length}</span></button>}
    </div>
    <strong>{busy ? "Đang kiểm tra…" : releaseLocks ? `${availableModes.length} đang dùng` : `${availableModes.length} đang dùng · ${plannedModes[skill].length} dự kiến`}</strong>
    </div>
    {error && <div className="ielts-dashboard-notice">{error} Hãy tải lại trang để kiểm tra nguồn.</div>}
    {data?.warnings.map((warning) => <div className="ielts-dashboard-notice" key={warning}>{warning}</div>)}
    <div className="ielts-dashboard-modes">{displayedModes.map((mode) => <article className={`ielts-dashboard-mode ${mode.planned ? "planned" : mode.available ? "" : "disabled"}`} key={mode.title}><div className="ielts-dashboard-mode-top"><span className="ielts-dashboard-mode-icon"><mode.icon size={19}/></span><div className="ielts-dashboard-mode-title"><h3>{mode.title}</h3>{mode.planned ? <span className="ielts-dashboard-planned-tag">Sắp triển khai</span> : mode.tag && mode.available ? <span>{mode.tag}</span> : null}</div><span className="ielts-dashboard-mode-number">{String(allModes.indexOf(mode) + 1).padStart(2, "0")}</span></div><p>{mode.detail}</p><div className="ielts-dashboard-mode-bottom"><small>{mode.source}</small>{mode.planned ? <Link href={mode.href} className="ielts-dashboard-preview-link" aria-label={`Xem trước ${mode.title}`}>Xem trước <ArrowRight size={16}/></Link> : mode.available ? <Link href={mode.href} aria-label={`Mở ${mode.title}`}><ArrowRight size={19}/></Link> : <span>Chờ dữ liệu</span>}</div></article>)}</div>

    <div className="ielts-dashboard-bottom"><section className="ielts-dashboard-detail"><div className="ielts-dashboard-detail-head"><span className="ielts-dashboard-kicker">NGUỒN ĐANG KẾT NỐI</span><span className={`ielts-dashboard-dot ${sourceCount > 0 ? "online" : ""}`}/></div><h2>{skill === "listening" ? "LibriVox" : skill === "writing" ? "World Bank + Daily News" : skill === "vocabulary" ? "Hai bộ từ A1–C2 và IELTS" : "Daily News toàn văn"}</h2><p>{skill === "vocabulary" ? `Bộ A1–C2: ${vocabularyCount === null ? "đang tải" : vocabularyCount.toLocaleString("vi-VN") + " từ"} trong ${sourceTopics.length} chủ đề; bộ IELTS: ${ieltsVocabularyCount === null ? "đang tải" : ieltsVocabularyCount.toLocaleString("vi-VN") + " từ"} trong ${ieltsTopics.length} chủ đề.` : skill === "listening" ? `${audio.length} bản ghi tiếng Anh có file nghe hợp lệ trong nhóm mới nhất.` : skill === "writing" ? `${chart.length} mốc dân số, mới nhất năm ${latestYear ?? "—"}; ${articles.length} bài toàn văn gần đây cho Task 2.` : `${articles.length} bài toàn văn gần nhất đã được xuất bản và kiểm tra quyền.`}</p><div className="ielts-dashboard-check"><span>{busy ? "Đang kiểm tra" : data ? `Kiểm tra lúc ${new Date(data.checkedAt).toLocaleString("vi-VN")}` : "Chưa có dữ liệu"}</span><span>Không cần AI key</span></div></section><section className="ielts-dashboard-detail"><span className="ielts-dashboard-kicker">LỊCH SỬ HỌC</span><h2>Gần đây của bạn</h2>{recent.length ? <ul>{recent.map((item) => <li key={item.id}><span>{item.title}</span><small>{new Date(item.createdAt).toLocaleDateString("vi-VN")}</small></li>)}</ul> : <div className="ielts-dashboard-empty">Chưa có bài hoặc ghi chú nào. Bắt đầu một chế độ học để xây lịch sử học của bạn.</div>}<Link href="/app/notebook">Mở lịch sử trong Sổ tay <ArrowRight size={15}/></Link></section></div>
    <p className="ielts-dashboard-disclaimer">Các hoạt động được tạo theo định dạng luyện IELTS Academic từ nguồn được phép dùng. Điểm các câu ngắn không phải điểm band IELTS.</p>
  </main>;
}

function Stat({ icon: Icon, value, label, note }: { icon: typeof FileText; value: string; label: string; note: string }) {
  return <div className="ielts-dashboard-stat" title={note}><span><Icon size={18}/></span><div><strong>{value}</strong><b>{label}</b></div></div>;
}
