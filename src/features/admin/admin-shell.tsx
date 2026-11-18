"use client";
import { useState } from "react";
import Link from "next/link";
import { ArrowUpRight, ChevronRight, GraduationCap, LogOut, PanelLeftClose, PanelLeftOpen, type LucideIcon } from "lucide-react";
import { HarryMascot } from "@/components/illustrations/harry";
import { AdminActionsSlot } from "./admin-ui";

export type AdminNavItem = { href: string; label: string; icon: LucideIcon; active: boolean; onClick?: () => void };
export type AdminNavGroup = { label: string; items: AdminNavItem[] };

/**
 * Shared frame for the live CMS and the demo editor: grouped sidebar, sticky top bar, one page heading
 * (title, description, actions) and an optional tab bar. Modules add heading actions with `AdminHeaderActions`.
 */
export function AdminShell({
  groups,
  section,
  title,
  description,
  mode,
  actions,
  tabs,
  icon: Icon,
  onSignOut,
  children,
}: {
  groups: AdminNavGroup[];
  section: string;
  title: string;
  description: string;
  mode: "demo" | "live";
  actions?: React.ReactNode;
  tabs?: React.ReactNode;
  icon?: LucideIcon;
  onSignOut?: () => void;
  children: React.ReactNode;
}) {
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [slot, setSlot] = useState<HTMLDivElement | null>(null);
  return <div className={`admin-shell${sidebarOpen ? "" : " admin-shell-collapsed"}`}>
    <aside className="admin-sidebar" id="admin-sidebar">
      <Link prefetch={false} href="/admin" className="admin-brand">
        <span className="admin-brand-mark"><HarryMascot size={34} /></span>
        <span><strong>IeltsWithHarry</strong><small>ADMIN PORTAL</small></span>
      </Link>
      <nav aria-label="Admin navigation">
        {groups.map((group) => <div className="admin-nav-group" key={group.label}>
          <div className="admin-sidebar-label">{group.label}</div>
          {group.items.map(({ href, label, icon: ItemIcon, active, onClick }) => <Link prefetch={false} key={href} href={href} onClick={onClick} className={active ? "admin-nav-link active" : "admin-nav-link"} aria-current={active ? "page" : undefined}>
            <ItemIcon size={17} /><span>{label}</span><ChevronRight size={14} className="admin-nav-chevron" />
          </Link>)}
        </div>)}
      </nav>
      <div className="admin-sidebar-footer">
        <Link prefetch={false} href="/app/dashboard" className="admin-student-link"><GraduationCap size={17} /> Trang học viên <ArrowUpRight size={15} /></Link>
        {onSignOut && <button type="button" className="admin-student-link" onClick={onSignOut}><LogOut size={17} /> Thoát admin demo</button>}
      </div>
    </aside>
    <div className="admin-main">
      <header className="admin-topbar">
        <button type="button" className="admin-sidebar-toggle" aria-label={sidebarOpen ? "Đóng thanh điều hướng" : "Mở thanh điều hướng"} aria-controls="admin-sidebar" aria-expanded={sidebarOpen} onClick={() => setSidebarOpen((open) => !open)}>{sidebarOpen ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}<span>{sidebarOpen ? "Thu gọn" : "Menu"}</span></button>
        <nav className="admin-breadcrumb" aria-label="Breadcrumb"><Link prefetch={false} href="/admin">Admin</Link><ChevronRight size={14} /><span>{section}</span></nav>
        <span className={`admin-env ${mode}`}><i aria-hidden="true" />{mode === "demo" ? "Bản demo · lưu trong trình duyệt" : "Live · Supabase"}</span>
        <Link prefetch={false} className="button subtle admin-topbar-link" href="/app/dashboard">Trang học viên <ArrowUpRight size={15} /></Link>
      </header>
      <main className="admin-panel">
        <div className="admin-heading">
          {Icon && <span className="admin-heading-icon" aria-hidden="true"><Icon size={22} /></span>}
          <div className="admin-heading-text"><h1>{title}</h1><p>{description}</p></div>
          <div className="admin-heading-actions" ref={setSlot}>{actions}</div>
        </div>
        {tabs}
        <AdminActionsSlot.Provider value={slot}>{children}</AdminActionsSlot.Provider>
      </main>
    </div>
  </div>;
}
