"use client";

import { FormEvent, useState } from "react";
import { getSupabaseBrowserClient } from "@/lib/supabase";

if (typeof window !== "undefined" && process.env.NEXT_PUBLIC_PASSWORDLESS_MODE === "1") window.location.replace("/");

export default function LoginPage() {
  const [mode, setMode] = useState<"login" | "signup">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault(); setBusy(true); setError(""); setMessage("");
    const client = getSupabaseBrowserClient();
    if (!client) { setError("Supabase nuk është konfiguruar."); setBusy(false); return; }
    const result = mode === "login" ? await client.auth.signInWithPassword({ email, password }) : await client.auth.signUp({ email, password });
    if (result.error) setError(result.error.message);
    else if (mode === "signup" && !result.data.session) setMessage("Kontrolloni email-in për të konfirmuar llogarinë.");
    else window.location.assign("/");
    setBusy(false);
  }

  return <main className="auth-shell"><section className="auth-card"><p className="eyebrow">Tenderat AI Albania</p><h1>{mode === "login" ? "Hyni në hapësirën e kompanisë" : "Krijoni llogarinë e kompanisë"}</h1><p className="auth-copy">Një hapësirë e përbashkët për profilet, buletinet dhe tenderat e kompanisë.</p><form onSubmit={submit}><label>Email<input required type="email" value={email} onChange={(event) => setEmail(event.target.value)} autoComplete="email" /></label><label>Fjalëkalimi<input required minLength={6} type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete={mode === "login" ? "current-password" : "new-password"} /></label>{error && <p className="form-error" role="alert">{error}</p>}{message && <p className="form-success" role="status">{message}</p>}<button className="primary-button" disabled={busy}>{busy ? "Duke punuar…" : mode === "login" ? "Hyr" : "Krijo llogari"}</button></form><button className="text-button" type="button" onClick={() => { setMode(mode === "login" ? "signup" : "login"); setError(""); setMessage(""); }}>{mode === "login" ? "Krijo llogarinë e parë" : "Kthehu te hyrja"}</button></section></main>;
}
