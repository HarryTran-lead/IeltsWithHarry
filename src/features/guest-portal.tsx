"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useState } from "react";
import {
  ArrowRight, BookOpenText, CalendarDays, ChartNoAxesCombined, FlaskConical,
  GraduationCap, Headphones, LayoutDashboard, Library, Menu, MessageCircle,
  Mic, NotebookPen, PenLine, Newspaper, SpellCheck, UsersRound, X, Languages,
} from "lucide-react";
import { HarryMascot } from "@/components/illustrations/harry";
import { communityEnabled, lockedLearnerPath } from "@/lib/runtime";
import "./guest-portal.css";

const sections = [
  { label: "Khám phá", items: [
    { slug: "dashboard", name: "Dashboard", icon: LayoutDashboard, description: "Tổng quan lộ trình, bài học tiếp theo và hoạt động trong ngày.", features: ["Lộ trình theo trình độ", "Gợi ý bài học tiếp theo", "Mục tiêu mỗi ngày"] },
    { slug: "learn", name: "Learn", icon: GraduationCap, description: "Khám phá các chặng học từ nền tảng đến IELTS.", features: ["Khóa học theo chặng", "Bài học có hướng dẫn", "Kiểm tra sau mỗi chặng"] },
    { slug: "news", name: "Daily News", icon: Newspaper, description: "Đọc tin tiếng Anh và học từ vựng theo ngữ cảnh hiện tại.", features: ["Tin mới mỗi ngày", "Từ vựng theo bài", "Câu hỏi đọc hiểu"] },
  ] },
  { label: "Kỹ năng IELTS", items: [
    { slug: "vocabulary", name: "Vocabulary", icon: Languages, description: "Học từ theo chủ đề và ôn lại những từ đã gặp.", features: ["Học theo topic & level", "Thẻ từ vựng", "Dịch câu theo chủ đề"] },
    { slug: "grammar", name: "Grammar", icon: SpellCheck, description: "Xây nền ngữ pháp và luyện dùng cấu trúc trong câu.", features: ["Lộ trình ngữ pháp", "Bài luyện theo cấp độ", "Ôn tập lỗi sai"] },
    { slug: "reading", name: "Reading", icon: BookOpenText, description: "Luyện đọc theo passage và các dạng câu hỏi IELTS.", features: ["Bài đọc theo dạng", "Luyện từng passage", "Full test"] },
    { slug: "listening", name: "Listening", icon: Headphones, description: "Luyện nghe từng section hoặc một đề hoàn chỉnh.", features: ["Bài nghe theo section", "Full test", "Video luyện nghe"] },
    { slug: "writing", name: "Writing", icon: PenLine, description: "Tìm hiểu Academic Task 1 và Task 2 rồi thực hành viết.", features: ["Academic Task 1", "Academic Task 2", "Lưu bài viết"] },
    { slug: "speaking", name: "Speaking", icon: Mic, description: "Luyện nói theo ba phần thi và ghi âm để nghe lại.", features: ["Part 1 interview", "Part 2 cue card", "Part 3 follow-up"] },
    { slug: "question-bank", name: "Ngân hàng đề", icon: Library, description: "Khám phá các bài luyện IELTS theo kỹ năng.", features: ["Bộ đề theo kỹ năng", "Dạng câu hỏi", "Kết quả bài làm"] },
  ] },
  { label: "Không gian học", items: [
    { slug: "study-together", name: "Cùng học", icon: UsersRound, description: "Học cùng cộng đồng trong không gian tập trung.", features: ["Phòng học chung", "Đồng hồ học tập", "Góc trao đổi"] },
    ...(communityEnabled ? [{ slug: "community", name: "Cộng đồng", icon: MessageCircle, description: "Chia sẻ hành trình học và trao đổi cùng học viên.", features: ["Bài chia sẻ", "Thảo luận", "Kết nối học viên"] }] : []),
    { slug: "planner", name: "Planner", icon: CalendarDays, description: "Lên kế hoạch học phù hợp với thời gian của bạn.", features: ["Việc cần làm", "Mục tiêu ngày", "Lịch học"] },
    { slug: "progress", name: "Progress", icon: ChartNoAxesCombined, description: "Theo dõi chặng đường, điểm luyện tập và ngày học liên tiếp.", features: ["Tiến độ học", "Lịch sử bài làm", "Chuỗi ngày học"] },
    { slug: "notebook", name: "Notebook", icon: NotebookPen, description: "Giữ từ mới, ghi chú và ý tưởng học tập ở một nơi.", features: ["Từ đã lưu", "Ghi chú", "Ôn tập cá nhân"] },
    { slug: "content-lab", name: "Content Lab", icon: FlaskConical, description: "Không gian khám phá thêm nội dung học tập.", features: ["Chủ đề mới", "Bài học bổ sung", "Hoạt động thực hành"] },
  ] },
];

const allItems = sections.flatMap((section) => section.items);

