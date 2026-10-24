"use client";
import { useEffect, useState } from "react";
import { demoMode } from "@/lib/runtime";
import { createClient } from "@/lib/supabase/browser";

export function SettingsPage() {
  const [email, setEmail] = useState("");
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
      setEmail(userResult.data.user.email ?? "");
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
  return <div className="content-page"><div className="learning-intro"><div><span className="eyebrow">MY ACCOUNT</span><h1>Profile settings</h1><p>Update the details used for your learning plan.</p></div></div><section className="card section-card"><form className="auth-form" onSubmit={save}><p>Email: {email || "Loading…"}</p><label>Display name<input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label><label>Timezone<input required maxLength={80} value={timezone} onChange={(e) => setTimezone(e.target.value)} /></label><label>Daily task goal<input required type="number" min={1} max={20} value={goal} onChange={(e) => setGoal(Number(e.target.value))} /></label>{error && <p role="alert" className="form-error">{error}</p>}{message && <p role="status">{message}</p>}<button className="button primary" disabled={busy}>{busy ? "Saving…" : "Save profile"}</button></form></section></div>;
}
