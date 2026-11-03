"use client";

import { useState, useSyncExternalStore } from "react";
import { MessageCircle, RefreshCw, X } from "lucide-react";
import { Sticker } from "@/components/stickers/stickers";

/** A scripted coach line from the package (m05 coach_script / m06_learning_coach) or built from the lesson. */
export type CoachPhase = { phase: string; vi?: string; en?: string; utterance_vi?: string; actions?: string[] };
export type CoachScript = { mode?: string; phases: CoachPhase[] };
export type CoachMoment = "intro" | "before" | "wrong" | "review";
export type CoachAction = { label: string; run: () => void };

const HIDDEN_KEY = "book2-coach:hidden";
const listeners = new Set<() => void>();
function readHidden() { try { return localStorage.getItem(HIDDEN_KEY) === "1"; } catch { return false; } }
/** Hiding the coach is remembered per device and never blocks the lesson. */
export function useCoachHidden() {
  const hidden = useSyncExternalStore((listener) => { listeners.add(listener); return () => listeners.delete(listener); }, readHidden, () => false);
  const setHidden = (value: boolean) => {
    try { localStorage.setItem(HIDDEN_KEY, value ? "1" : "0"); } catch { /* the toggle still works for this page */ }
    listeners.forEach((listener) => listener());
  };
  return [hidden, setHidden] as const;
}

const skillIntro: Record<string, string[]> = {
  Reading: ["Mình đọc cùng bạn nhé: xem phần kiến thức trước, rồi làm từng câu. Sai câu nào, mở bằng chứng ngay để biết vì sao.", "Đọc lướt tiêu đề và câu đầu mỗi đoạn trước, sau đó mới tìm chi tiết."],
  Listening: ["Đọc câu hỏi và đoán loại thông tin cần nghe trước khi bấm phát. Chỉ mở transcript sau khi đã tự làm.", "Nghe lần một để trả lời, lần hai để bắt chỗ người nói sửa thông tin."],
  Writing: ["Viết theo từng bước: xác định dạng đề, lên dàn ý ngắn, rồi mới viết. Bài mẫu để đối chiếu sau khi bạn viết xong.", "Câu đúng số liệu và rõ ý quan trọng hơn câu dài và khó."],
  Speaking: ["Nói thành tiếng trước, rồi mới ghi lại ý chính. Ghi âm và nghe lại sẽ giúp bạn thấy chỗ cần sửa.", "Trả lời thẳng, thêm một lý do và một ví dụ thật của bạn."],
};

/** Tips that fit the question in front of the learner, keyed by item type. */
function typeTips(itemType: string, skill: string, options: string[] = []): { before: string[]; wrong: string[] } {
  const set = options.join(" ").toUpperCase();
  if (/true_false|not_given/.test(itemType) || /NOT GIVEN/.test(set)) return {
    before: [set.includes("YES") ? "YES khi tác giả đồng ý, NO khi tác giả nói ngược lại, NOT GIVEN khi không nêu quan điểm. Tìm đoạn chứa từ khóa trước." : "TRUE khi bài nói giống ý câu hỏi, FALSE khi bài nói ngược lại, NOT GIVEN khi bài không nhắc đủ. Tìm đoạn chứa từ khóa trước.", "Gạch các từ giới hạn như all, only, always: chúng thường quyết định đáp án."],
    wrong: ["Đọc lại cả câu bằng chứng: bài nói ngược lại, hay chỉ không nhắc tới?", "Đừng dùng hiểu biết bên ngoài; chỉ dựa vào điều bài thật sự nói."],
  };
  if (/heading/.test(itemType)) return {
    before: ["Đọc cả đoạn, tự tóm ý chính trong 5–8 từ rồi mới so với danh sách tiêu đề.", "Tiêu đề đúng bao trùm cả đoạn, không chỉ một ví dụ thú vị."],
    wrong: ["Một từ trùng với đoạn chưa chắc là tiêu đề đúng. Đoạn này chủ yếu bàn về điều gì?", "Thử loại các tiêu đề quá rộng hoặc chỉ nói một chi tiết nhỏ."],
  };
  if (/grammar|transformation/.test(itemType)) return {
    before: ["Tìm dấu hiệu thời gian và xem chủ ngữ số ít hay số nhiều trước khi chia động từ.", "Đối chiếu với công thức ở phần Cấu trúc cần nhớ."],
    wrong: ["Xem lại công thức trong phần Tìm hiểu rồi thử lại câu này.", "Kiểm tra trợ động từ và đuôi động từ: is/are, has/have, -ed hay V3."],
  };
  if (/completion|short_answer|fill|labeling/.test(itemType)) return {
    before: [skill === "Listening" ? "Đoán ô cần số, tên, ngày hay danh từ, rồi nghe từ khóa đứng gần chỗ trống." : "Đoán loại từ cần điền và nhớ giới hạn số từ trong đề.", "Viết đúng chính tả; số có thể viết bằng chữ số."],
    wrong: [skill === "Listening" ? "Người nói hay sửa thông tin: nghe lại đoạn có but, actually, now." : "Tìm câu có ý tương đương trong bài và chép đúng từ trong đó.", "Kiểm tra số ít/số nhiều và giới hạn số từ của đề."],
  };
  if (itemType === "open_writing") return { before: ["Lên dàn ý 2–3 dòng: mỗi đoạn một ý chính, rồi mới viết.", "Viết đủ số từ tối thiểu, sau đó tự sửa ít nhất hai chỗ."], wrong: [] };
  if (/speaking|open/.test(itemType)) return { before: ["Ghi 4–6 từ khóa, nói thành tiếng rồi mới ghi lại ý chính.", "Trả lời thẳng, thêm lý do và một ví dụ của bạn."], wrong: [] };
  return {
    before: ["Loại dần phương án sai: quá tuyệt đối, trái với bài, hoặc chỉ trùng từ.", "Tìm câu bằng chứng trước, rồi mới so từng phương án."],
    wrong: ["Phương án hấp dẫn thường lặp từ trong bài nhưng sai ý. So lại từng phương án với câu bằng chứng.", "Mở tư liệu và đọc cả câu trước, câu sau chỗ chứa từ khóa."],
  };
}