export function GuestPortal() {
  const pathname = usePathname();
  const [menuOpen, setMenuOpen] = useState(false);
  const slug = pathname.split("/")[2] || "dashboard";
  const item = allItems.find((entry) => entry.slug === slug);
  const locked = lockedLearnerPath(`/app/${slug}`);
  const isPreview = Boolean(item) && !locked && (pathname === `/app/${slug}` || pathname === "/app");
  const loginHref = `/login?next=${encodeURIComponent(pathname)}`;

  return <div className="guest-portal">
    <header className="guest-portal-header">
      <button className="guest-portal-menu-button" type="button" aria-label="Mở menu" onClick={() => setMenuOpen(true)}><Menu size={22} /></button>
      <Link href="/app/dashboard" className="guest-portal-brand"><HarryMascot size={38} /><span>Ielts<b>WithHarry</b></span></Link>
      <span className="guest-portal-badge">Chế độ khách</span>
      <div className="guest-portal-header-actions"><Link href="/login">Đăng nhập</Link><Link className="button primary" href="/register">Tạo tài khoản <ArrowRight size={16} /></Link></div>
    </header>
    <aside className={`guest-portal-sidebar ${menuOpen ? "open" : ""}`}>
      <button className="guest-portal-close" type="button" aria-label="Đóng menu" onClick={() => setMenuOpen(false)}><X size={20} /></button>
      <nav aria-label="Student portal">
        {sections.map((section) => <div className="guest-portal-nav-group" key={section.label}>
          <span>{section.label}</span>
          {section.items.filter((entry) => !lockedLearnerPath(`/app/${entry.slug}`)).map((entry) => <Link key={entry.slug} href={`/app/${entry.slug}`} aria-current={slug === entry.slug ? "page" : undefined} onClick={() => setMenuOpen(false)}><entry.icon size={18} />{entry.name}</Link>)}
        </div>)}
      </nav>
      <div className="guest-portal-sidebar-note"><strong>Muốn bắt đầu học?</strong><p>Đăng nhập để làm bài, lưu từ vựng và theo dõi tiến độ.</p><Link href={loginHref}>Đăng nhập <ArrowRight size={15} /></Link></div>
    </aside>
    {menuOpen && <button className="guest-portal-backdrop" type="button" aria-label="Đóng menu" onClick={() => setMenuOpen(false)} />}
    <main className="guest-portal-main">
      {isPreview && item ? <>
        <div className="guest-portal-intro"><span>XEM TRƯỚC STUDENT PORTAL</span><h1>{item.name}</h1><p>{item.description}</p></div>
        <section className="guest-portal-banner"><div><span>KHÁM PHÁ TỰ DO</span><h2>Xem trước không gian học của bạn</h2><p>Bạn có thể xem các mục trong portal. Đăng nhập khi muốn mở bài học hoặc thực hiện hoạt động học tập.</p><Link className="button primary" href={loginHref}>Đăng nhập để bắt đầu <ArrowRight size={16} /></Link></div><HarryMascot size={120} /></section>
        {slug === "dashboard" ? <section className="guest-portal-card"><h2>Khám phá lộ trình</h2><p>Chọn một khu vực để xem bạn có thể học gì sau khi đăng nhập.</p><div className="guest-portal-quicklinks">{["learn", "vocabulary", "grammar", "reading", "listening", "writing", "speaking"].filter((key) => !lockedLearnerPath(`/app/${key}`)).map((key) => { const entry = allItems.find((value) => value.slug === key)!; return <Link key={key} href={`/app/${key}`}><entry.icon size={22} /><strong>{entry.name}</strong><ArrowRight size={16} /></Link>; })}</div></section> : <section className="guest-portal-card"><h2>Trong mục này</h2><div className="guest-portal-features">{item.features.map((feature, index) => <div key={feature}><span>0{index + 1}</span><strong>{feature}</strong><p>{index === 0 ? "Xem trước nội dung và cách học trong portal." : "Đăng nhập để mở và lưu hoạt động của bạn."}</p></div>)}</div>{slug === "learn" && <Link className="guest-portal-public-link" href="/courses">Xem khóa học công khai <ArrowRight size={16} /></Link>}</section>}
        <section className="guest-portal-card guest-portal-locked"><div><h2>Sẵn sàng thử {item.name}?</h2><p>Đăng nhập hoặc tạo tài khoản miễn phí để bắt đầu và lưu tiến độ.</p></div><div><Link className="button primary" href={loginHref}>Đăng nhập <ArrowRight size={16} /></Link><Link className="button subtle" href="/register">Tạo tài khoản</Link></div></section>
      </> : locked ? <section className="guest-portal-card guest-portal-gate"><span>CHỨC NĂNG ĐANG CHUẨN BỊ</span><h1>{item?.name ?? "Hoạt động học tập"}</h1><p>Nội dung này chưa mở cho học viên. Bạn có thể khám phá các mục đang có trong student portal.</p><Link className="button subtle" href="/app/dashboard">Về Dashboard</Link></section> : <section className="guest-portal-card guest-portal-gate"><span>ĐĂNG NHẬP ĐỂ TIẾP TỤC</span><h1>{item?.name ?? "Hoạt động học tập"}</h1><p>Khách có thể xem qua student portal. Để học, làm bài hoặc dùng các tính năng cá nhân, hãy đăng nhập.</p><div><Link className="button primary" href={loginHref}>Đăng nhập <ArrowRight size={16} /></Link><Link className="button subtle" href={`/app/${item?.slug ?? "dashboard"}`}>Xem trước mục này</Link></div></section>}
    </main>
  </div>;
}
