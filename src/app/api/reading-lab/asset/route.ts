import { requestError } from "@/lib/ielts-bank/server";
import { asset, readingLabViewer } from "@/lib/reading-lab/preview";

export const runtime = "nodejs";

export async function GET(request: Request) {
  try {
    await readingLabViewer();
    const params = new URL(request.url).searchParams;
    const { bytes, type } = await asset(params.get("milestone") ?? "", params.get("name") ?? "");
    return new Response(new Uint8Array(bytes), { headers: { "Content-Type": type, "Cache-Control": "private, no-store", "X-Content-Type-Options": "nosniff" } });
  } catch (error) { return requestError(error); }
}