const phaseFor: Record<CoachMoment, string[]> = {
  intro: ["intro", "welcome"],
  before: ["before_question", "plan"],
  wrong: ["wrong_answer"],
  review: ["review", "reflect"],
};
const text = (phase: CoachPhase) => phase.utterance_vi || phase.vi || phase.en || "";

/** The lines the coach can say at a moment: the package script first, then tips built from the lesson. */
export function coachLines({ script, moment, skill, itemType, options, objective, reviewTip, scriptPhase }: {
  script?: CoachScript | null; moment: CoachMoment; skill: string; itemType?: string; options?: string[]; objective?: string; reviewTip?: string; scriptPhase?: string;
}) {
  const scripted = script?.phases.filter((phase) => scriptPhase ? phase.phase === scriptPhase : phaseFor[moment].includes(phase.phase)) ?? [];
  const tips = itemType ? typeTips(itemType, skill, options) : null;
  // The objective is already on screen above, so the greeting explains how to work through the lesson instead.
  const built = moment === "intro" ? [...(skillIntro[skill] ?? []), ...(objective ? [`Khi xong bài, hãy tự hỏi: mình đã ${objective.charAt(0).toLowerCase()}${objective.slice(1).replace(/\.$/, "")} chưa?`] : [])]
    : moment === "before" ? tips?.before ?? []
      : moment === "wrong" ? tips?.wrong ?? []
        : [reviewTip ?? "Xem lại các câu cần sửa bên dưới trước khi sang bài mới; sửa lúc còn nhớ là cách nhớ lâu nhất."];
  return { lines: [...scripted.map(text).filter(Boolean), ...built], actions: scripted[0]?.actions ?? [] };
}

/** Harry as a skippable, inline coach. It never covers lesson content and "Nói cách khác" rephrases the tip. */
export function Book2Coach({ lines, actions = [], onAction, compact = false, tone = "" }: {
  lines: string[]; actions?: string[]; onAction?: (label: string) => void; compact?: boolean; tone?: "" | "is-wrong";
}) {
  const [hidden, setHidden] = useCoachHidden();
  const [turn, setTurn] = useState(0);
  if (!lines.length) return null;
  if (hidden) return <button type="button" className="b2-coach-show" onClick={() => setHidden(false)}><MessageCircle size={15} /> Bật Coach</button>;
  const line = lines[turn % lines.length];
  return <aside className={`b2-coach ${compact ? "is-compact" : ""} ${tone}`} aria-label="Coach học tập" aria-live="polite">
    <Sticker name="harry" size={compact ? 44 : 58} tilt={-6} pop={false} className="b2-coach-avatar" />
    <div className="b2-coach-bubble">
      <span className="b2-coach-name">Coach Harry</span>
      <p key={turn}>{line}</p>
      <div className="b2-coach-actions">
        {actions.map((label) => <button type="button" key={label} className="b2-coach-chip" onClick={() => onAction?.(label)}>{label}</button>)}
        {lines.length > 1 && <button type="button" className="b2-coach-link" onClick={() => setTurn((value) => value + 1)}><RefreshCw size={13} /> Nói cách khác</button>}
      </div>
    </div>
    <button type="button" className="b2-coach-close" onClick={() => setHidden(true)} aria-label="Ẩn Coach"><X size={16} /></button>
  </aside>;
}
