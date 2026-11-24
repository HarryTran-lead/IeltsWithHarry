import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ isAdmin: true, adminCalls: 0, quizRuns: 0 }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getClaims: async () => ({ data: { claims: { sub: "00000000-0000-4000-8000-000000000001" } } }) },
  rpc: async () => ({ data: state.isAdmin, error: null }),
}) }));
vi.mock("@/lib/news/sync", () => ({ newsAdminClient: () => { state.adminCalls++; throw new Error("database must not be reached"); } }));
vi.mock("@/lib/news/enrichment", () => ({ generateQuizForArticle: async () => { state.quizRuns++; return { status: "ready", message: "ok", questions: 8 }; } }));

import { GET, POST } from "../src/app/api/news/admin-pipeline/route";

const ARTICLE = "00000000-0000-4000-8000-0000000000aa";
function request(url: string, body?: unknown, origin = "https://example.com") {
  const value = new Request(url, body === undefined ? undefined : {
    method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body),
  }) as unknown as NextRequest;
  Object.defineProperty(value, "nextUrl", { value: new URL(url) });
  return value;
}

beforeEach(() => { state.isAdmin = true; state.adminCalls = 0; state.quizRuns = 0; });

describe("admin pipeline route", () => {
  it("refuses viewers who are not admins", async () => {
    state.isAdmin = false;
    expect((await GET(request("https://example.com/api/news/admin-pipeline"))).status).toBe(403);
    expect((await POST(request("https://example.com/api/news/admin-pipeline", { action: "quiz_now", articleId: ARTICLE }))).status).toBe(403);
    expect(state.adminCalls).toBe(0);
    expect(state.quizRuns).toBe(0);
  });
  it("refuses cross-site actions", async () => {
    const response = await POST(request("https://example.com/api/news/admin-pipeline", { action: "quiz_now", articleId: ARTICLE }, "https://evil.example"));
    expect(response.status).toBe(403);
    expect(state.quizRuns).toBe(0);
  });
  it("validates input before touching the database or Gemini", async () => {
    expect((await GET(request("https://example.com/api/news/admin-pipeline?view=article&id=nope"))).status).toBe(400);
    expect((await GET(request("https://example.com/api/news/admin-pipeline?view=logs&kind=quiz;drop"))).status).toBe(400);
    const post = (body: unknown) => POST(request("https://example.com/api/news/admin-pipeline", body));
    expect((await post({ action: "drop_everything", articleId: ARTICLE })).status).toBe(400);
    expect((await post({ action: "quiz_now", articleId: "not-a-uuid" })).status).toBe(400);
    expect((await post({ action: "question_remove", articleId: ARTICLE })).status).toBe(400);
    expect(state.adminCalls).toBe(0);
    expect(state.quizRuns).toBe(0);
  });
  it("runs one quiz for the chosen article on request", async () => {
    const response = await POST(request("https://example.com/api/news/admin-pipeline", { action: "quiz_now", articleId: ARTICLE }));
    expect(response.status).toBe(200);
    expect(state.quizRuns).toBe(1);
  });
});
