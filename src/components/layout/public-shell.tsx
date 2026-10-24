import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { Mochi } from "@/components/illustrations/mochi";

export function PublicShell({ children }: { children: React.ReactNode }) {
  return (
    <div className="public-site">
      <header className="public-header">
        <Link href="/app/dashboard" className="public-brand">
          <Mochi size={44} />
          <span>
            English <b>Skill Lab</b>
          </span>
        </Link>
        <nav>
          <Link href="/courses">Courses</Link>
          <Link href="/about">About</Link>
          <Link href="/login">Account</Link>
          <Link className="button primary" href="/app/dashboard">
            Try the demo <ArrowRight size={16} />
          </Link>
        </nav>
      </header>
      <main>{children}</main>
      <footer>
        © English Skill Lab · Small steps, big progress. · Demo preview
      </footer>
    </div>
  );
}
