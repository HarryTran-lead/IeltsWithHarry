import { PageSkeleton } from "@/components/layout/page-skeleton";

export default function AdminLoading() {
  return <main style={{ padding: "28px 24px" }}><PageSkeleton label="Đang mở trang quản trị…" /></main>;
}
