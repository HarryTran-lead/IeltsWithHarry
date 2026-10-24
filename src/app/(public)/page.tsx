import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowRight, BookOpenText, ChartNoAxesCombined, NotebookPen, Sparkles } from "lucide-react";
import { Mochi } from "@/components/illustrations/mochi";
import { getViewerRole } from "@/lib/viewer-role";

export default async function GuestHome() {
  const role = await getViewerRole();
  if (role === "student") redirect("/app/dashboard");
  if (role === "admin") redirect("/admin");
  return <div className="guest-home">
    <section className="guest-hero"><div><span className="eyebrow">ENGLISH SKILL LAB · HỌC MIỄN PHÍ</span><h1>Học tiếng Anh, ghi lại từng bước tiến của bạn.</h1><p>Khám phá lộ trình từ nền tảng đến IELTS, luyện sáu kỹ năng bằng bài học soạn sẵn và giữ từ mới, ghi chú, lịch sử học trong một cuốn sổ tay.</p><div className="guest-actions"><Link href="/register" className="button primary">Bắt đầu học <ArrowRight size={17} /></Link><Link href="/courses" className="button subtle">Xem lộ trình</Link></div><small>Khách có thể xem khóa học. Đăng nhập để luyện tập và lưu tiến độ.</small></div><div className="guest-hero-art"><Mochi size={160} /><span>Small steps.<br />Big progress!</span></div></section>
    <section className="guest-features"><div><Sparkles size={27} /><h2>Bài học có đáp án rõ ràng</h2><p>Từ vựng, ngữ pháp, Reading và Listening khai thác nội dung do người soạn nhập.</p></div><div><NotebookPen size={27} /><h2>Sổ tay của riêng bạn</h2><p>Lưu ghi chú, từ mới và quay lại trang học đã mở.</p></div><div><ChartNoAxesCombined size={27} /><h2>Thấy được tiến độ</h2><p>Quản lý kế hoạch học, xem bài luyện đã nộp và những việc đã hoàn thành.</p></div></section>
    <section className="guest-path"><div><span className="eyebrow">BẮT ĐẦU TỪ ĐÂU?</span><h2>Chọn một bước nhỏ hôm nay</h2><p>Khám phá bảy chặng học và các bài mẫu trước khi tạo tài khoản.</p><Link href="/courses" className="button primary">Khám phá khóa học <ArrowRight size={17} /></Link></div><BookOpenText size={95} /></section>
  </div>;
}
