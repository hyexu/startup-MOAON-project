"use client";

import { useState } from "react";
import { supabaseBrowser } from "@/lib/admin/client";
import "../admin.css";

export default function Login() {
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  return (
    <main className="admin" style={{ maxWidth: 420 }}>
      <h1>모아온 운영자 로그인</h1>
      <form onSubmit={async (e) => {
        e.preventDefault();
        setBusy(true); setError(null);
        const f = new FormData(e.currentTarget);
        const { error } = await supabaseBrowser().auth.signInWithPassword({ email: String(f.get("email")), password: String(f.get("password")) });
        setBusy(false);
        if (error) setError("이메일 또는 비밀번호가 맞지 않습니다.");
        else location.href = "/admin";
      }}>
        <label>이메일<input id="email" name="email" type="email" autoComplete="username" required /></label>
        <label>비밀번호<input id="password" name="password" type="password" autoComplete="current-password" required /></label>
        {error && <p className="err">{error}</p>}
        <button className="go" disabled={busy}>{busy ? "로그인 중…" : "로그인"}</button>
      </form>
    </main>
  );
}
