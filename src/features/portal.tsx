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
import { VocabularyLanding } from "@/features/vocabulary/vocabulary-landing";
import { CollocationsPage } from "@/features/vocabulary/collocations-page";
import { WordFormationPage } from "@/features/vocabulary/word-formation-page";
import { IeltsLivePage, type IeltsSkill } from "@/features/ielts/ielts-live-page";
import { IeltsSkillDashboard } from "@/features/ielts/ielts-skill-dashboard";
import { lockedLearnerPath } from "@/lib/runtime";
import Link from "next/link";
import { IeltsModePreview } from "@/features/ielts/ielts-mode-preview";
import { BankStudent } from "@/features/ielts/bank-student";
import { SpeakingMock } from "@/features/ielts/speaking-mock";
import { YoutubeLab } from "@/features/listening/youtube-lab";
import { ListeningVocabularyPage } from "@/features/listening/listening-vocabulary-page";
import { GrammarGarden } from "@/features/grammar/grammar-garden";

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
        {lockedLearnerPath(pathname) ? <div className="content-page"><section className="card section-card"><h1>Chức năng đang chuẩn bị</h1><p>Nội dung đang được biên soạn và kiểm tra trước khi mở cho học viên.</p><Link className="button primary" href="/app/dashboard">Về Dashboard</Link></section></div> : !ready ? <div className="content-page">Loading your learning space…</div> : section === "dashboard" ? (
          <Dashboard />
        ) : section === "planner" ? (
          <PlannerPage />
        ) : section === "content-lab" ? (
          <ContentLab />
        ) : section === "notebook" ? (
          <NotebookPage />
        ) : section === "grammar" && skillMode !== "live" ? (
          <GrammarGarden />
        ) : skill === "vocabulary" && !skillMode ? (
          <VocabularyLanding />
        ) : skill === "vocabulary" && skillMode === "collocations" ? (
          <CollocationsPage />
        ) : skill === "vocabulary" && skillMode === "word-formation" ? (
          <WordFormationPage />
        ) : skill === "vocabulary" && skillMode === "listening" ? (
          <ListeningVocabularyPage />
        ) : skill && !skillMode ? (
          <IeltsSkillDashboard key={skill} skill={skill} />
        ) : skill === "speaking" && skillMode === "mock" ? (
          <SpeakingMock />
        ) : skill === "listening" && skillMode === "youtube" ? (
          <YoutubeLab />
        ) : skill === "listening" && skillMode === "vocabulary" ? (
          <ListeningVocabularyPage />
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
