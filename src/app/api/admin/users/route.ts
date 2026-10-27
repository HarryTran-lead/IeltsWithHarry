import { randomBytes } from "node:crypto";
import { z } from "zod";
import { bankClient, viewer } from "../../../../lib/ielts-bank/server";

export const runtime = "nodejs";

const createUserSchema = z.object({
  name: z.string().trim().min(2).max(80),
  email: z.email().trim().toLowerCase().max(254),
});

const noStore = { "Cache-Control": "no-store" };

export async function POST(request: Request) {
  try {
    const actor = await viewer(true);
    const origin = request.headers.get("origin");
    if (origin && new URL(origin).host !== new URL(request.url).host) return Response.json({ error: "Invalid request origin" }, { status: 403, headers: noStore });
    if (Number(request.headers.get("content-length") || 0) > 4096) return Response.json({ error: "Request too large" }, { status: 413, headers: noStore });
    const parsed = createUserSchema.safeParse(await request.json());
    if (!parsed.success) return Response.json({ error: "Nhập họ tên và email hợp lệ." }, { status: 400, headers: noStore });

    const { name, email } = parsed.data;
    const password = randomBytes(24).toString("base64url");
    const admin = bankClient();
    const { data, error } = await admin.auth.admin.createUser({
      email, password, email_confirm: true, user_metadata: { display_name: name },
    });
    if (error || !data.user) {
      const conflict = /already|registered|exists|duplicate/i.test(error?.message || "");
      return Response.json({ error: conflict ? "Email này đã có tài khoản." : "Không tạo được tài khoản. Vui lòng thử lại." }, { status: conflict ? 409 : 500, headers: noStore });
    }

    const audit = await admin.from("admin_audit_log").insert({
      admin_id: actor.id, target_user: data.user.id, action: "create_user", details: { email, display_name: name },
    });
    if (audit.error) {
      // The account must not exist without an audit record. It was just created
      // and cannot yet have learner activity, so removing it is safe here.
      const rollback = await admin.auth.admin.deleteUser(data.user.id);
      return Response.json({ error: rollback.error ? "Tài khoản đã tạo nhưng ghi nhật ký thất bại. Liên hệ quản trị hệ thống để kiểm tra." : "Không ghi được nhật ký. Tài khoản chưa được tạo; hãy thử lại." }, { status: 500, headers: noStore });
    }
    return Response.json({ id: data.user.id, email, name, password }, { status: 201, headers: noStore });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unexpected error";
    const status = /Authentication required/.test(message) ? 401 : /Admin access required/.test(message) ? 403 : 500;
    return Response.json({ error: status === 500 ? "Không tạo được tài khoản. Vui lòng thử lại." : message }, { status, headers: noStore });
  }
}
