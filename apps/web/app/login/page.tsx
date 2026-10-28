"use client";
import { useState } from "react";
import { Zap } from "lucide-react";
import { api } from "@/lib/api";

export default function Login() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true); setErr("");
    try { await api("/auth/login", { method: "POST", body: JSON.stringify({ email, password }) }); window.location.href = "/"; }
    catch (x: any) { setErr(x.message); setBusy(false); }
  };
  return (
    <div className="login">
      <form onSubmit={submit}>
        <div className="brand" style={{ padding: 0, border: 0, marginBottom: 14 }}><i><Zap size={15} /></i> Agent Studio</div>
        <h1>Sign in</h1>
        <p className="muted" style={{ marginTop: 0 }}>Design, govern and run multi-agent systems.</p>
        {err && <div className="err" role="alert">{err}</div>}
        <label className="f">Email<input className="input" type="email" autoComplete="username" required autoFocus value={email} onChange={(e) => setEmail(e.target.value)} /></label>
        <label className="f">Password<input className="input" type="password" autoComplete="current-password" required value={password} onChange={(e) => setPassword(e.target.value)} /></label>
        <button className="btn pri" style={{ width: "100%", justifyContent: "center" }} disabled={busy}>{busy ? "Signing in…" : "Sign in"}</button>
      </form>
    </div>
  );
}
