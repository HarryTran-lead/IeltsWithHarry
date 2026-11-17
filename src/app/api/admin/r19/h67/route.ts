import { viewer } from "@/lib/ielts-bank/server";
import { h67SafeStatus, isH67ReadOnlyPreflightEnabled } from "@/lib/r19/h67/preflight";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const headers = {
  "Cache-Control": "private, no-store",
  "X-Content-Type-Options": "nosniff",
};

export async function GET() {
  if (!isH67ReadOnlyPreflightEnabled(process.env)) {
    return Response.json({ error: "Not found" }, { status: 404, headers });
  }
  try {
    await viewer(true);
    return Response.json(h67SafeStatus(), { status: 200, headers });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const status = /Authentication required/.test(message) ? 401
      : /Admin access required/.test(message) ? 403 : 503;
    return Response.json({
      error: status === 401 ? "Authentication required"
        : status === 403 ? "Admin access required" : "Preflight unavailable",
    }, { status, headers });
  }
}

const denyWrite = () => Response.json(
  { error: "Read-only. Teacher reviews and gold exports are not released." },
  { status: 405, headers: { ...headers, Allow: "GET" } },
);
export const POST = denyWrite;
export const PUT = denyWrite;
export const PATCH = denyWrite;
export const DELETE = denyWrite;
