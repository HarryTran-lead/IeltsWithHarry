"use client";

import { useState } from "react";
import { Harry3D } from "@/components/companion/harry-3d";
import { harryMoods, type HarryMood } from "@/components/companion/harry-moods";
import type { HarryRigInfo } from "@/components/companion/harry-rig";
import { companionLines, type CompanionTrigger } from "@/features/companion/companion-lines";
import { StudyCompanion } from "@/features/companion/study-companion";
import type { Streak } from "@/lib/account";
import { emitCompanion } from "@/lib/companion-events";

const moodLabels: Record<HarryMood, string> = {
  happy: "Vui vẻ", wave: "Vẫy chào", cheer: "Ăn mừng", proud: "Tự hào", reading: "Đọc sách", news: "Đọc báo",
  thinking: "Suy nghĩ", sleepy: "Buồn ngủ", worried: "Lo lắng", fire: "Giữ lửa chuỗi", love: "Thương thương",
};

const groups: { title: string; triggers: CompanionTrigger[] }[] = [
  { title: "Chào hỏi & lịch", triggers: ["greet_morning", "greet_noon", "greet_afternoon", "greet_evening", "greet_night", "late_night", "early_bird", "welcome_back", "tab_return", "weekend", "monday", "friday", "sunday_evening"] },
  { title: "Ngày đặc biệt", triggers: ["day_new_year", "day_valentine", "day_women", "day_children", "day_teacher", "day_halloween", "day_christmas"] },
  { title: "Hỏi thăm cảm xúc", triggers: ["check_in", "mood_great", "mood_ok", "mood_tired", "mood_stressed", "mood_bored"] },
  { title: "Mục tiêu hôm nay", triggers: ["goal_ask", "goal_set", "goal_half", "goal_reached"] },
  { title: "Thời gian học", triggers: ["study_10", "study_20", "study_30", "study_45", "study_60", "study_90", "study_120", "break_reminder", "break_start", "break_over"] },
  { title: "Chuỗi ngày học", triggers: ["streak_first", "streak_kept", "streak_milestone", "streak_strong", "streak_risk", "streak_risk_late", "streak_restart"] },
  { title: "Vừa hoàn thành", triggers: ["did_lesson", "did_news_read", "did_news_quiz", "did_word", "did_notebook", "did_task", "did_study_room", "did_dictation", "did_ielts", "did_generic", "busy_day"] },
  { title: "Điểm số", triggers: ["score_perfect", "score_good", "score_ok", "score_low", "score_hot_streak", "score_tough", "score_comeback"] },
  { title: "Daily News", triggers: ["news_unread", "news_nudge"] },
  { title: "Mẹo theo trang", triggers: ["page_reading", "page_listening", "page_writing", "page_speaking", "page_vocabulary", "page_grammar", "page_news", "page_planner", "page_progress", "page_notebook", "page_learn", "page_study_room"] },
  { title: "Trò chuyện khi bấm Harry", triggers: ["chat_menu", "chat_quiz", "chat_fact", "chat_cheer", "chat_joke", "chat_about", "chat_suggest"] },
  { title: "Gợi ý học", triggers: ["suggest_news", "suggest_vocab", "suggest_lesson", "suggest_listening", "suggest_writing", "suggest_rest"] },
  { title: "Rảnh rỗi & vui", triggers: ["idle", "idle_long", "tap", "tip", "word_of_moment"] },
];

const sampleValues: Partial<Record<CompanionTrigger, Record<string, number>>> = {
  score_perfect: { count: 10, total: 10 }, score_good: { count: 8, total: 10 }, score_ok: { count: 6, total: 10 }, score_low: { count: 3, total: 10 },
  news_unread: { count: 5 }, streak_restart: { count: 21 }, streak_milestone: { streak: 30 }, busy_day: { count: 6 },
  goal_set: { goal: 20 }, goal_half: { goal: 20, minutes: 11 }, goal_reached: { goal: 20 },
  score_comeback: { count: 8, total: 10 },
};

function demoStreak(activeToday: boolean, kinds: string[]): Streak {
  const today = new Date().toISOString().slice(0, 10);
  return { current: activeToday ? 13 : 12, longest: 21, today, activeToday, totalDays: 40, days: [{ day: today, events: kinds.length, kinds }] };
}

