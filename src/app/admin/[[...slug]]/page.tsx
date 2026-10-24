import Link from "next/link";
import { Card } from "@/components/ui/card";
export default function AdminPage() {
  return (
    <main className="admin-notice">
      <Card className="card">
        <span className="eyebrow">ADMIN CMS</span>
        <h1>Administration is not enabled</h1>
        <p>
          Publishing and content management require authenticated accounts and a
          configured database. This demo contains read-only sample lessons.
        </p>
        <Link href="/app/dashboard" className="button primary">
          Back to demo →
        </Link>
      </Card>
    </main>
  );
}
