import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NextRequest } from "next/server";

const state = vi.hoisted(() => ({ isAdmin: true, adminCalls: 0 }));
vi.mock("@/lib/supabase/server", () => ({ createClient: async () => ({
  auth: { getClaims: async () => ({ data: { claims: { sub: "00000000-0000-4000-8000-000000000001" } } }) },
  rpc: async () => ({ data: state.isAdmin, error: null }),
}) }));
vi.mock("@/lib/news/sync", () => ({ newsAdminClient: () => { state.adminCalls++; throw new Error("database must not be reached"); } }));

import { GET, POST } from "../src/app/api/news/quiz-health/route";

function post(body: unknown, origin = "https://example.com") {
  const request = new Request("https://example.com/api/news/quiz-health", {
    method: "POST", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body),
  }) as unknown as NextRequest;
  Object.defineProperty(request, "nextUrl", { value: new URL("https://example.com/api/news/quiz-health") });
  return request;
}

beforeEach(() => { state.isAdmin = true; state.adminCalls = 0; });

describe("quiz health route", () => {
  it("refuses viewers who are not admins", async () => {
    state.isAdmin = false;
    expect((await GET()).status).toBe(403);
    expect((await POST(post({ all: true }))).status).toBe(403);
    expect(state.adminCalls).toBe(0);
  });
  it("refuses cross-site unlock requests", async () => {
    expect((await POST(post({ all: true }, "https://evil.example"))).status).toBe(403);
  });
  it("validates the articles to unlock before touching the database", async () => {
    expect((await POST(post({}))).status).toBe(400);
    expect((await POST(post({ articleIds: ["not-a-uuid"] }))).status).toBe(400);
    expect((await POST(post({ articleIds: new Array(101).fill("00000000-0000-4000-8000-000000000001") }))).status).toBe(400);
    expect(state.adminCalls).toBe(0);
  });
});
