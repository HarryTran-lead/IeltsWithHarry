import { NextResponse, type NextRequest } from "next/server";
import { demoMode } from "@/lib/runtime";
import { DEMO_ROLE_COOKIE } from "@/lib/viewer-role";

function sameOrigin(request: NextRequest) {
  const origin = request.headers.get("origin");
  return origin === new URL(request.url).origin;
}

export async function POST(request: NextRequest) {
  if (!demoMode) return new NextResponse(null, { status: 404 });
  if (!sameOrigin(request)) return new NextResponse("Invalid origin", { status: 403 });
  const body = await request.json().catch(() => null);
  if (body?.role !== "student" && body?.role !== "admin") return new NextResponse("Invalid demo role", { status: 400 });
  const response = NextResponse.json({ role: body.role });
  response.cookies.set(DEMO_ROLE_COOKIE, body.role, {
    httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:",
    path: "/", maxAge: 60 * 60 * 24 * 7,
  });
  return response;
}

export async function DELETE(request: NextRequest) {
  if (!demoMode) return new NextResponse(null, { status: 404 });
  if (!sameOrigin(request)) return new NextResponse("Invalid origin", { status: 403 });
  const response = NextResponse.json({ ok: true });
  response.cookies.set(DEMO_ROLE_COOKIE, "", { httpOnly: true, sameSite: "lax", secure: request.nextUrl.protocol === "https:", path: "/", maxAge: 0 });
  return response;
}
