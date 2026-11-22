import { z } from "zod";
import { requestError } from "@/lib/ielts-bank/server";
import { catalog, grade, publicExam, readingLabViewer } from "@/lib/reading-lab/preview";

export const runtime = "nodejs";
const requestSchema = z.object({
  milestone: z.string().max(8), sectionId: z.string().max(100).optional(),
  answers: z.record(z.string().max(100), z.string().max(2000)),
});
const privateHeaders = { "Cache-Control": "private, no-store" };

export async function GET(request: Request) {
  try {
    await readingLabViewer();
    const id = new URL(request.url).searchParams.get("milestone");
    return Response.json(id ? await publicExam(id) : { exams: await catalog() }, { headers: privateHeaders });
  } catch (error) { return requestError(error); }
}

export async function POST(request: Request) {
  try {
    await readingLabViewer();
    const body = requestSchema.parse(await request.json());
    return Response.json(await grade(body.milestone, body.sectionId, body.answers), { headers: privateHeaders });
  } catch (error) { return requestError(error); }
}
