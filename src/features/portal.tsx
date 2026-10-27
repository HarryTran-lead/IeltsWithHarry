"use client";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { DemoProvider, useDemo } from "@/features/demo/demo-store";
import { AppShell } from "@/components/layout/app-shell";
import { Dashboard } from "@/features/dashboard/dashboard";
import { PlannerPage } from "@/features/planner/planner-page";
import { LearningPage } from "@/features/learning/learning-page";
import { ContentLab } from "@/features/content-lab/content-lab";
import { NotebookProvider } from "@/features/notebook/notebook-store";
import { NotebookPage } from "@/features/notebook/notebook-ui";
import { NewsPortal } from "@/features/news/news-portal";
import { VocabularyHub } from "@/features/vocabulary/vocabulary-hub";
import { IeltsLivePage, type IeltsSkill } from "@/features/ielts/ielts-live-page";
import { IeltsSkillDashboard } from "@/features/ielts/ielts-skill-dashboard";
import { IeltsModePreview } from "@/features/ielts/ielts-mode-preview";
import { BankStudent } from "@/features/ielts/bank-student";
import { SpeakingMock } from "@/features/ielts/speaking-mock";

export function Portal({ canManage = false }: { canManage?: boolean }) {
  return <DemoProvider><NotebookProvider><PortalContent canManage={canManage} /></NotebookProvider></DemoProvider>;
}

function PortalContent({ canManage }: { canManage: boolean }) {
  const pathname = usePathname();
  const { ready } = useDemo();
  const section = pathname.split("/")[2] || "dashboard";
  const skill = (["vocabulary", "grammar", "reading", "listening", "writing", "speaking"] as string[]).includes(section) ? section as IeltsSkill : null;
  const skillMode = pathname.split("/")[3];
  return (
      <AppShell canManage={canManage}>
        {!ready ? <div className="content-page">Loading your learning space…</div> : section === "dashboard" ? (
          <Dashboard />
        ) : section === "planner" ? (
          <PlannerPage />
        ) : section === "content-lab" ? (
          <ContentLab />
        ) : section === "notebook" ? (
          <NotebookPage />
        ) : skill && !skillMode ? (
          <IeltsSkillDashboard key={skill} skill={skill} />
        ) : skill === "speaking" && skillMode === "mock" ? (
          <SpeakingMock />
        ) : skill && (skillMode === "live" || (skill === "writing" && (skillMode === "task-1" || skillMode === "task-2")) || (skill === "speaking" && skillMode === "part-3")) ? (
          <IeltsLivePage key={pathname} skill={skill} mode={skillMode} />
        ) : skill && skillMode === "mode" ? (
          <IeltsModePreview skill={skill} modeId={pathname.split("/")[4] || ""} />
        ) : section === "vocabulary" ? (
          <Suspense fallback={<div className="content-page">Đang tải từ vựng…</div>}><VocabularyHub /></Suspense>
        ) : skill ? (
          <IeltsSkillDashboard key={skill} skill={skill} />
        ) : section === "news" ? (
          <Suspense fallback={<div className="content-page">Đang tải Daily News…</div>}><NewsPortal /></Suspense>
        ) : section === "question-bank" ? (
          <BankStudent examId={pathname.split("/")[3] === "exam" ? pathname.split("/")[4] : undefined} resultId={pathname.split("/")[3] === "result" ? pathname.split("/")[4] : undefined} attemptId={pathname.split("/")[3] === "attempt" ? pathname.split("/")[4] : undefined} />
        ) : section === "study-together" ? (
          <div className="study-room-placeholder" aria-hidden="true" />
        ) : (
          <LearningPage section={section} />
        )}
      </AppShell>
  );
}
