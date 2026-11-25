"use client";

import { useEffect, useState } from "react";
import { Check, Link2, UsersRound } from "lucide-react";
import { demoMode } from "@/lib/runtime";
import { useStudyPresence } from "./study-presence";

const shown = 7;

function minutesSince(since: string | null, now: number) {
  if (!since || !now) return null;
  const minutes = Math.floor((now - Date.parse(since)) / 60000);
  return minutes >= 0 ? minutes : null;
}

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

  const others = learners.filter((item) => !item.self);
  const studying = others.filter((item) => item.active).length;

  return <section className="study-learners" aria-label="Người đang học cùng">
    <header>
      <h2><UsersRound size={18} /> Đang học cùng bạn <span>{studying}</span></h2>
      {!demoMode && <label className="study-hide-name"><input type="checkbox" checked={hideName} onChange={(event) => setHideName(event.target.checked)} /> Ẩn tên tôi</label>}
    </header>

    {status !== "live" && !demoMode
      ? <p className="study-learners-note">{status === "connecting" ? "Đang kết nối phòng học…" : "Chưa kết nối được phòng học. Tải lại trang để thử lại."}</p>
      : others.length === 0
        ? <div className="study-learners-empty">
          <strong>Bạn đang mở phòng hôm nay</strong>
          <p>Cứ bắt đầu phiên học, người vào sau sẽ thấy bạn và mục tiêu của bạn. Bạn cũng có thể để lại lời nhắn trong phòng chat.</p>
          <button type="button" onClick={() => void copyInvite()}>{copied ? <Check size={15} /> : <Link2 size={15} />}{copied ? "Đã sao chép link" : "Mời bạn học cùng"}</button>
        </div>
        : <ul className="study-learner-list">
          {others.slice(0, shown).map((item) => {
            const minutes = minutesSince(item.since, now);
            return <li key={item.id} className={item.active ? "active" : ""}>
              <span className="study-learner-avatar" aria-hidden="true">{item.name.slice(0, 1).toUpperCase()}</span>
              <span className="study-learner-copy">
                <strong>{item.name}</strong>
                <small>{item.goal || "Chưa đặt mục tiêu"}</small>
              </span>
              <span className="study-learner-state">{item.active ? (minutes !== null ? `${minutes} phút` : "Đang học") : "Tạm vắng"}</span>
            </li>;
          })}
          {others.length > shown && <li className="study-learner-more">+{others.length - shown} người khác</li>}
        </ul>}
  </section>;
}
