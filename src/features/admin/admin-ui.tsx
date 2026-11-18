"use client";
/* Shared building blocks for every admin page, so each module uses one header, one tab bar and one notice style. */
import { createContext, useContext } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Info, XCircle, type LucideIcon } from "lucide-react";

/** The page heading's action area; modules portal their primary actions into it with `AdminHeaderActions`. */
export const AdminActionsSlot = createContext<HTMLElement | null>(null);

export function AdminHeaderActions({ children }: { children: React.ReactNode }) {
  const slot = useContext(AdminActionsSlot);
  return slot ? createPortal(children, slot) : null;
}

export type AdminTabItem = {
  id: string;
  label: string;
  active: boolean;
  href?: string;
  onClick?: () => void;
  count?: number | string;
  icon?: LucideIcon;
};
export type AdminTabGroup = { label?: string; items: AdminTabItem[] };

/** Page-level sub navigation: one underline tab bar directly below the heading. */
export function AdminTabs({ items, groups, label, end }: { items?: AdminTabItem[]; groups?: AdminTabGroup[]; label: string; end?: React.ReactNode }) {
  const sets = groups ?? [{ items: items ?? [] }];
  return <nav className="admin-tabs" aria-label={label}>
    <div className="admin-tabs-scroll">
      {sets.map((group, index) => <div className="admin-tabs-group" key={group.label ?? index}>
        {group.label && <span className="admin-tabs-group-label">{group.label}</span>}
        {group.items.map((item) => <AdminTab key={item.id} item={item} />)}
      </div>)}
    </div>
    {end && <div className="admin-tabs-end">{end}</div>}
  </nav>;
}

function AdminTab({ item }: { item: AdminTabItem }) {
  const Icon = item.icon;
  const body = <>{Icon && <Icon size={15} aria-hidden="true" />}<span>{item.label}</span>{item.count !== undefined && <b className="admin-tabs-count">{item.count}</b>}</>;
  const className = item.active ? "admin-tab active" : "admin-tab";
  if (item.href) return <Link prefetch={false} href={item.href} className={className} aria-current={item.active ? "page" : undefined} onClick={item.onClick}>{body}</Link>;
  return <button type="button" className={className} aria-pressed={item.active} onClick={item.onClick}>{body}</button>;
}

const noticeIcons = { info: Info, success: CheckCircle2, warning: AlertTriangle, error: XCircle } as const;

/** One message style for success, info, warning and error feedback. */
export function AdminNotice({ tone = "info", children, role }: { tone?: keyof typeof noticeIcons; children: React.ReactNode; role?: "status" | "alert" }) {
  const Icon = noticeIcons[tone];
  return <div className={`admin-alert is-${tone}`} role={role ?? (tone === "error" ? "alert" : "status")}><Icon size={17} aria-hidden="true" /><div>{children}</div></div>;
}

/** Card heading used inside every admin section: title, optional description and actions on the right. */
export function AdminCardHead({ title, description, count, children }: { title: React.ReactNode; description?: React.ReactNode; count?: number | string; children?: React.ReactNode }) {
  return <div className="admin-card-head">
    <div><h2>{title}{count !== undefined && <span className="admin-count">{count}</span>}</h2>{description && <p>{description}</p>}</div>
    {children && <div className="admin-card-actions">{children}</div>}
  </div>;
}

/** Compact metric tile shared by every overview row. */
export function AdminStat({ label, value, hint, icon: Icon, tone }: { label: string; value: React.ReactNode; hint?: React.ReactNode; icon?: LucideIcon; tone?: "teal" | "sky" | "coral" | "lavender" | "amber" }) {
  return <article className={`admin-stat${tone ? ` tone-${tone}` : ""}`}>
    {Icon && <span className="admin-stat-icon"><Icon size={18} aria-hidden="true" /></span>}
    <span className="admin-stat-label">{label}</span>
    <strong>{value}</strong>
    {hint && <small>{hint}</small>}
  </article>;
}