export function CompanionPreview() {
  const [streak, setStreak] = useState<Streak>(() => demoStreak(false, []));
  const [unread, setUnread] = useState(0);
  const [mood, setMood] = useState<HarryMood>("wave");
  const [pulse, setPulse] = useState(0);
  const [yaw, setYaw] = useState(0);
  const [model, setModel] = useState<{ url: string; name: string } | null>(null);
  const [info, setInfo] = useState<HarryRigInfo | null>(null);
  const total = Object.values(companionLines).reduce((sum, lines) => sum + lines.length, 0);

  return (
    <main style={{ maxWidth: 1080, margin: "0 auto", padding: "32px 16px 220px", color: "#10233f" }}>
      <h1 style={{ fontSize: "2rem", fontWeight: 900 }}>Harry – bạn đồng hành học tập</h1>
      <p style={{ color: "#526b7d", marginTop: 6 }}>{harryMoods.length} biểu cảm · {Object.keys(companionLines).length} tình huống · {total} mẫu câu. Bấm vào Harry góc phải để trò chuyện, hoặc thử từng tình huống bên dưới.</p>

      <section className="harry-stage">
        <div className="harry-stage-view">
          <Harry3D mood={mood} width={340} pulse={pulse} yaw={(yaw * Math.PI) / 180} title={`Harry 3D: ${moodLabels[mood]}`} model={model ? { url: model.url } : undefined} onInfo={setInfo} />
        </div>
        <div className="harry-stage-moods">
          <strong>Tư thế & hành động</strong>
          {harryMoods.map((item) => (
            <button key={item} type="button" className={item === mood ? "active" : ""} onClick={() => { setMood(item); setPulse((value) => value + 1); }}>
              {moodLabels[item]} <small>{item}</small>
            </button>
          ))}
          <label className="harry-stage-yaw">Xoay {yaw}°<input type="range" min={-180} max={180} value={yaw} onChange={(event) => setYaw(Number(event.target.value))} /></label>
          <p>Di chuột quanh trang: Harry nhìn theo. Bấm một tư thế để cậu ấy nhảy lên rồi chuyển động.</p>
          <label className="harry-stage-file">
            Thử mô hình .glb
            <input type="file" accept=".glb,model/gltf-binary" onChange={(event) => {
              const file = event.target.files?.[0];
              if (!file) return;
              if (model) URL.revokeObjectURL(model.url);
              setModel({ url: URL.createObjectURL(file), name: file.name });
            }} />
          </label>
          {info && (
            <div className="harry-stage-info">
              {info.source === "model" ? (
                <>
                  <strong>{model?.name ?? "Mô hình"} · {info.clips.length} chuyển động</strong>
                  <ul>{harryMoods.map((item) => <li key={item}>{moodLabels[item]} → <code>{info.byMood[item] ?? "—"}</code></li>)}</ul>
                </>
              ) : (
                <strong>Đang dùng Harry dựng bằng code{info.error ? ` (file .glb lỗi: ${info.error})` : ""}</strong>
              )}
            </div>
          )}
        </div>
      </section>

      <section style={{ marginTop: 30, padding: 18, border: "1px dashed #b9c9d6", borderRadius: 16 }}>
        <h2 style={{ fontWeight: 900, fontSize: "1.2rem" }}>Mô phỏng tín hiệu thật</h2>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 10 }}>
          <button className="button" onClick={() => setStreak(demoStreak(true, [...(streak.days[0]?.kinds ?? []), "lesson"]))}>Hoàn thành bài học (giữ chuỗi)</button>
          <button className="button" onClick={() => setStreak(demoStreak(true, [...(streak.days[0]?.kinds ?? []), "news_read"]))}>Đọc xong bài báo</button>
          <button className="button" onClick={() => setStreak(demoStreak(true, [...(streak.days[0]?.kinds ?? []), "word"]))}>Lưu từ mới</button>
          <button className="button" onClick={() => emitCompanion({ kind: "score", score: 9, total: 10 })}>Quiz 9/10</button>
          <button className="button" onClick={() => emitCompanion({ kind: "score", score: 2, total: 10 })}>Quiz 2/10</button>
          <button className="button" onClick={() => setUnread(4)}>Có 4 tin mới</button>
          <button className="button" onClick={() => { setStreak(demoStreak(false, [])); setUnread(0); }}>Đặt lại</button>
        </div>
        <p style={{ color: "#6b7f95", fontSize: ".85rem", marginTop: 8 }}>Các nút này đi qua đúng luật ưu tiên & giãn cách như trên web thật (mức “Vừa phải” chờ 20 giây giữa hai lời khen).</p>
      </section>

      {groups.map((group) => (
        <section key={group.title} style={{ marginTop: 26 }}>
          <h2 style={{ fontWeight: 900, fontSize: "1.15rem" }}>{group.title}</h2>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(300px, 1fr))", gap: 10, marginTop: 10 }}>
            {group.triggers.map((trigger) => (
              <article key={trigger} style={{ padding: 12, border: "1px solid #e3eaf0", borderRadius: 14, background: "#fff" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <code style={{ fontSize: ".8rem", color: "#0a7f89" }}>{trigger}</code>
                  <button className="button" style={{ padding: ".3rem .7rem", fontSize: ".8rem" }} onClick={() => emitCompanion({ kind: "say", trigger, values: sampleValues[trigger], force: true })}>Cho Harry nói</button>
                </div>
                <ul style={{ margin: "8px 0 0", paddingLeft: 18, fontSize: ".85rem", lineHeight: 1.45, color: "#334a60" }}>
                  {companionLines[trigger].map((line) => <li key={line.text}>{line.text} <small style={{ color: "#8fa3b5" }}>· {line.mood ?? "happy"}{line.action ? ` · nút “${line.action.label}”` : ""}{line.choices ? ` · trả lời: ${line.choices.map((choice) => choice.label).join(" / ")}` : ""}</small></li>)}
                </ul>
              </article>
            ))}
          </div>
        </section>
      ))}

      <StudyCompanion streak={streak} newsUnread={unread} name="Nguyễn Minh Anh" />
    </main>
  );
}
