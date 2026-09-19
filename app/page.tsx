"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { AppSnapshot, AuthorityFacet, Bulletin, TenderRecord } from "@/lib/types";
import { decisionLabel } from "@/lib/matcher";

const emptySnapshot: AppSnapshot = { company: { companyName: "", trades: [], cpvPrefixes: [], serviceRegions: [], minValueAll: null, maxValueAll: null, licences: [], preferredAuthorities: [], excludedTerms: [], availableEmployees: null, availableEquipment: [], maxConcurrentProjects: null, currentProjects: 0 }, bulletins: [], tenders: [], authorityFacets: [] };

function money(value: number | null) {
  return value == null ? "Nuk është publikuar" : new Intl.NumberFormat("sq-AL", { style: "currency", currency: "ALL", maximumFractionDigits: 0 }).format(value);
}

function dateLabel(value: string | null) {
  if (!value) return "Pa afat të qartë";
  const date = new Date(value); if (Number.isNaN(date.getTime())) return "Datë e pavlefshme";
  return new Intl.DateTimeFormat("sq-AL", { day: "numeric", month: "short", year: "numeric" }).format(date);
}

function daysTo(value: string | null) {
  if (!value) return null;
  const timestamp = Date.parse(value); return Number.isFinite(timestamp) ? Math.ceil((timestamp - Date.now()) / 86_400_000) : null;
}

function decisionClass(decision: TenderRecord["match"]["decision"]) {
  return `pill pill-${decision}`;
}

