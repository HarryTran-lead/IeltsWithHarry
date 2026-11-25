"use client";

import { useEffect, useState } from "react";
import { Check, Link2 } from "lucide-react";
import { demoMode } from "@/lib/runtime";
import { useStudyPresence } from "./study-presence";

function minutesSince(since: string | null, now: number) {
  if (!since || !now) return null;
  const minutes = Math.floor((now - Date.parse(since)) / 60000);
  return minutes >= 0 ? minutes : null;
}

/** A compact strip of who is studying now, shown at the top of the room chat. */
export function StudyLearners() {
  const { learners, status, hideName, setHideName } = useStudyPresence();
  const [now, setNow] = useState(0);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const tick = () => setNow(Date.now());
    const first = window.setTimeout(tick, 0);
    const interval = window.setInterval(tick, 30000);
    return () => { window.clearTimeout(first); window.clearInterval(interval); };
  }, []);

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/app/study-together`);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2500);
    } catch { /* Clipboard may be blocked; the button stays as it was. */ }
  }

  if (demoMode || status !== "live") return null;
  const others = learners.filter((item) => !item.self);

  const studying = others.filter((item) => item.active).length;
  return <section className="study-learners" aria-label="Người đang học cùng">
    <div className="study-learners-head">
      <span>{others.length === 0 ? "Chỉ có bạn trong phòng" : <>Đang học cùng <b>{studying}</b></>}</span>
      {others.length === 0 && <button type="button" onClick={() => void copyInvite()}>{copied ? <Check size={13} /> : <Link2 size={13} />}{copied ? "Đã chép link" : "Mời bạn học"}</button>}
      <button type="button" aria-pressed={hideName} onClick={() => setHideName(!hideName)}>{hideName ? "Hiện tên tôi" : "Ẩn tên tôi"}</button>
    </div>
    {others.length > 0 && <ul className="study-learner-strip">
      {others.map((item) => {
        const minutes = minutesSince(item.since, now);
        return <li key={item.id} className={item.active ? "active" : ""} title={`${item.name}${item.goal ? ` · ${item.goal}` : ""}`}>
          <span className="study-learner-avatar" aria-hidden="true">{item.name.slice(0, 1).toUpperCase()}</span>
          <span className="study-learner-copy">
            <strong>{item.name}{item.active && minutes !== null ? <small> · {minutes}′</small> : null}</strong>
            <span>{item.active ? item.goal || "Đang học" : "Tạm vắng"}</span>
          </span>
        </li>;
      })}
    </ul>}
  </section>;
}
