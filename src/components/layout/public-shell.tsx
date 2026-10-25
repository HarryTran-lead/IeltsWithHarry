import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { HarryMascot } from "@/components/illustrations/harry";
import { getViewerRole } from "@/lib/viewer-role";
import { demoMode } from "@/lib/runtime";

export async function PublicShell({ children }: { children: React.ReactNode }) {
  const role = await getViewerRole();
  return (
    <div className="public-site">
      <header className="public-header">
        <Link href="/" className="public-brand">
          <HarryMascot size={44} />
          <span>
            Ielts<b>WithHarry</b>
          </span>
        </Link>
        <nav>
          <Link href="/courses">Courses</Link>
          <Link href="/about">About</Link>
          {role === "guest" ? <><Link href="/login">Đăng nhập</Link><Link className="button primary" href="/register">Bắt đầu học <ArrowRight size={16} /></Link></> : <Link className="button primary" href={role === "admin" ? "/admin" : "/app/dashboard"}>{role === "admin" ? "Quản trị" : "Vào trang học"} <ArrowRight size={16} /></Link>}
        </nav>
      </header>
      <main>{children}</main>
      <footer>
        © IeltsWithHarry · Small steps, big progress.{demoMode ? " · Bản demo" : ""}
      </footer>
    </div>
  );
}
