"use client";
import dynamic from "next/dynamic";
import { usePathname, useRouter } from "next/navigation";
import { Suspense, useEffect } from "react";
import { DemoProvider, useDemo } from "@/features/demo/demo-store";
import { AppShell } from "@/components/layout/app-shell";
import { NotebookProvider } from "@/features/notebook/notebook-store";
import type { IeltsSkill } from "@/features/ielts/ielts-live-page";
import { communityEnabled, lockedLearnerPath, smartNotebookV1 } from "@/lib/runtime";
import Link from "next/link";
import { PageSkeleton } from "@/components/layout/page-skeleton";

function SectionLoading() {
  return <PageSkeleton />;
}

// The catch-all learner route loads only the section being viewed.
const Dashboard = dynamic(() => import("@/features/dashboard/dashboard").then((module) => module.Dashboard), { loading: SectionLoading });
const PlannerPage = dynamic(() => import("@/features/planner/planner-page").then((module) => module.PlannerPage), { loading: SectionLoading });
const LearningPage = dynamic(() => import("@/features/learning/learning-page").then((module) => module.LearningPage), { loading: SectionLoading });
const ContentLab = dynamic(() => import("@/features/content-lab/content-lab").then((module) => module.ContentLab), { loading: SectionLoading });
const NotebookPage = dynamic(() => import("@/features/notebook/notebook-ui").then((module) => module.NotebookPage), { loading: SectionLoading });
const SmartNotebook = dynamic(() => import("@/features/notebook/smart-notebook").then((module) => module.SmartNotebook), { loading: SectionLoading });
const NewsPortal = dynamic(() => import("@/features/news/news-portal").then((module) => module.NewsPortal), { loading: SectionLoading });
const VocabularyHub = dynamic(() => import("@/features/vocabulary/vocabulary-hub").then((module) => module.VocabularyHub), { loading: SectionLoading });
const TranslationWorkspace = dynamic(() => import("@/features/practice/translation-workspace").then((module) => module.TranslationWorkspace), { loading: SectionLoading });
const VocabularyLanding = dynamic(() => import("@/features/vocabulary/vocabulary-landing").then((module) => module.VocabularyLanding), { loading: SectionLoading });
const CollocationsPage = dynamic(() => import("@/features/vocabulary/collocations-page").then((module) => module.CollocationsPage), { loading: SectionLoading });
const WordFormationPage = dynamic(() => import("@/features/vocabulary/word-formation-page").then((module) => module.WordFormationPage), { loading: SectionLoading });
const ViEnTranslationPage = dynamic(() => import("@/features/vocabulary/vi-en-translation-page").then((module) => module.ViEnTranslationPage), { loading: SectionLoading });
const IeltsLivePage = dynamic(() => import("@/features/ielts/ielts-live-page").then((module) => module.IeltsLivePage), { loading: SectionLoading });
const IeltsSkillDashboard = dynamic(() => import("@/features/ielts/ielts-skill-dashboard").then((module) => module.IeltsSkillDashboard), { loading: SectionLoading });
const IeltsModePreview = dynamic(() => import("@/features/ielts/ielts-mode-preview").then((module) => module.IeltsModePreview), { loading: SectionLoading });
const BankStudent = dynamic(() => import("@/features/ielts/bank-student").then((module) => module.BankStudent), { loading: SectionLoading });
const SpeakingMock = dynamic(() => import("@/features/ielts/speaking-mock").then((module) => module.SpeakingMock), { loading: SectionLoading });
const YoutubeLab = dynamic(() => import("@/features/listening/youtube-lab").then((module) => module.YoutubeLab), { loading: SectionLoading });
const DictationHome = dynamic(() => import("@/features/listening/dictation-home").then((module) => module.DictationHome), { loading: SectionLoading });
const VoaDictation = dynamic(() => import("@/features/listening/voa-dictation").then((module) => module.VoaDictation), { loading: SectionLoading });
const ClipDictation = dynamic(() => import("@/features/listening/clip-dictation").then((module) => module.ClipDictation), { loading: SectionLoading });
const SkillLabDictation = dynamic(() => import("@/features/listening/skill-lab-dictation").then((module) => module.SkillLabDictation), { loading: SectionLoading });
const DictationQuickPractice = dynamic(() => import("@/features/listening/dictation-sessions").then((module) => module.DictationQuickPractice), { loading: SectionLoading });
const DictationReview = dynamic(() => import("@/features/listening/dictation-sessions").then((module) => module.DictationReview), { loading: SectionLoading });
const SkillLabPath = dynamic(() => import("@/features/listening/skill-lab-path").then((module) => module.SkillLabPath), { loading: SectionLoading });
const SkillLabCheck = dynamic(() => import("@/features/listening/skill-lab-path").then((module) => module.SkillLabCheck), { loading: SectionLoading });
const ListeningMock = dynamic(() => import("@/features/listening/listening-mock").then((module) => module.ListeningMock), { loading: SectionLoading });
const ListeningLab = dynamic(() => import("@/features/listening/listening-lab").then((module) => module.ListeningLab), { loading: SectionLoading });
const ListeningVocabularyPage = dynamic(() => import("@/features/listening/listening-vocabulary-page").then((module) => module.ListeningVocabularyPage), { loading: SectionLoading });
const ReadingVocabularyPage = dynamic(() => import("@/features/reading/reading-vocabulary-page").then((module) => module.ReadingVocabularyPage), { loading: SectionLoading });
const GrammarGarden = dynamic(() => import("@/features/grammar/grammar-garden").then((module) => module.GrammarGarden), { loading: SectionLoading });
const Community = dynamic(() => import("@/features/community/community").then((module) => module.Community), { loading: SectionLoading });

