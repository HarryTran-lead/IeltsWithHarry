import Link from "next/link";
export default function LoginPage() {
  return (
    <div className="public-container narrow">
      <span className="eyebrow">ACCOUNT ACCESS</span>
      <h1>Accounts are coming soon</h1>
      <p>
        This prototype uses local demo data. Supabase authentication is planned
        for the next phase, so we are not accepting sign-ins yet.
      </p>
      <div className="card public-message">
        <h2>Explore without an account</h2>
        <p>
          Try lessons and planner tasks now. Data you create stays in this
          browser.
        </p>
        <Link href="/app/dashboard" className="button primary">
          Open demo →
        </Link>
      </div>
    </div>
  );
}
