"use client";
import dynamic from "next/dynamic";
import { usePathname } from "next/navigation";
import { Suspense } from "react";
import { DemoProvider, useDemo } from "@/features/demo/demo-store";
import { AppShell } from "@/components/layout/app-shell";
import { NotebookProvider } from "@/features/notebook/notebook-store";
import type { IeltsSkill } from "@/features/ielts/ielts-live-page";
import { lockedLearnerPath } from "@/lib/runtime";
import Link from "next/link";

// The catch-all learner route loads only the section being viewed.
const Dashboard = dynamic(() => import("@/features/dashboard/dashboard").then((module) => module.Dashboard));
const PlannerPage = dynamic(() => import("@/features/planner/planner-page").then((module) => module.PlannerPage));
const LearningPage = dynamic(() => import("@/features/learning/learning-page").then((module) => module.LearningPage));
const ContentLab = dynamic(() => import("@/features/content-lab/content-lab").then((module) => module.ContentLab));
const NotebookPage = dynamic(() => import("@/features/notebook/notebook-ui").then((module) => module.NotebookPage));
const NewsPortal = dynamic(() => import("@/features/news/news-portal").then((module) => module.NewsPortal));
const VocabularyHub = dynamic(() => import("@/features/vocabulary/vocabulary-hub").then((module) => module.VocabularyHub));
const VocabularyLanding = dynamic(() => import("@/features/vocabulary/vocabulary-landing").then((module) => module.VocabularyLanding));
const CollocationsPage = dynamic(() => import("@/features/vocabulary/collocations-page").then((module) => module.CollocationsPage));
const WordFormationPage = dynamic(() => import("@/features/vocabulary/word-formation-page").then((module) => module.WordFormationPage));
const ViEnTranslationPage = dynamic(() => import("@/features/vocabulary/vi-en-translation-page").then((module) => module.ViEnTranslationPage));
const IeltsLivePage = dynamic(() => import("@/features/ielts/ielts-live-page").then((module) => module.IeltsLivePage));
const IeltsSkillDashboard = dynamic(() => import("@/features/ielts/ielts-skill-dashboard").then((module) => module.IeltsSkillDashboard));
const IeltsModePreview = dynamic(() => import("@/features/ielts/ielts-mode-preview").then((module) => module.IeltsModePreview));
const BankStudent = dynamic(() => import("@/features/ielts/bank-student").then((module) => module.BankStudent));
const SpeakingMock = dynamic(() => import("@/features/ielts/speaking-mock").then((module) => module.SpeakingMock));
const YoutubeLab = dynamic(() => import("@/features/listening/youtube-lab").then((module) => module.YoutubeLab));
const ListeningVocabularyPage = dynamic(() => import("@/features/listening/listening-vocabulary-page").then((module) => module.ListeningVocabularyPage));
const ReadingVocabularyPage = dynamic(() => import("@/features/reading/reading-vocabulary-page").then((module) => module.ReadingVocabularyPage));
const GrammarGarden = dynamic(() => import("@/features/grammar/grammar-garden").then((module) => module.GrammarGarden));

export function Portal({ canManage = false }: { canManage?: boolean }) {
  return <DemoProvider><NotebookProvider><PortalContent canManage={canManage} /></NotebookProvider></DemoProvider>;
}

function PortalContent({ canManage }: { canManage: boolean }) {
  const pathname = usePathname();
  const { ready } = useDemo();
  const section = pathname.split("/")[2] || "dashboard";
  const skill = (["vocabulary", "grammar", "reading", "listening", "writing", "speaking"] as string[]).includes(section) ? section as IeltsSkill : null;
  const skillMode = pathname.split("/")[3];
  const needsStudyData = ["dashboard", "planner", "learn", "progress", "achievements"].includes(section)
    || (section === "vocabulary" && skillMode === "progress")
    || (section === "news" && skillMode === "learn" && Boolean(pathname.split("/")[4]));
  return (
      <AppShell canManage={canManage}>
        {lockedLearnerPath(pathname) ? <div className="content-page"><section className="card section-card"><h1>Chức năng đang chuẩn bị</h1><p>Nội dung đang được biên soạn và kiểm tra trước khi mở cho học viên.</p><Link className="button primary" href="/app/dashboard">Về Dashboard</Link></section></div> : !ready && needsStudyData ? <div className="content-page">Loading your learning space…</div> : section === "dashboard" ? (
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
        ) : skill === "vocabulary" && skillMode === "translation" ? (
          <ViEnTranslationPage />
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
        ) : skill === "reading" && skillMode === "vocabulary" ? (
          <ReadingVocabularyPage />
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
