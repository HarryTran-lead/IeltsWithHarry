import { PageSkeleton } from "@/components/layout/page-skeleton";

/** Public pages that read the course catalog stream in behind this skeleton. */
export default function PublicLoading() {
  return <div className="public-container"><PageSkeleton /></div>;
}
