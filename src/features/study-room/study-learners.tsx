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

  return <section className="study-learners" aria-label="Người đang học cùng">
    <div className="study-learners-head">
      <span>Đang học cùng <b>{others.filter((item) => item.active).length}</b></span>
      <button type="button" aria-pressed={hideName} onClick={() => setHideName(!hideName)}>{hideName ? "Đang ẩn tên bạn" : "Ẩn tên tôi"}</button>
    </div>
    {others.length === 0
      ? <div className="study-learners-empty">
        <p>Chỉ có bạn trong phòng lúc này. Người vào sau sẽ thấy mục tiêu của bạn.</p>
        <button type="button" onClick={() => void copyInvite()}>{copied ? <Check size={14} /> : <Link2 size={14} />}{copied ? "Đã chép link" : "Mời bạn học"}</button>
      </div>
      : <ul className="study-learner-strip">
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
