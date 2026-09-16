"use client";

import { FormEvent, useState } from "react";

export default function AccessPage() {
  const [passcode, setPasscode] = useState("");
  const [showPasscode, setShowPasscode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true); setError("");
    try {
      const response = await fetch("/api/access", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ passcode }) });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Hyrja nuk u pranua.");
      const requested = new URLSearchParams(window.location.search).get("next") ?? "/";
      const next = requested.startsWith("/") && !requested.startsWith("//") && !requested.startsWith("/access") ? requested : "/";
      window.location.replace(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Hyrja nuk u pranua.");
      setPasscode("");
    } finally {
      setBusy(false);
    }
  }

  return <main className="access-shell">
    <section className="access-card" aria-labelledby="access-title">
      <div className="access-brand"><span>T</span><div><strong>Tenderat</strong><small>AI Albania</small></div></div>
      <div className="access-lock" aria-hidden="true">⌁</div>
      <p className="eyebrow">HAPËSIRË PRIVATE E KOMPANISË</p>
      <h1 id="access-title">Vendosni kodin e aksesit</h1>
      <p className="access-copy">Kjo hapësirë përmban kapacitetet e kompanisë, dokumentet dhe analizat e tenderave.</p>
      <form onSubmit={submit}>
        <label htmlFor="company-passcode">Kodi i aksesit</label>
        <div className="access-input-wrap">
          <input id="company-passcode" autoFocus required type={showPasscode ? "text" : "password"} value={passcode} onChange={(event) => setPasscode(event.target.value)} autoComplete="current-password" aria-describedby={error ? "access-error" : undefined} />
          <button type="button" onClick={() => setShowPasscode((value) => !value)} aria-label={showPasscode ? "Fshih kodin" : "Shfaq kodin"}>{showPasscode ? "Fshih" : "Shfaq"}</button>
        </div>
        {error && <p id="access-error" className="form-error" role="alert">{error}</p>}
        <button className="primary-button" disabled={busy || !passcode}>{busy ? "Duke verifikuar…" : "Hap aplikacionin →"}</button>
      </form>
      <p className="access-help">Kodi jepet nga administratori i kompanisë.</p>
    </section>
  </main>;
}
