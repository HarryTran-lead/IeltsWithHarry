"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Bell, CalendarCheck, Megaphone, ShieldAlert } from "lucide-react";
import { createClient } from "@/lib/supabase/browser";
import "./account.css";

type Note = { id: string; kind: "announcement" | "task" | "account"; title: string; body: string; link: string | null; created_at: string };
const kindIcon = { announcement: Megaphone, task: CalendarCheck, account: ShieldAlert };

function ago(value: string) {
  const minutes = Math.max(0, Math.floor((Date.now() - Date.parse(value)) / 60000));
  return minutes < 60 ? `${minutes || 1} phút trước` : minutes < 1440 ? `${Math.floor(minutes / 60)} giờ trước` : `${Math.floor(minutes / 1440)} ngày trước`;
}

/** Announcements, assigned tasks and account notices from admins. Opening the list marks them read. */
export function NotificationBell({ open, onToggle }: { open: boolean; onToggle: () => void }) {
  const db = useMemo(() => createClient(), []);
  const [items, setItems] = useState<Note[]>([]);
  const [read, setRead] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);
  const load = useCallback(async () => {
    const [notes, reads] = await Promise.all([
      db.from("user_notifications").select("id,kind,title,body,link,created_at").order("created_at", { ascending: false }).limit(20),
      db.from("user_notification_reads").select("notification_id").limit(500),
    ]);
    if (!notes.error) setItems(notes.data as Note[]);
    if (!reads.error) setRead(new Set(reads.data.map((row) => row.notification_id as string)));
    setLoaded(true);
  }, [db]);
  useEffect(() => {
    const first = window.setTimeout(() => void load(), 0);
    const timer = window.setInterval(() => { if (document.visibilityState === "visible") void load(); }, 120000);
    return () => { window.clearTimeout(first); window.clearInterval(timer); };
  }, [load]);
  const unread = items.filter((item) => !read.has(item.id));

  async function toggle() {
    onToggle();
    if (open || !unread.length) return;
    const ids = unread.map((item) => item.id);
    setRead((current) => new Set([...current, ...ids]));
    await db.from("user_notification_reads").upsert(ids.map((id) => ({ notification_id: id })), { onConflict: "user_id,notification_id", ignoreDuplicates: true });
  }

  return <>
    <button className="icon-button notification-button" aria-label={unread.length ? `Thông báo, ${unread.length} chưa đọc` : "Thông báo"} aria-expanded={open} onClick={() => void toggle()}>
      <Bell size={18} />
      {unread.length > 0 && <i className="notification-count" aria-hidden="true">{unread.length > 9 ? "9+" : unread.length}</i>}
    </button>
    {open && <div className="small-popover notification-popover">
      <b>Thông báo</b>
      {!loaded ? <p>Đang tải…</p> : items.length === 0 ? <p>Chưa có thông báo nào. Harry sẽ báo bạn khi có nhiệm vụ hoặc tin mới.</p> :
        <ul>{items.map((item) => {
          const Icon = kindIcon[item.kind] ?? Megaphone;
          const content = <><span className={`notification-icon ${item.kind}`}><Icon size={15} /></span><span><strong>{item.title}</strong>{item.body && <small>{item.body}</small>}<time dateTime={item.created_at}>{ago(item.created_at)}</time></span></>;
          return <li key={item.id} className={read.has(item.id) ? "" : "is-new"}>{item.link ? <Link href={item.link} onClick={onToggle}>{content}</Link> : <div>{content}</div>}</li>;
        })}</ul>}
    </div>}
  </>;
}
