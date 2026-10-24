"use client";
import { usePathname } from "next/navigation";
import { DemoProvider, useDemo } from "@/features/demo/demo-store";
import { AppShell } from "@/components/layout/app-shell";
import { Dashboard } from "@/features/dashboard/dashboard";
import { PlannerPage } from "@/features/planner/planner-page";
import { LearningPage } from "@/features/learning/learning-page";

export function Portal() {
  return <DemoProvider><PortalContent /></DemoProvider>;
}

function PortalContent() {
  const pathname = usePathname();
  const { ready } = useDemo();
  const section = pathname.split("/")[2] || "dashboard";
  return (
      <AppShell>
        {!ready ? <div className="content-page">Loading your learning space…</div> : section === "dashboard" ? (
          <Dashboard />
        ) : section === "planner" ? (
          <PlannerPage />
        ) : (
          <LearningPage section={section} />
        )}
      </AppShell>
  );
}