export default function Home() {
  const [snapshot, setSnapshot] = useState<AppSnapshot>(emptySnapshot);
  const [period, setPeriod] = useState<"30d" | "90d" | "all">("30d");
  const [decision, setDecision] = useState("all");
  const [query, setQuery] = useState("");
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const [authorityIds, setAuthorityIds] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [deletingBulletinId, setDeletingBulletinId] = useState("");
  const [dragActive, setDragActive] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  const snapshotRequest = useRef<AbortController | null>(null);

  const refresh = useCallback(async () => {
    snapshotRequest.current?.abort();
    const controller = new AbortController();
    snapshotRequest.current = controller;
    setError("");
    try {
      const params = new URLSearchParams({ period, decision });
      if (debouncedQuery) params.set("q", debouncedQuery);
      authorityIds.forEach((authorityId) => params.append("authority", authorityId));
      const response = await fetch(`/api/snapshot?${params.toString()}`, { cache: "no-store", signal: controller.signal });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const next = await response.json() as AppSnapshot;
      if (snapshotRequest.current === controller) setSnapshot(next);
    } catch (cause) {
      if (cause instanceof DOMException && cause.name === "AbortError") return;
      console.error("[dashboard] snapshot failed", cause);
      if (snapshotRequest.current === controller) setError("Të dhënat nuk u ngarkuan. Kontrolloni serverin dhe provoni përsëri.");
    } finally {
      if (snapshotRequest.current === controller) setLoading(false);
    }
  }, [authorityIds, decision, period, debouncedQuery]);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebouncedQuery(query.trim()), 300);
    return () => window.clearTimeout(timer);
  }, [query]);

  useEffect(() => { void refresh(); }, [refresh]);
  useEffect(() => () => snapshotRequest.current?.abort(), []);

  useEffect(() => {
    const hasPending = snapshot.bulletins.some((bulletin) => ["queued", "processing"].includes(bulletin.status));
    if (!hasPending) return;
    const timer = window.setInterval(() => { void refresh(); }, 5000);
    return () => window.clearInterval(timer);
  }, [refresh, snapshot.bulletins]);

  const uploadFiles = async (files: FileList | File[]) => {
    const pdfs = [...files].filter((file) => file.name.toLowerCase().endsWith(".pdf"));
    if (!pdfs.length) { setMessage("Zgjidhni një ose më shumë skedarë PDF."); return; }
    setUploading(true); setMessage(""); setError("");
    let accepted = 0; const failures: string[] = [];
    try {
      for (const file of pdfs) {
        const preparation = await fetch("/api/bulletins/upload-url", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileName: file.name, size: file.size, contentType: file.type }) });
        const target = await preparation.json().catch(() => null) as { uploadUrl?: string; path?: string; error?: string } | null;
        if (!preparation.ok || !target?.uploadUrl || !target.path) { failures.push(`${file.name}: ${target?.error ?? "ngarkimi nuk u përgatit"}`); continue; }
        const uploadBody = new FormData();
        uploadBody.append("cacheControl", "3600");
        uploadBody.append("", file);
        const uploaded = await fetch(target.uploadUrl, { method: "PUT", headers: { "x-upsert": "false" }, body: uploadBody });
        if (!uploaded.ok) { failures.push(`${file.name}: PDF-ja nuk u ruajt në cloud`); continue; }
        const response = await fetch("/api/bulletins/complete-upload", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ fileName: file.name, path: target.path }) });
        if (response.ok) accepted += 1;
        else { const body = await response.json().catch(() => null) as { error?: string } | null; failures.push(`${file.name}: ${body?.error ?? "ngarkimi dështoi"}`); }
      }
      setMessage(`${accepted} ${accepted === 1 ? "buletin u dërgua" : "buletine u dërguan"}. Analiza po vazhdon në sfond.`);
      if (failures.length) setError(failures.join(" "));
      await refresh();
    } catch { setError("Lidhja u ndërpre gjatë ngarkimit. Provoni përsëri."); }
    finally { setUploading(false); }
  };

  const activeCount = snapshot.tenders.filter((record) => record.match.opportunityStatus === "open" && (!record.tender.submissionDeadline || Date.parse(record.tender.submissionDeadline) > Date.now())).length;
  const highFitCount = snapshot.tenders.filter((record) => ["high_fit", "good_fit"].includes(record.match.decision)).length;
  const verificationCount = snapshot.tenders.filter((record) => record.match.opportunityStatus === "open" && ((record.match.criticalUnknowns?.length ?? 0) > 0 || record.match.eligibility === "eligibility_pending")).length;
  const deliveryGapCount = snapshot.tenders.filter((record) => record.match.opportunityStatus === "open" && (record.match.deliveryReadinessScore ?? 0) < 65 && (record.match.suitabilityScore ?? record.match.score) >= 65).length;
  const recommended = useMemo(() => snapshot.tenders.filter((record) => record.match.opportunityStatus === "open" && record.match.decision !== "blocked").slice(0, 4), [snapshot.tenders]);
  const soonest = useMemo(() => [...snapshot.tenders].filter((record) => record.tender.lifecycleStatus === "active" && record.tender.submissionDeadline && Date.parse(record.tender.submissionDeadline) > Date.now()).sort((a, b) => Date.parse(a.tender.submissionDeadline!) - Date.parse(b.tender.submissionDeadline!))[0], [snapshot.tenders]);

  const saveFeedback = async (tenderId: string, relevant: boolean) => {
    setError("");
    try {
      const response = await fetch("/api/feedback", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ tenderId, relevant }) });
      if (!response.ok) { const body = await response.json().catch(() => null) as { error?: string } | null; throw new Error(body?.error ?? "Feedback-u nuk u ruajt."); }
      setMessage(relevant ? "Relevanca u ruajt." : "Tenderi u shënua si jo relevant."); await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Feedback-u nuk u ruajt."); }
  };

  const retryBulletin = async (id: string) => {
    setError(""); setMessage("");
    try {
      const response = await fetch(`/api/bulletins/${encodeURIComponent(id)}/process`, { method: "POST" });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Procesimi nuk mund të rinisej.");
      setMessage("Procesimi u rinis dhe po vazhdon në sfond.");
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Procesimi nuk mund të rinisej."); }
  };

  const deleteBulletin = async (bulletin: Bulletin) => {
    const confirmed = window.confirm(`Ta hiqni Buletinin Nr. ${bulletin.bulletinNumber}?\n\nDo të fshihen PDF-ja dhe ${bulletin.noticeCount} njoftimet e nxjerra prej tij. Ky veprim nuk mund të zhbëhet.`);
    if (!confirmed) return;
    setDeletingBulletinId(bulletin.id); setError(""); setMessage("");
    try {
      const response = await fetch(`/api/bulletins/${encodeURIComponent(bulletin.id)}`, { method: "DELETE" });
      const body = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(body?.error ?? "Buletini nuk mund të hiqej.");
      setMessage(`Buletini Nr. ${bulletin.bulletinNumber} dhe ${bulletin.noticeCount} njoftimet e tij u hoqën.`);
      await refresh();
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Buletini nuk mund të hiqej."); }
    finally { setDeletingBulletinId(""); }
  };

  return <div className="app-shell">
    <aside className="sidebar">
      <div className="brand"><span className="brand-mark">T</span><span><strong>Tenderat</strong><small>AI Albania</small></span></div>
      <div className="workspace"><span className="avatar">A</span><span><b>{snapshot.company.companyName || "Kompania juaj"}</b><small>Hapësirë private</small></span><span className="chevron">⌄</span></div>
      <nav aria-label="Navigimi kryesor">
        <span className="nav-label">PUNA KRYESORE</span>
        <a className="nav-item active" href="#overview"><span>◒</span>Përmbledhja</a>
        <a className="nav-item" href="#opportunities"><span>◇</span>Të gjitha tenderat</a>
        <a className="nav-item" href="#bulletins"><span>▤</span>Buletinet</a>
        <span className="nav-label nav-space">KOMPANIA</span>
        <Link className="nav-item" href="/capabilities"><span>◎</span>Kapacitetet</Link>
        <a className="nav-item" href="#settings"><span>⚙</span>Cilësimet</a>
      </nav>
      <div className="sidebar-foot"><div className="source-status"><span className="online-dot"/>Burimi APP <b>Manual</b></div><p>Ngarkoni buletinin e fundit dhe ne bëjmë pjesën tjetër.</p></div>
    </aside>

    <main className="main-content">
      <header className="topbar"><div className="breadcrumb"><span>HAPËSIRA E KOMPANISË</span><i>/</i><b>PËRMBLEDHJA</b></div><div className="top-actions"><span className="last-sync">Hapësirë private · të dhënat tuaja ruhen në cloud</span><button className="icon-button" aria-label="Njoftimet">♢<span className="notification-dot"/></button><span className="user-avatar">A</span></div></header>

      <section className="hero" id="overview">
        <div><p className="eyebrow light">INTELIGJENCË PËR TENDERAT</p><h1>Gjeni punën që kompania juaj mund të fitojë.</h1><p className="hero-copy">Ngarkoni buletinin e APP-së. Tenderat AI lexon çdo njoftim, kontrollon përputhjen me kapacitetet tuaja dhe vendos më të vlefshmet në krye.</p></div>
        <div className="hero-note"><span className="note-icon">✦</span><div><b>Renditje me arsye</b><p>Çdo rezultat lidhet me tekstin dhe faqen e PDF-së.</p></div></div>
      </section>

      <section className="metrics" aria-label="Treguesit kryesorë">
        <div className="metric-card"><span className="metric-icon blue">◇</span><div><small>TENDERAT NË PERIUDHË</small><strong>{loading ? "—" : activeCount}</strong><p>njoftime aktive</p></div></div>
        <div className="metric-card"><span className="metric-icon mint">↗</span><div><small>PËRSHTATJE TË MIRA</small><strong>{loading ? "—" : highFitCount}</strong><p>ia vlen t’i hapni</p></div></div>
        <div className="metric-card"><span className="metric-icon amber">◷</span><div><small>AFATI MË I AFËRT</small><strong>{soonest ? (daysTo(soonest.tender.submissionDeadline) ?? 0) : "—"}</strong><p>{soonest ? "ditë · " + soonest.tender.referenceNumber : "pa afat të gjetur"}</p></div></div>
        <div className="metric-card readiness-card"><div className="readiness-ring" style={{ background: `conic-gradient(#58bdb0 0 ${snapshot.readiness?.overallScore ?? 0}%, #e8eef2 ${snapshot.readiness?.overallScore ?? 0}%)` }}><span>{snapshot.readiness?.overallScore ?? 0}%</span></div><div><small>GATISHMËRIA</small><strong>Profili i kompanisë</strong><p><Link href="/capabilities">{snapshot.readiness?.readyForMatching ? "Shiko profilin →" : "Përfundojeni profilin →"}</Link></p></div></div>
      </section>

      <section className="upload-panel" onDragEnter={(event) => { event.preventDefault(); setDragActive(true); }} onDragOver={(event) => event.preventDefault()} onDragLeave={() => setDragActive(false)} onDrop={(event) => { event.preventDefault(); setDragActive(false); void uploadFiles(event.dataTransfer.files); }}>
        <div className={`drop-zone ${dragActive ? "drag-active" : ""}`}><div className="upload-symbol">↑</div><div><h2>{uploading ? "PDF-ja po ngarkohet…" : "Ngarkoni buletinin e APP-së"}</h2><p>Tërhiqeni këtu një ose disa PDF të buletineve të prokurimit publik.</p><span className="upload-meta">PDF · deri në 50 MB · analizë automatike · pa futje manuale</span></div><button className="primary-button" type="button" onClick={() => fileInput.current?.click()} disabled={uploading}>{uploading ? "Duke ngarkuar…" : "Zgjidhni PDF"}</button><input ref={fileInput} type="file" accept="application/pdf,.pdf" multiple hidden onChange={(event) => { if (event.target.files) void uploadFiles(event.target.files); }} /></div>
        {message && <div className="upload-message" role="status">✓ {message}</div>}
        {error && <div className="error-message" role="alert">{error}<button type="button" onClick={() => void refresh()}>Riprovo</button></div>}
      </section>

      <section className="content-grid" id="opportunities">
        <div className="section-card opportunity-card"><div className="section-heading"><div><p className="eyebrow">REKOMANDUAR PËR JU</p><h2>Mundësitë më të mira</h2></div><a href="#all-tenders">Shiko të gjitha <span>→</span></a></div>{loading ? <div className="loading-state">Duke ngarkuar tenderat…</div> : recommended.map((record) => <OpportunityRow key={record.tender.id} record={record} />)}{!loading && !recommended.length && <EmptyState />}</div>
        <div className="section-card insight-card"><div className="section-heading"><div><p className="eyebrow">RADHA E PUNËS</p><h2>Çfarë kërkon vëmendje</h2></div><span className="spark">✦</span></div><div className="insight-stat"><strong>{highFitCount}</strong><span>mundësi të mira në pamjen aktuale</span></div><div className="insight-line"><span className="line-icon">?</span><p><b>{verificationCount} tendera</b> kanë kritere ose prova që duhen verifikuar para vendimit.</p></div><div className="insight-line"><span className="line-icon warning">!</span><p><b>{deliveryGapCount} mundësi</b> përshtaten me fushën, por kërkojnë ekip, partner ose pajisje të konfirmuar.</p></div><Link className="text-link" href="/capabilities">Kontrolloni profilin e kompanisë →</Link></div>
      </section>

      <section className="section-card all-tenders" id="all-tenders"><div className="section-heading tender-heading"><div><p className="eyebrow">ARKIVA E KOMPANISË</p><h2>Tenderat e zbuluar</h2><p className="section-subtitle">Kërkoni në njoftimet e ngarkuara dhe krahasoni periudhat.</p></div><div className="period-tabs" role="tablist">{([["30d", "30 ditë"], ["90d", "3 muaj"], ["all", "Të gjitha"]] as const).map(([value, label]) => <button key={value} role="tab" aria-selected={period === value} className={period === value ? "selected" : ""} onClick={() => setPeriod(value)}>{label}</button>)}</div></div><div className="filters"><label className="search-box"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Kërko sipas objektit, autoritetit ose REF…" aria-label="Kërko tendera" /></label><select value={decision} onChange={(event) => setDecision(event.target.value)} aria-label="Filtro sipas përputhjes"><option value="all">Të gjitha përputhjet</option><option value="high_fit">Përshtatje shumë e lartë</option><option value="good_fit">Përshtatje e mirë</option><option value="review">Për rishikim</option><option value="blocked">Të bllokuara</option></select><AuthorityFilter facets={snapshot.authorityFacets ?? []} selected={authorityIds} onChange={setAuthorityIds} /></div><div className="table-head"><span>TENDERI</span><span>AUTORITETI</span><span>FONDI LIMIT</span><span>AFATI</span><span>PËRPUTHJA</span><span/></div>{loading ? <div className="loading-state">Duke përgatitur arkivin…</div> : snapshot.tenders.map((record) => <TenderTableRow key={record.tender.id} record={record} onFeedback={(relevant) => void saveFeedback(record.tender.id, relevant)} />)}{!loading && !snapshot.tenders.length && <EmptyState />}</section>

      <section className="bottom-grid" id="bulletins"><div className="section-card bulletin-card"><div className="section-heading"><div><p className="eyebrow">HISTORIKU I NGARKIMEVE</p><h2>Buletinet</h2></div><span className="count-badge">{snapshot.bulletins.length}</span></div>{snapshot.bulletins.map((bulletin) => <BulletinRow key={bulletin.id} bulletin={bulletin} onRetry={retryBulletin} onDelete={(item) => void deleteBulletin(item)} deleting={deletingBulletinId === bulletin.id} />)}</div><div className="section-card privacy-card" id="settings"><span className="privacy-icon">⌁</span><h2>Burim i kontrolluar</h2><p>PDF-të ruhen në hapësirën private të kompanisë. Asnjë informacion nuk dërgohet te APP automatikisht.</p><span className="secure-label">● PRIVATE WORKSPACE</span></div></section>
      <footer className="footer"><span>Tenderat AI Albania · hapësirë private</span><span>Burimi: APP · analizë e asistuar · verifikoni gjithmonë dokumentet zyrtare</span></footer>
    </main>
  </div>;
}

function OpportunityRow({ record }: { record: TenderRecord }) {
  return <Link href={`/tenders/${encodeURIComponent(record.tender.id)}`} className="opportunity-row"><div className="score-badge"><strong>{record.match.suitabilityScore ?? record.match.score}</strong><small>përshtatje</small></div><div className="opportunity-main"><div className="row-meta"><span>{record.tender.contractingAuthority}</span><span>·</span><span>{record.tender.referenceNumber}</span></div><h3>{record.tender.contractObject}</h3><div className="tag-row"><span className={decisionClass(record.match.decision)}>{decisionLabel(record.match.decision)}</span><span className="tag">Realizimi {record.match.deliveryReadinessScore == null ? "për verifikim" : `${record.match.deliveryReadinessScore}%`}</span><span className="tag">Provat {record.match.confidenceScore ?? record.match.evidenceCoverage}%</span>{record.tender.cpvCodes.slice(0, 1).map((code) => <span className="tag" key={code}>CPV {code}</span>)}</div></div><div className="opportunity-deadline"><small>AFATI</small><b>{dateLabel(record.tender.submissionDeadline)}</b></div><span className="row-arrow">→</span></Link>;
}

function TenderTableRow({ record, onFeedback }: { record: TenderRecord; onFeedback: (relevant: boolean) => void }) {
  const remainingDays = daysTo(record.tender.submissionDeadline);
  const eligibility = record.match.eligibility === "eligible" ? "Kriteret mbulohen" : record.match.eligibility === "not_eligible" ? "Kriter i pambuluar" : "Kërkon verifikim";
  return <div className="table-row"><Link href={`/tenders/${encodeURIComponent(record.tender.id)}`} className="table-title"><strong>{record.tender.referenceNumber}</strong><span>{record.tender.contractObject}</span></Link><span className="authority-cell">{record.tender.contractingAuthority}</span><span className="amount-cell">{money(record.tender.limitFundAll)}</span><span className="deadline-cell"><b>{dateLabel(record.tender.submissionDeadline)}</b>{remainingDays != null && <small>{remainingDays <= 0 ? "I kaluar" : `${remainingDays} ditë`}</small>}</span><span className="match-cell"><span className={decisionClass(record.match.decision)}>{record.match.score}</span><small>{eligibility} · {record.match.confidenceScore ?? record.match.evidenceCoverage}% siguri</small></span><div className="row-actions"><button className={record.relevanceFeedback === true ? "active" : ""} aria-pressed={record.relevanceFeedback === true} onClick={() => onFeedback(true)} title="Shënoje relevant">✓</button><button className={record.relevanceFeedback === false ? "active negative" : ""} aria-pressed={record.relevanceFeedback === false} onClick={() => onFeedback(false)} title="Shënoje jo relevant">×</button></div></div>;
}

function BulletinRow({ bulletin, onRetry, onDelete, deleting }: { bulletin: Bulletin; onRetry: (id: string) => void; onDelete: (bulletin: Bulletin) => void; deleting: boolean }) {
  const canRetry = bulletin.status === "failed" || bulletin.status === "needs_review";
  const canDelete = !["queued", "processing"].includes(bulletin.status);
  const statusLabels: Record<Bulletin["status"], string> = { queued: "Në radhë", processing: "Duke u analizuar", completed: "Përfunduar", needs_review: "Kërkon rishikim", failed: "Dështoi" };
  return <div className="bulletin-row"><div className="pdf-icon">PDF</div><div className="bulletin-main"><b>Buletini Nr. {bulletin.bulletinNumber}{bulletin.bulletinType === "special" ? " · Posaçëm" : ""}</b><span>{dateLabel(bulletin.publicationDate)} · {bulletin.noticeCount} njoftime · {bulletin.pageCount || "—"} faqe</span>{bulletin.error && <small>{bulletin.error}</small>}</div><span className={`status-dot status-${bulletin.status}`} title={statusLabels[bulletin.status]} /><span className="bulletin-status">{statusLabels[bulletin.status]}</span>{canRetry && <button className="row-retry" type="button" onClick={() => onRetry(bulletin.id)}>Riprovo</button>}<button className="row-delete" type="button" disabled={!canDelete || deleting} onClick={() => onDelete(bulletin)} aria-label={`Hiq Buletinin Nr. ${bulletin.bulletinNumber}`} title={canDelete ? "Hiq PDF-në dhe njoftimet e këtij buletini" : "Prisni që analizimi të përfundojë"}>{deleting ? "Duke hequr…" : "Hiq"}</button></div>;
}

function EmptyState() { return <div className="empty-state"><span>◇</span><b>Nuk ka rezultate në këtë pamje.</b><p>Ngarkoni një buletin ose ndryshoni filtrat e kërkimit.</p></div>; }

function AuthorityFilter({ facets, selected, onChange }: { facets: AuthorityFacet[]; selected: string[]; onChange: (values: string[]) => void }) {
  const [open, setOpen] = useState(false); const [query, setQuery] = useState(""); const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null); const searchRef = useRef<HTMLInputElement>(null);
  useEffect(() => { try { const stored = window.localStorage.getItem("tenderat-authority-filter"); const parsed = stored ? JSON.parse(stored) as unknown : []; if (Array.isArray(parsed)) onChange([...new Set(parsed.filter((item): item is string => typeof item === "string" && item.length <= 180))]); } catch { /* local preference is optional */ } finally { setPreferencesLoaded(true); } }, [onChange]);
  useEffect(() => { if (!preferencesLoaded) return; try { window.localStorage.setItem("tenderat-authority-filter", JSON.stringify(selected)); } catch { /* local preference is optional */ } }, [preferencesLoaded, selected]);
  useEffect(() => {
    if (!open) return;
    searchRef.current?.focus();
    const close = (event: KeyboardEvent | MouseEvent) => {
      if (event instanceof KeyboardEvent && event.key === "Escape") setOpen(false);
      if (event instanceof MouseEvent && popoverRef.current && !popoverRef.current.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("keydown", close);
    document.addEventListener("mousedown", close);
    return () => { document.removeEventListener("keydown", close); document.removeEventListener("mousedown", close); };
  }, [open]);
  const visible = facets.filter((facet) => facet.count > 0 || selected.includes(facet.id)).filter((facet) => !query || [facet.name, facet.abbreviation, ...facet.aliases].filter(Boolean).join(" ").toLocaleLowerCase("sq-AL").includes(query.toLocaleLowerCase("sq-AL")));
  const toggle = (id: string) => onChange(selected.includes(id) ? selected.filter((value) => value !== id) : [...selected, id]);
  return <div className="authority-filter" ref={popoverRef}><button type="button" className={`authority-filter-trigger ${selected.length ? "selected" : ""}`} aria-expanded={open} aria-haspopup="dialog" onClick={() => setOpen(!open)}>⌖ {selected.length ? `${selected.length} autoritete` : "Filtro autoritetin"}<span>⌄</span></button>{open && <div className="authority-popover" role="dialog" aria-label="Filtro autoritetet kontraktore"><div className="authority-popover-head"><b>Autoritetet kontraktore</b><button type="button" onClick={() => { onChange([]); setOpen(false); }}>Pastro</button></div><input ref={searchRef} aria-label="Kërko autoritet" placeholder="Kërko OST, UKT, Bashkia…" value={query} onChange={(event) => setQuery(event.target.value)} />{visible.length ? <div className="authority-options">{visible.map((facet) => <label key={facet.id}><input type="checkbox" checked={selected.includes(facet.id)} onChange={() => toggle(facet.id)} /><span><b>{facet.abbreviation ?? facet.name}</b><small>{facet.abbreviation ? facet.name : facet.aliases[0] ?? "Emërtim i regjistruar"}</small></span><em>{facet.count}</em></label>)}</div> : <p className="authority-empty">Nuk u gjet autoritet me këtë emër.</p>}<button type="button" className="authority-apply" onClick={() => setOpen(false)}>Apliko filtrin</button></div>}</div>;
}
