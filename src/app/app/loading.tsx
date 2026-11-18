import { ShellSkeleton } from "@/components/layout/page-skeleton";

/** Shown at once while a learner route outside the portal (lesson, check) renders on the server. */
export default function LearnerLoading() {
  return <ShellSkeleton label="Đang mở bài học…" />;
}
