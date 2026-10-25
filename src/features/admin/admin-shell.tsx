"use client";
import Link from "next/link";
import { ArrowUpRight, ChevronRight, GraduationCap, LogOut, type LucideIcon } from "lucide-react";
import { HarryMascot } from "@/components/illustrations/harry";

export type AdminNavItem = { href: string; label: string; icon: LucideIcon; active: boolean; onClick?: () => void };
export type AdminNavGroup = { label: string; items: AdminNavItem[] };

/** Shared frame for the live CMS and the demo editor: grouped sidebar, sticky top bar and page heading. */
export function AdminShell({
  groups,
  section,
  title,
  description,
  mode,
  actions,
  onSignOut,
  children,
}: {
  groups: AdminNavGroup[];
  section: string;
  title: string;
  description: string;
  mode: "demo" | "live";
  actions?: React.ReactNode;
  onSignOut?: () => void;
  children: React.ReactNode;
}) {
  return <div className="admin-shell">
    <aside className="admin-sidebar">
      <Link href="/admin" className="admin-brand">
        <span className="admin-brand-mark"><HarryMascot size={34} /></span>
        <span><strong>IeltsWithHarry</strong><small>ADMIN PORTAL</small></span>
      </Link>
      <nav aria-label="Admin navigation">
        {groups.map((group) => <div className="admin-nav-group" key={group.label}>
          <div className="admin-sidebar-label">{group.label}</div>
          {group.items.map(({ href, label, icon: Icon, active, onClick }) => <Link key={href} href={href} onClick={onClick} className={active ? "admin-nav-link active" : "admin-nav-link"} aria-current={active ? "page" : undefined}>
            <Icon size={17} /><span>{label}</span><ChevronRight size={14} className="admin-nav-chevron" />
          </Link>)}
        </div>)}
      </nav>
      <div className="admin-sidebar-footer">
        <Link href="/app/dashboard" className="admin-student-link"><GraduationCap size={17} /> Student portal <ArrowUpRight size={15} /></Link>
        {onSignOut && <button type="button" className="admin-student-link" onClick={onSignOut}><LogOut size={17} /> Thoát admin demo</button>}
      </div>
    </aside>
    <div className="admin-main">
      <header className="admin-topbar">
        <nav className="admin-breadcrumb" aria-label="Breadcrumb"><Link href="/admin">Admin</Link><ChevronRight size={14} /><span>{section}</span></nav>
        <span className={`admin-env ${mode}`}><i aria-hidden="true" />{mode === "demo" ? "Bản demo · lưu trong trình duyệt" : "Live · Supabase"}</span>
        <Link className="button subtle admin-topbar-link" href="/app/dashboard">Student portal <ArrowUpRight size={15} /></Link>
      </header>
      <main className="admin-panel">
        <div className="admin-heading">
          <div><h1>{title}</h1><p>{description}</p></div>
          {actions && <div className="admin-heading-actions">{actions}</div>}
        </div>
        {children}
      </main>
    </div>
  </div>;
}
