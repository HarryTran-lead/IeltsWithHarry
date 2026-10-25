import Link from "next/link";
import { ArrowRight, BadgeCheck, FileCheck2, ShieldCheck } from "lucide-react";
import { Sticker, Tape } from "@/components/stickers/stickers";
import { HeadIcon } from "@/components/ui/head-icon";

const principles = [
  { icon: FileCheck2, tone: "teal" as const, title: "Clear sources", text: "Reading material links back to its publisher, and full text is only shown when the licence allows it." },
  { icon: BadgeCheck, tone: "sun" as const, title: "Honest scoring", text: "Exercises are marked against fixed answer keys. Short practice scores are not IELTS band scores." },
  { icon: ShieldCheck, tone: "lavender" as const, title: "Your data stays yours", text: "Demo data stays in this browser. Account data is protected so only you can read your notes and progress." },
];

export default function AboutPage() {
  return (
    <div className="public-container">
      <header className="public-page-head">
        <div>
          <span className="eyebrow">ABOUT IELTSWITHHARRY</span>
          <h1>Small steps. <span className="hl">Big progress.</span></h1>
          <p>
            IeltsWithHarry is a friendly learning space for beginners and IELTS
            learners. Practice useful English, plan your week and see how each step
            adds up.
          </p>
        </div>
        <div className="sticker-cluster">
          <Sticker name="harry" size={112} tilt={-5} float />
          <Sticker name="bubble" label="Hi!" size={66} tilt={10} delay={140} />
          <Sticker name="heart" size={48} tilt={-10} delay={240} />
        </div>
      </header>
      <section className="about-grid">
        {principles.map((item) => <article key={item.title} className="card about-principle lift">
          <HeadIcon icon={item.icon} tone={item.tone} />
          <h2>{item.title}</h2>
          <p>{item.text}</p>
        </article>)}
      </section>
      <div className="card public-message about-now">
        <Tape tone="sun" />
        <div>
          <h2>What is available now?</h2>
          <p>
            This first demo includes an interactive dashboard, study planner and
            original sample exercises across six skills. Your demo data stays in
            this browser.
          </p>
          <Link className="button primary" href="/app/dashboard">
            Try the demo <ArrowRight size={16} />
          </Link>
        </div>
        <ul>
          <li><Sticker name="calendar" size={40} pop={false} /> Study planner & daily goal</li>
          <li><Sticker name="notebook" size={40} pop={false} /> Notebook for words and notes</li>
          <li><Sticker name="newspaper" size={40} pop={false} /> Daily English news</li>
          <li><Sticker name="headphones" size={40} pop={false} /> Six skill practice areas</li>
        </ul>
      </div>
    </div>
  );
}
