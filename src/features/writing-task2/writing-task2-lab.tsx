"use client";
/*
 * Writing Task 2 Lab: the R01–R16 skills course and 36 prompt-based lessons. Both halves use the shared
 * self-study path (src/features/self-study-path): chặng → bài in order, one "Học tiếp" button, later lessons
 * locked until the earlier ones are done. A newcomer can still pick the level to start from.
 */
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type CSSProperties, type ReactNode } from "react";
import { BookOpen, Eye, Lightbulb, PenLine, Sparkles } from "lucide-react";
import { useLearnerStreak } from "@/features/account/use-learner-streak";
import { StudyPath } from "@/features/self-study-path/study-path";
import { TASK2_LEVEL_KEY } from "@/lib/self-study-path/task2";
import { stageAbout } from "@/lib/writing-task2/guides";
import { TASK2_BASE, stageInfo, stageOrder, type Task2Stage } from "@/lib/writing-task2/types";
import { CourseHome, CourseModulePage, LabShell } from "./task2-course";
import { LessonPage } from "./task2-lesson";
import { useTask2Path } from "./task2-path";
import "@/features/listening/listening-lab.css";
import "./writing-task2.css";

export function WritingTask2Lab() {
  const parts = usePathname().split("/").filter(Boolean);
  if (parts[3] === "course") return parts[4] ? <CourseModulePage key={parts[4]} id={decodeURIComponent(parts[4])} /> : <LabHome />;
  return parts[3] ? <LessonPage key={parts[3]} id={decodeURIComponent(parts[3])} /> : <LabHome />;
}

/** The lab's two halves: the R01–R16 skills course (default) and the 36 prompt-based lessons, each on its own path. */
function LabHome() {
  const params = useSearchParams();
  const router = useRouter();
  const tab = params.get("tab") === "luyen-de" ? "lessons" : "course";
  const show = (next: "course" | "lessons") => router.replace(next === "lessons" ? `${TASK2_BASE}?tab=luyen-de` : TASK2_BASE, { scroll: false });
  const tabs = <div className="t2-path"><div className="t2-lab-tabs" role="tablist" aria-label="Writing Task 2 Lab">
    <button type="button" role="tab" aria-selected={tab === "course"} onClick={() => show("course")}><b>Khoá kỹ năng</b><small>6 chặng · R01–R16</small></button>
    <button type="button" role="tab" aria-selected={tab === "lessons"} onClick={() => show("lessons")}><b>Luyện đề</b><small>36 bài theo đề</small></button>
  </div></div>;
  return tab === "course" ? <CourseHome tabs={tabs} onLessons={() => show("lessons")}/> : <RoadmapPage tabs={tabs}/>;
}

const themeStyle = (stage: Task2Stage) => ({ "--ll-tone": stageInfo[stage].tone, "--ll-soft": stageInfo[stage].soft }) as CSSProperties;


const howItWorks = [
  { icon: BookOpen, title: "Hiểu đề", text: "Đề hỏi gì, bẫy ở đâu, sẽ viết những câu nào." },
  { icon: Lightbulb, title: "Học cách làm", text: "Các bước tư duy và câu mẫu trước khi tự viết." },
  { icon: Sparkles, title: "Luyện từng câu", text: "Mỗi câu có cách làm, gợi ý 3 bậc, đáp án mẫu." },
  { icon: PenLine, title: "Viết và tự kiểm", text: "Ghép các câu đã viết thành bài, so với bài mẫu." },
];

function RoadmapPage({ tabs }: { tabs: ReactNode }) {
  const { course, view, error, level, setLevel } = useTask2Path();
  const streak = useLearnerStreak();
  if (error) return <LabShell tabs={tabs}><p className="ll-error" role="alert">{error}</p></LabShell>;
  if (!course || !view) return <LabShell tabs={tabs}><div className="ll-skeleton ll-skeleton-hero"/><div className="ll-skeleton ll-skeleton-row"/><div className="ll-skeleton ll-skeleton-card"/></LabShell>;

  const anyStarted = view.stages.some((stage) => stage.nodes.some((node) => node.progress));
  function pickLevel(stage: Task2Stage) {
    setLevel(stage);
    try { localStorage.setItem(TASK2_LEVEL_KEY, stage); } catch { /* the choice still applies on this visit */ }
  }

  const intro = !anyStarted && <section className="t2-path t2-start" aria-labelledby="t2-start-title">
    <div className="t2-start-how">
      <span className="ll-kicker">Bắt đầu ở đây</span>
      <h2 id="t2-start-title">Mỗi bài học đi qua 4 bước</h2>
      <ol>{howItWorks.map((item, i) => <li key={item.title}><span><item.icon size={17}/></span><div><b>{i + 1}. {item.title}</b><small>{item.text}</small></div></li>)}</ol>
      <p><Eye size={14}/> Bí ở câu nào cũng được xem đáp án mẫu. Xem xong, tự viết lại bằng lời của bạn mới tính là đã làm.</p>
    </div>
    <div className="t2-start-level">
      <h3>Bạn đang ở mức nào?</h3>
      <div role="radiogroup" aria-label="Chọn mức bắt đầu">{stageOrder.map((stage) => <button key={stage} type="button" role="radio" aria-checked={(level ?? "foundation") === stage} style={themeStyle(stage)} onClick={() => pickLevel(stage)}>
        <b>{stageInfo[stage].name}</b><span>{stageAbout[stage].who_vi}</span>
      </button>)}</div>
      <small>Chưa chắc thì chọn Nền tảng. Chọn chặng cao hơn thì bài đầu tiên của chặng đó thành bài tiếp theo; các chặng trước vẫn mở để xem lại.</small>
    </div>
  </section>;

  return <StudyPath course={course} view={view} streak={streak?.current ?? 0} top={tabs} intro={intro}>
    <p className="sp-footnote"><Sparkles size={15} aria-hidden/> Đề và bài mẫu là tài liệu luyện tập do đội ngũ biên soạn, không phải đề thi IELTS chính thức. Bài hoàn thành khi bạn làm hết câu luyện và lưu bài viết đủ độ dài; mức band ở đây là mức luyện nội bộ, không quy đổi sang band IELTS.</p>
  </StudyPath>;
}