export function Portal({ canManage = false }: { canManage?: boolean }) {
  return <DemoProvider><NotebookProvider><PortalContent canManage={canManage} /></NotebookProvider></DemoProvider>;
}

function RetiredNumbersBank() {
  const router = useRouter();
  useEffect(() => { router.replace("/app/dictation"); }, [router]);
  return <PageSkeleton label="Đang mở kho Dictation…" />;
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
        {lockedLearnerPath(pathname) ? <div className="content-page"><section className="card section-card"><h1>Chức năng đang chuẩn bị</h1><p>Nội dung đang được biên soạn và kiểm tra trước khi mở cho học viên.</p><Link className="button primary" href="/app/dashboard">Về Dashboard</Link></section></div> : !ready && needsStudyData ? <PageSkeleton label="Loading your learning space…" /> : section === "dashboard" ? (
          <Dashboard />
        ) : section === "planner" ? (
          <PlannerPage />
        ) : section === "content-lab" ? (
          <ContentLab />
        ) : section === "notebook" ? (
          smartNotebookV1 ? <SmartNotebook /> : <NotebookPage />
        ) : section === "self-study" && skillMode === "listening" ? (
          <ListeningLab />
        ) : section === "dictation" ? (
          !skillMode ? <DictationHome />
            : skillMode === "practice" ? <Suspense fallback={<PageSkeleton label="Đang mở Luyện nhanh…" />}><DictationQuickPractice /></Suspense>
            : skillMode === "review" ? <DictationReview />
            : skillMode === "banks" && pathname.split("/")[4] === "skill-lab" ? (() => {
              // /skill-lab → path map · /skill-lab/placement · /skill-lab/stage/S1/test → checks · otherwise stage catalog or lesson
              const [, , , , , page, stage, extra] = pathname.split("/");
              if (!page) return <SkillLabPath />;
              if (page === "placement") return <SkillLabCheck />;
              if (page === "stage" && extra === "test") return <SkillLabCheck key={stage} stage={stage} />;
              return <SkillLabDictation />;
            })()
            : skillMode === "banks" && pathname.split("/")[4] === "numbers" ? <RetiredNumbersBank />
              : skillMode === "clips" || (skillMode === "banks" && pathname.split("/")[4] === "quick") ? <ClipDictation /> : <VoaDictation />
        ) : section === "practice" && skillMode === "translation" ? (
          <TranslationWorkspace />
        ) : section === "grammar" && skillMode !== "live" ? (
          <GrammarGarden />
        ) : skill === "vocabulary" && !skillMode ? (
          <VocabularyLanding />
        ) : skill === "vocabulary" && skillMode === "collocations" ? (
          <CollocationsPage />
        ) : skill === "vocabulary" && skillMode === "word-formation" ? (
          <WordFormationPage />
        ) : skill === "vocabulary" && skillMode === "translation" ? (
          <Suspense fallback={<PageSkeleton label="Đang tải bài luyện dịch…" />}><ViEnTranslationPage /></Suspense>
        ) : skill === "vocabulary" && skillMode === "listening" ? (
          <ListeningVocabularyPage />
        ) : skill && !skillMode ? (
          <IeltsSkillDashboard key={skill} skill={skill} />
        ) : skill === "speaking" && skillMode === "mock" ? (
          <SpeakingMock />
        ) : skill === "listening" && skillMode === "mock" ? (
          <ListeningMock />
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
          <Suspense fallback={<PageSkeleton label="Đang tải từ vựng…" />}><VocabularyHub /></Suspense>
        ) : skill ? (
          <IeltsSkillDashboard key={skill} skill={skill} />
        ) : section === "news" ? (
          <Suspense fallback={<PageSkeleton label="Đang tải Daily News…" />}><NewsPortal /></Suspense>
        ) : section === "question-bank" ? (
          <BankStudent examId={pathname.split("/")[3] === "exam" ? pathname.split("/")[4] : undefined} resultId={pathname.split("/")[3] === "result" ? pathname.split("/")[4] : undefined} attemptId={pathname.split("/")[3] === "attempt" ? pathname.split("/")[4] : undefined} />
        ) : section === "community" && communityEnabled ? (
          <Community canManage={canManage} />
        ) : section === "study-together" ? (
          <div className="study-room-placeholder" aria-hidden="true" />
        ) : (
          <LearningPage section={section} />
        )}
      </AppShell>
  );
}
