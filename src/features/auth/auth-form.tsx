"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/browser";
import { demoMode, emailDeliveryReady, googleAuthEnabled, phoneAuthEnabled, supabaseConfigured } from "@/lib/runtime";

type AuthMode = "login" | "register" | "forgot" | "reset";
type Identifier = "email" | "phone";

export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const [identifier, setIdentifier] = useState<Identifier>("email");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [otp, setOtp] = useState("");
  const [pendingPhone, setPendingPhone] = useState("");
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const inactive = demoMode || !supabaseConfigured;
  const titles = { login: "Đăng nhập", register: "Tạo tài khoản", forgot: "Khôi phục mật khẩu", reset: "Đặt mật khẩu mới" };

  useEffect(() => {
    if (new URLSearchParams(location.search).get("error") === "verification") {
      void Promise.resolve().then(() => setError("Liên kết xác minh đã hết hạn hoặc không hợp lệ. Hãy thử đăng nhập hoặc yêu cầu liên kết mới."));
    }
  }, []);

  async function goToAccount() {
    const { data: isAdmin } = await createClient().rpc("is_admin");
    router.replace(isAdmin === true ? "/admin" : "/app/dashboard");
    router.refresh();
  }

  async function submit(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    try {
      const supabase = createClient();
      if (mode === "login") {
        const credentials = identifier === "phone" ? { phone: phone.trim(), password } : { email: email.trim(), password };
        const { error: authError } = await supabase.auth.signInWithPassword(credentials);
        if (authError) throw authError;
        await goToAccount();
      } else if (mode === "register") {
        if (identifier === "phone") {
          if (!/^\+[1-9]\d{7,14}$/.test(phone.trim())) throw new Error("Nhập số điện thoại theo mã quốc gia, ví dụ +84901234567.");
          const { data, error: authError } = await supabase.auth.signUp({ phone: phone.trim(), password, options: { data: { display_name: name.trim() } } });
          if (authError) throw authError;
          if (data.session) await goToAccount();
          else { setPendingPhone(phone.trim()); setMessage("Nhập mã xác minh vừa gửi tới số điện thoại của bạn."); }
        } else {
          const { data, error: authError } = await supabase.auth.signUp({ email: email.trim(), password, options: { data: { display_name: name.trim() }, emailRedirectTo: `${location.origin}/auth/callback` } });
          if (authError) throw authError;
          if (data.session) await goToAccount();
          else setMessage("Kiểm tra email để xác nhận tài khoản, rồi quay lại đăng nhập.");
        }
      } else if (mode === "forgot") {
        if (identifier === "phone") {
          if (!/^\+[1-9]\d{7,14}$/.test(phone.trim())) throw new Error("Nhập số điện thoại theo mã quốc gia, ví dụ +84901234567.");
          const { error: authError } = await supabase.auth.signInWithOtp({ phone: phone.trim(), options: { shouldCreateUser: false } });
          if (authError) throw authError;
          setPendingPhone(phone.trim());
          setMessage("Nhập mã SMS và mật khẩu mới.");
        } else {
          const { error: authError } = await supabase.auth.resetPasswordForEmail(email.trim(), { redirectTo: `${location.origin}/auth/callback?next=/reset-password` });
          if (authError) throw authError;
          setMessage("Nếu email tồn tại, bạn sẽ nhận được liên kết đặt lại mật khẩu.");
        }
      } else {
        const { error: authError } = await supabase.auth.updateUser({ password });
        if (authError) throw authError;
        await supabase.auth.signOut();
        setMessage("Mật khẩu đã được cập nhật. Hãy đăng nhập lại.");
      }
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể hoàn tất. Hãy thử lại."); }
    finally { setBusy(false); }
  }

  async function verifyPhone(event: React.FormEvent) {
    event.preventDefault(); setBusy(true); setError("");
    try {
      const supabase = createClient();
      const { data, error: authError } = await supabase.auth.verifyOtp({ phone: pendingPhone, token: otp.trim(), type: "sms" });
      if (authError) throw authError;
      if (!data.session) throw new Error("Không tạo được phiên đăng nhập. Hãy thử lại.");
      if (mode === "forgot") {
        const { error: updateError } = await supabase.auth.updateUser({ password });
        if (updateError) throw updateError;
        await supabase.auth.signOut();
        setPendingPhone(""); setOtp(""); setMessage("Mật khẩu đã được cập nhật. Hãy đăng nhập lại.");
      } else await goToAccount();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Mã xác minh không hợp lệ."); }
    finally { setBusy(false); }
  }

  async function signInWithGoogle() {
    setBusy(true); setError("");
    try {
      const { data, error: authError } = await createClient().auth.signInWithOAuth({ provider: "google", options: { redirectTo: `${location.origin}/auth/callback`, skipBrowserRedirect: true } });
      if (authError) throw authError;
      if (!data.url) throw new Error("Không nhận được liên kết đăng nhập Google.");
      location.assign(data.url);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không thể đăng nhập Google."); setBusy(false); }
  }

  async function enterDemo(role: "student" | "admin") {
    setBusy(true); setError("");
    try {
      const response = await fetch("/auth/demo", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ role }) });
      if (!response.ok) throw new Error("Không mở được phiên demo. Hãy thử lại.");
      router.push(role === "admin" ? "/admin" : "/app/dashboard"); router.refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Không mở được phiên demo."); }
    finally { setBusy(false); }
  }

  return <div className="public-container narrow">
    <span className="eyebrow">ENGLISH SKILL LAB</span><h1>{titles[mode]}</h1>
    {inactive ? <div className="card public-message">
      <p>{demoMode ? "Bản demo tách riêng Guest, học viên và admin. Phiên demo không tạo tài khoản thật; dữ liệu chỉ lưu trong trình duyệt này." : "Đăng nhập đang chờ kết nối Supabase project."}</p>
      {demoMode && (mode === "login" || mode === "register") && <div className="demo-role-actions"><button type="button" className="button primary" disabled={busy} onClick={() => void enterDemo("student")}>Vào trang học viên demo →</button><button type="button" className="button subtle" disabled={busy} onClick={() => void enterDemo("admin")}>Xem trang admin demo →</button></div>}
      {error && <p role="alert" className="form-error">{error}</p>}
      {demoMode && <p className="auth-links"><Link href="/">← Về trang Guest</Link></p>}
    </div> : <div className="card public-message">
      {!emailDeliveryReady && (mode === "register" || mode === "forgot") && <p role="note">Email xác nhận hiện chỉ gửi được tới thành viên của project. Đăng ký và khôi phục mật khẩu cho mọi người sẽ hoạt động sau khi cấu hình dịch vụ gửi email riêng.</p>}
      {pendingPhone ? <form onSubmit={verifyPhone} className="auth-form">
        <p>Đã gửi mã SMS tới <strong>{pendingPhone}</strong>.</p>
        <label>Mã xác minh 6 chữ số<input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={otp} onChange={(event) => setOtp(event.target.value)} /></label>
        {mode === "forgot" && <label>Mật khẩu mới<input type="password" minLength={8} autoComplete="new-password" required value={password} onChange={(event) => setPassword(event.target.value)} /></label>}
        {error && <p role="alert" className="form-error">{error}</p>}
        <button className="button primary" disabled={busy}>{busy ? "Đang kiểm tra…" : mode === "forgot" ? "Xác minh và đổi mật khẩu" : "Xác minh và vào trang học"}</button>
        <button type="button" className="button subtle" onClick={() => { setPendingPhone(""); setOtp(""); }}>Dùng số khác</button>
      </form> : <>
        {(mode === "login" || mode === "register" || mode === "forgot") && phoneAuthEnabled && <div className="auth-methods" role="group" aria-label="Cách đăng nhập"><button type="button" className={identifier === "email" ? "active" : ""} onClick={() => { setIdentifier("email"); setError(""); }}>Email</button><button type="button" className={identifier === "phone" ? "active" : ""} onClick={() => { setIdentifier("phone"); setError(""); }}>Số điện thoại</button></div>}
        <form onSubmit={submit} className="auth-form">
          {mode === "register" && <label>Họ tên<input required maxLength={80} autoComplete="name" value={name} onChange={(event) => setName(event.target.value)} /></label>}
          {mode !== "reset" && (identifier === "email" ? <label>Email<input type="email" autoComplete="email" required value={email} onChange={(event) => setEmail(event.target.value)} /></label> : <label>Số điện thoại có mã quốc gia<input type="tel" autoComplete="tel" placeholder="+84901234567" pattern="\+[1-9][0-9]{7,14}" required value={phone} onChange={(event) => setPhone(event.target.value)} /></label>)}
          {mode !== "forgot" && <label>Mật khẩu<input type="password" minLength={8} autoComplete={mode === "login" ? "current-password" : "new-password"} required value={password} onChange={(event) => setPassword(event.target.value)} /></label>}
          {error && <p role="alert" className="form-error">{error}</p>}
          {message && <p role="status" className="auth-success">{message}</p>}
          <button className="button primary" disabled={busy}>{busy ? "Đang xử lý…" : mode === "login" ? "Đăng nhập" : mode === "register" ? "Tạo tài khoản" : mode === "forgot" ? identifier === "phone" ? "Gửi mã SMS" : "Gửi liên kết đặt lại" : "Cập nhật mật khẩu"}</button>
        </form>
        {(mode === "login" || mode === "register") && googleAuthEnabled && <div className="auth-social"><span>hoặc</span><button type="button" className="button subtle" disabled={busy} onClick={() => void signInWithGoogle()}>Tiếp tục với Google</button></div>}
        <p className="auth-links"><Link href="/login">Đăng nhập</Link> · <Link href="/register">Đăng ký</Link> · <Link href="/forgot-password">Quên mật khẩu?</Link></p>
      </>}
    </div>}
  </div>;
}
