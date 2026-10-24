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
    if (mode === "login") { const { data: isAdmin } = await supabase.rpc("is_admin"); router.push(isAdmin === true ? "/admin" : "/app/dashboard"); router.refresh(); }
    else if (mode === "reset") { setMessage("Password updated. You can now sign in."); await supabase.auth.signOut(); }
    else setMessage(mode === "register" ? "Check your email to confirm your account." : "If the address exists, a reset link is on its way.");
  }

  async function enterDemo(role: "student" | "admin") {
    setBusy(true); setError("");
    try {
      const response = await fetch("/auth/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
      if (!response.ok) throw new Error("Không mở được phiên demo. Hãy thử lại.");
      router.push(role === "admin" ? "/admin" : "/app/dashboard");
      router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không mở được phiên demo."); }
    finally { setBusy(false); }
  }

  return <div className="public-container narrow">
    <span className="eyebrow">ENGLISH SKILL LAB</span>
    <h1>{titles[mode]}</h1>
    {inactive ? <div className="card public-message">
      <p>{demoMode ? "Bản demo tách riêng Guest, học viên và admin. Phiên demo không tạo tài khoản thật; dữ liệu chỉ lưu trong trình duyệt này." : "Account setup is waiting for a Supabase project."}</p>
      {demoMode && (mode === "login" || mode === "register") && <div className="demo-role-actions"><button type="button" className="button primary" disabled={busy} onClick={() => void enterDemo("student")}>Vào trang học viên demo →</button><button type="button" className="button subtle" disabled={busy} onClick={() => void enterDemo("admin")}>Xem trang admin demo →</button></div>}
      {error && <p role="alert" className="form-error">{error}</p>}
      {demoMode && <p className="auth-links"><Link href="/">← Về trang Guest</Link></p>}
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
