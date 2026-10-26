"use client";

import { useRouter } from "next/navigation";
import { LogOut } from "lucide-react";
import { HarryMascot } from "@/components/illustrations/harry";
import { createClient } from "@/lib/supabase/browser";
import "./account.css";
import { untilLabel } from "@/lib/account";

/** Shown instead of the student portal while an admin has suspended the account. */
export function SuspendedNotice({ until, reason }: { until: string; reason: string }) {
  const router = useRouter();
  return <main className="suspended-notice">
    <div className="card">
      <HarryMascot size={96} />
      <h1>Tài khoản đang tạm khóa</h1>
      <p>Tài khoản của bạn bị tạm khóa {untilLabel(until)}.</p>
      {reason && <p className="suspended-reason"><b>Lý do:</b> {reason}</p>}
      <p>Nếu bạn nghĩ đây là nhầm lẫn, hãy liên hệ Harry để được hỗ trợ.</p>
      <button type="button" className="button subtle" onClick={async () => { await createClient().auth.signOut(); router.push("/login"); router.refresh(); }}><LogOut size={16} /> Đăng xuất</button>
    </div>
  </main>;
}
