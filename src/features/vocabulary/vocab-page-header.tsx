import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import "./vocab-page-header.css";

/** The one page header for every Vocabulary screen: back link, collection label, title with an accent, one line of context. */
export function VocabPageHeader({ back = { href: "/app/vocabulary", label: "Từ vựng" }, label, title, description, action, aside }: {
  back?: { href: string; label: string };
  label?: string;
  title: React.ReactNode;
  description?: React.ReactNode;
  /** A control on the back-link row, e.g. a filter toggle. */
  action?: React.ReactNode;
  /** Content to the right of the title, e.g. a word count. */
  aside?: React.ReactNode;
}) {
  return <header className="vocab-page-head">
    <div className="vocab-page-top"><Link className="vocab-page-back" href={back.href}><ArrowLeft size={16} /> {back.label}</Link>{label && <span className="vocab-page-label">{label}</span>}{action}</div>
    <div className="vocab-page-title"><h1>{title}</h1>{description && <p>{description}</p>}</div>
    {aside}
  </header>;
}
