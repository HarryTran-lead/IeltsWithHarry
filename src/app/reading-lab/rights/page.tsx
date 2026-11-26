import Link from "next/link";

export default function ReadingLabRights() {
  return <main style={{ maxWidth: 760, margin: "3rem auto", padding: "0 1.5rem", lineHeight: 1.7 }}>
    <h1>Reading Lab · Content rights</h1>
    <p>The M08 Reading passages, questions, worked explanations, and illustrations are original AI-assisted learning materials published with authorization from the Harry Up owner. They are for practice and are not official IELTS examination materials.</p>
    <p>For permission requests or corrections, contact the Harry Up team through the site.</p>
    <Link href="/app/reading/lab">Open Reading Lab</Link>
  </main>;
}
