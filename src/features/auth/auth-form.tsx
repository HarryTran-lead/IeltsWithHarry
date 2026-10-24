"use client";
import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { demoMode, supabaseConfigured } from "@/lib/runtime";

export function AuthForm({ mode }: { mode: "login" | "register" | "forgot" | "reset" }) {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const inactive = demoMode || !supabaseConfigured;
  const titles = { login: "Welcome back", register: "Create your account", forgot: "Reset your password", reset: "Choose a new password" };

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true); setError(""); setMessage("");
    const supabase = createClient();
    let result: { error: { message: string } | null };
    if (mode === "login") result = await supabase.auth.signInWithPassword({ email, password });
    else if (mode === "register") result = await supabase.auth.signUp({
      email, password, options: { data: { display_name: name.trim() }, emailRedirectTo: `${location.origin}/auth/callback` },
    });
    else if (mode === "forgot") result = await supabase.auth.resetPasswordForEmail(email, { redirectTo: `${location.origin}/auth/callback?next=/reset-password` });
    else result = await supabase.auth.updateUser({ password });
    setBusy(false);
    if (result.error) { setError(result.error.message); return; }
    if (mode === "login") { router.push("/app/dashboard"); router.refresh(); }
    else if (mode === "reset") { setMessage("Password updated. You can now sign in."); await supabase.auth.signOut(); }
    else setMessage(mode === "register" ? "Check your email to confirm your account." : "If the address exists, a reset link is on its way.");
  }

  return <div className="public-container narrow">
    <span className="eyebrow">ENGLISH SKILL LAB</span>
    <h1>{titles[mode]}</h1>
    {inactive ? <div className="card public-message">
      <p>{demoMode ? "Local demo mode is enabled. Accounts are available after Supabase is configured." : "Account setup is waiting for a Supabase project."}</p>
      <Link href="/app/dashboard" className="button primary">Open demo →</Link>
    </div> : <div className="card public-message">
      <form onSubmit={submit} className="auth-form">
        {mode === "register" && <label>Display name<input required maxLength={80} value={name} onChange={(e) => setName(e.target.value)} /></label>}
        {mode !== "reset" && <label>Email<input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></label>}
        {mode !== "forgot" && <label>Password<input type="password" minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} required value={password} onChange={(e) => setPassword(e.target.value)} /></label>}
        {error && <p role="alert" className="form-error">{error}</p>}
        {message && <p role="status">{message}</p>}
        <button className="button primary" disabled={busy}>{busy ? "Please wait…" : mode === "login" ? "Sign in" : mode === "register" ? "Create account" : mode === "forgot" ? "Send reset link" : "Update password"}</button>
      </form>
      <p className="auth-links"><Link href="/login">Sign in</Link> · <Link href="/register">Register</Link> · <Link href="/forgot-password">Forgot password?</Link></p>
    </div>}
  </div>;
}
