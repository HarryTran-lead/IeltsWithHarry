import Link from "next/link";
export default function AboutPage() {
  return (
    <div className="public-container">
      <span className="eyebrow">ABOUT IELTSWITHHARRY</span>
      <h1>Small steps. Big progress.</h1>
      <p>
        IeltsWithHarry is a friendly learning space for beginners and IELTS
        learners. Practice useful English, plan your week and see how each step
        adds up.
      </p>
      <div className="card public-message">
        <h2>What is available now?</h2>
        <p>
          This first demo includes an interactive dashboard, study planner and
          original sample exercises across six skills. Your demo data stays in
          this browser.
        </p>
        <Link className="button primary" href="/app/dashboard">
          Try the demo →
        </Link>
      </div>
    </div>
  );
}
