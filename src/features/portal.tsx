"use client";
import { usePathname } from "next/navigation";
import { DemoProvider } from "@/features/demo/demo-store";
import { AppShell } from "@/components/layout/app-shell";
import { Dashboard } from "@/features/dashboard/dashboard";
import { PlannerPage } from "@/features/planner/planner-page";
import { LearningPage } from "@/features/learning/learning-page";

export function Portal() {
  const pathname = usePathname();
  const section = pathname.split("/")[2] || "dashboard";
  return (
    <DemoProvider>
      <AppShell>
        {section === "dashboard" ? (
          <Dashboard />
        ) : section === "planner" ? (
          <PlannerPage />
        ) : (
          <LearningPage section={section} />
        )}
      </AppShell>
    </DemoProvider>
  );
}
