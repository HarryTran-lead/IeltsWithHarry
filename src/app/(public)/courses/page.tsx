import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { stages } from "@/lib/demo-data";
export default function CoursesPage() {
  return (
    <div className="public-container">
      <span className="eyebrow">EXPLORE THE ROADMAP</span>
      <h1>Find your next learning step</h1>
      <p>
        Start with sample lessons and explore seven learning milestones. Full
        courses are being developed.
      </p>
      <div className="public-course-grid">
        {stages.map((stage) => (
          <Link href={`/app/learn/${stage.id}`} key={stage.id} className="card">
            <span>{stage.range}</span>
            <h2>{stage.name}</h2>
            <p>{stage.description}</p>
            <b>
              Explore stage <ArrowRight size={16} />
            </b>
          </Link>
        ))}
      </div>
    </div>
  );
}
