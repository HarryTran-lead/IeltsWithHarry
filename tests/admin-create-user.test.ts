import { beforeEach, describe, expect, it, vi } from "vitest";

const { viewer, createUser, auditInsert, deleteUser } = vi.hoisted(() => ({
  viewer: vi.fn(), createUser: vi.fn(), auditInsert: vi.fn(), deleteUser: vi.fn(),
}));
vi.mock("../src/lib/ielts-bank/server", () => ({
  viewer,
  bankClient: () => ({ auth: { admin: { createUser, deleteUser } }, from: () => ({ insert: auditInsert }) }),
}));
import { POST } from "../src/app/api/admin/users/route";

function request(body: unknown) {
  return new Request("https://example.org/api/admin/users", { method: "POST", headers: { "content-type": "application/json", origin: "https://example.org" }, body: JSON.stringify(body) });
}

describe("admin creates learner account", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    viewer.mockResolvedValue({ id: "admin-id" });
    createUser.mockResolvedValue({ data: { user: { id: "learner-id" } }, error: null });
    auditInsert.mockResolvedValue({ error: null });
    deleteUser.mockResolvedValue({ error: null });
  });

  it("rejects a non-admin before invoking the service role", async () => {
    viewer.mockRejectedValue(new Error("Admin access required"));
    const response = await POST(request({ name: "Example User", email: "person@example.org" }));
    expect(response.status).toBe(403);
    expect(createUser).not.toHaveBeenCalled();
  });

  it("creates a confirmed learner with a strong password and an audit record", async () => {
    const response = await POST(request({ name: " Example User ", email: "PERSON@example.org" }));
    const result = await response.json();
    expect(response.status).toBe(201);
    expect(response.headers.get("Cache-Control")).toBe("no-store");
    expect(result.password.length).toBeGreaterThanOrEqual(30);
    expect(createUser).toHaveBeenCalledWith({ email: "person@example.org", password: result.password, email_confirm: true, user_metadata: { display_name: "Example User" } });
    expect(auditInsert).toHaveBeenCalledWith({ admin_id: "admin-id", target_user: "learner-id", action: "create_user", details: { email: "person@example.org", display_name: "Example User" } });
  });

  it("rolls back a newly created account when audit logging fails", async () => {
    auditInsert.mockResolvedValue({ error: { message: "database unavailable" } });
    const response = await POST(request({ name: "Example User", email: "person@example.org" }));
    expect(response.status).toBe(500);
    expect(deleteUser).toHaveBeenCalledWith("learner-id");
  });
});
