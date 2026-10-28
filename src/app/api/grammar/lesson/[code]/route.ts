import type { GrammarGuide, GrammarLevel, GrammarPracticeItem } from "@/lib/grammar/types";
import guides from "@/data/grammar/guides.json";
import { getViewerRole } from "@/lib/viewer-role";
import release from "@/data/grammar/release-approval.json";

const practiceLoaders = {
  A1: () => import("@/data/grammar/practice-A1.json"),
  A2: () => import("@/data/grammar/practice-A2.json"),
  B1: () => import("@/data/grammar/practice-B1.json"),
  B2: () => import("@/data/grammar/practice-B2.json"),
  C1: () => import("@/data/grammar/practice-C1.json"),
  C2: () => import("@/data/grammar/practice-C2.json"),
};

export async function GET(_request: Request, { params }: { params: Promise<{ code: string }> }) {
  if (!release.owner_approved) return Response.json({ error: "Content unavailable" }, { status: 404 });
  if (await getViewerRole() === "guest") return Response.json({ error: "Unauthorized" }, { status: 401 });
  const { code } = await params;
  if (!/^(A1|A2|B1|B2|C1|C2)-\d{2}$/.test(code)) return Response.json({ error: "Invalid lesson" }, { status: 400 });
  const guide = (guides as Record<string, GrammarGuide>)[code];
  if (!guide) return Response.json({ error: "Lesson not found" }, { status: 404 });
  const level = code.slice(0, 2) as GrammarLevel;
  const data = (await practiceLoaders[level]()).default as Record<string, GrammarPracticeItem[]>;
  return Response.json({ guide, items: data[code] ?? [] }, { headers: { "Cache-Control": "private, max-age=300" } });
}
