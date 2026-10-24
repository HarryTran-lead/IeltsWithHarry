import { notFound } from "next/navigation";
import Link from "next/link";
import { stages } from "@/lib/demo-data";
export default async function CoursePage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const stage = stages.find((item) => item.id === slug);
  if (!stage) notFound();
  return (
    <div className="public-container">
      <span className="eyebrow">LEARNING STAGE</span>
      <h1>
        {stage.range} · {stage.name}
      </h1>
      <p>{stage.description}</p>
      <div className="card public-message">
        <h2>Explore the sample curriculum</h2>
        <p>
          Activities for each skill are available in demo mode. This stage is a
          learning milestone, not an official IELTS certification.
        </p>
        <Link href={`/app/learn/${stage.id}`} className="button primary">
          Open stage →
        </Link>
      </div>
    </div>
  );
}
