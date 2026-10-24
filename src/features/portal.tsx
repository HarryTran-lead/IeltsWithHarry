"use client";
import { usePathname } from "next/navigation";
import { DemoProvider, useDemo } from "@/features/demo/demo-store";
import { AppShell } from "@/components/layout/app-shell";
import { Dashboard } from "@/features/dashboard/dashboard";
import { PlannerPage } from "@/features/planner/planner-page";
import { LearningPage } from "@/features/learning/learning-page";
import { ContentLab } from "@/features/content-lab/content-lab";
import { NotebookProvider } from "@/features/notebook/notebook-store";
import { NotebookPage } from "@/features/notebook/notebook-ui";
import { NewsPortal } from "@/features/news/news-portal";

export function Portal({ canManage = false }: { canManage?: boolean }) {
  return <DemoProvider><NotebookProvider><PortalContent canManage={canManage} /></NotebookProvider></DemoProvider>;
}

function PortalContent({ canManage }: { canManage: boolean }) {
  const pathname = usePathname();
  const { ready } = useDemo();
  const section = pathname.split("/")[2] || "dashboard";
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
        ) : section === "news" ? (
          <NewsPortal />
        ) : (
          <LearningPage section={section} />
        )}
      </AppShell>
  );
}
