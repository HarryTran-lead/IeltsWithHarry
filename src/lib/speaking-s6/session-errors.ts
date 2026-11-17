import { z } from "zod";

/** Do not disclose Supabase/table/RLS internals or private-bank details to learners. */
export const s6SessionNoStore = { "Cache-Control": "private, no-store" } as const;

export function s6SessionErrorResponse(error: unknown): Response {
  if (error instanceof z.ZodError) {
    return Response.json({ error: "SCHEMA_INVALID" }, { status: 422, headers: s6SessionNoStore });
  }
  if (error instanceof SyntaxError) {
    return Response.json({ error: "MALFORMED_JSON" }, { status: 400, headers: s6SessionNoStore });
  }
  const message = error instanceof Error ? error.message : "";
  if (message === "Authentication required") {
    return Response.json({ error: "AUTHENTICATION_REQUIRED" }, { status: 401, headers: s6SessionNoStore });
  }
  if (message === "Admin access required") {
    return Response.json({ error: "ADMIN_REQUIRED" }, { status: 403, headers: s6SessionNoStore });
  }
  return Response.json({ error: "S6_SESSION_UNAVAILABLE" }, { status: 503, headers: s6SessionNoStore });
}
