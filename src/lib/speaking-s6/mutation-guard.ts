/**
 * Cookie-authenticated S6 write operations are browser same-origin only.
 * POST additionally requires JSON to prevent form-based CSRF submissions.
 * No trusted proxy headers or user-controlled Host overrides are consulted.
 */
export function s6MutationGuard(request: Request, jsonBody = true): Response | null {
  const headers = { "Cache-Control": "private, no-store" };
  if (jsonBody && !/^application\/json(?:\s*;|\s*$)/i.test(request.headers.get("content-type") ?? "")) {
    return Response.json({ error: "JSON_REQUIRED" }, { status: 415, headers });
  }
  const site = request.headers.get("sec-fetch-site")?.toLowerCase();
  if (site && site !== "same-origin" && site !== "none") {
    return Response.json({ error: "CROSS_ORIGIN_DENIED" }, { status: 403, headers });
  }
  const origin = request.headers.get("origin");
  if (origin) {
    try {
      const supplied = new URL(origin);
      const target = new URL(request.url);
      if (supplied.origin !== target.origin || supplied.pathname !== "/" ||
          supplied.search || supplied.hash || supplied.username || supplied.password) {
        return Response.json({ error: "CROSS_ORIGIN_DENIED" }, { status: 403, headers });
      }
    } catch {
      return Response.json({ error: "CROSS_ORIGIN_DENIED" }, { status: 403, headers });
    }
  } else if (site !== "same-origin") {
    // Browser sends Origin for cross-site POST/DELETE; when absent,
    // accept only a browser-attested same-origin Fetch Metadata header.
    return Response.json({ error: "ORIGIN_REQUIRED" }, { status: 403, headers });
  }
  return null;
}
