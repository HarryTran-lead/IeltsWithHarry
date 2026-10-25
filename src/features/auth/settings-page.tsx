"use client";
import { useEffect, useState } from "react";
import { demoMode } from "@/lib/runtime";
import { PageHeader } from "@/components/ui/page-header";
import { createClient } from "@/lib/supabase/browser";

export function SettingsPage() {
  const [accountId, setAccountId] = useState("");
  const [name, setName] = useState("");
  const [timezone, setTimezone] = useState("Asia/Ho_Chi_Minh");
  const [goal, setGoal] = useState(5);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  useEffect(() => {
    if (demoMode) return;
    void Promise.resolve().then(async () => {
      const supabase = createClient();
      const [userResult, profileResult] = await Promise.all([
        supabase.auth.getUser(), supabase.from("profiles").select("display_name,timezone,daily_goal").single(),
      ]);
      if (userResult.error || profileResult.error) { setError(userResult.error?.message ?? profileResult.error!.message); return; }
      setAccountId(userResult.data.user.email ?? userResult.data.user.phone ?? "");
      setName(profileResult.data.display_name);
      setTimezone(profileResult.data.timezone);
      setGoal(profileResult.data.daily_goal);
    });
  }, []);
  if (demoMode) return <div className="content-page"><h1>Settings</h1><p>Profile settings become available with a Supabase account.</p></div>;
  async function save(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setMessage(""); setError("");
    const supabase = createClient();
    const { data: user, error: authError } = await supabase.auth.getUser();
    if (authError || !user.user) { setBusy(false); setError(authError?.message ?? "Sign in required"); return; }
    const { error } = await supabase.from("profiles").update({ display_name: name.trim(), timezone: timezone.trim(), daily_goal: goal }).eq("id", user.user.id);
    setBusy(false);
    if (error) setError(error.message); else setMessage("Profile saved.");
  }
  return <div className="content-page"><PageHeader eyebrow="MY ACCOUNT" title="Profile settings" description="Update the details used for your learning plan." sticker="harry" /><section className="card section-card"><form className="auth-form" onSubmit={save}><p>Tài khoản: {accountId || "Đang tải…"}</p><label>Display name<input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label><label>Timezone<input required maxLength={80} value={timezone} onChange={(e) => setTimezone(e.target.value)} /></label><label>Daily task goal<input required type="number" min={1} max={20} value={goal} onChange={(e) => setGoal(Number(e.target.value))} /></label>{error && <p role="alert" className="form-error">{error}</p>}{message && <p role="status">{message}</p>}<button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button></form></section></div>;
}
