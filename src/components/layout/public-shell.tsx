import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HarryMascot } from "@/components/illustrations/harry";
import { HarryWordmark } from "@/components/layout/harry-wordmark";
import { Sticker } from "@/components/stickers/stickers";
import { getViewerRole } from "@/lib/viewer-role";
import { demoMode } from "@/lib/runtime";

export async function PublicShell({ children }: { children: React.ReactNode }) {
  const role = await getViewerRole();
  return (
    <div className="public-site">
      <header className="public-header">
        <Link href="/" className="public-brand" aria-label="HarryUp — Level Up Your English.">
          <HarryMascot size={40} />
          <HarryWordmark />
        </Link>
        <nav>
          <Link href="/courses">Courses</Link>
          <Link href="/about">About</Link>
          {role === "guest" ? <><Link href="/login">Đăng nhập</Link><Link className="button primary" href="/register">Bắt đầu học <ArrowRight size={16} /></Link></> : <Link className="button primary" href={role === "admin" ? "/admin" : "/app/dashboard"}>{role === "admin" ? "Quản trị" : "Vào trang học"} <ArrowRight size={16} /></Link>}
        </nav>
      </header>
      <main>{children}</main>
      <footer className="public-footer">
        <div className="public-footer-inner">
          <div className="public-footer-brand">
            <Link href="/" className="public-brand" aria-label="HarryUp — Level Up Your English.">
              <HarryMascot size={36} />
              <HarryWordmark />
            </Link>
            <p>Không gian học tiếng Anh và IELTS: bài học soạn sẵn, tin tức mỗi ngày, sổ tay và phòng học chung.</p>
            <span className="hand-note">Level Up Your English.</span>
          </div>
          <div>
            <h3>Học</h3>
            <Link href="/courses">Lộ trình 4 chặng</Link>
            <Link href="/about">Về HarryUp</Link>
          </div>
          <div>
            <h3>Tài khoản</h3>
            <Link href="/login">Đăng nhập</Link>
            <Link href="/register">Tạo tài khoản</Link>
            <Link href="/forgot-password">Quên mật khẩu</Link>
          </div>
          <Sticker name="plane" size={84} tilt={-8} float pop={false} className="public-footer-sticker" />
        </div>
        <div className="public-footer-bottom">
          © HarryUp · Level Up Your English.{demoMode ? " · Bản demo" : ""}
        </div>
      </footer>
    </div>
  );
}
