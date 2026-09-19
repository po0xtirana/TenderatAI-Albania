"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type {
  TenderDeliveryPlan,
  TenderDecisionBrief,
  TenderDecisionStatus,
  TenderEligibility,
  TenderRecord,
  TenderAction,
  TenderWorkAllocation,
  TenderWorkflowStatus,
} from "@/lib/types";
import { decisionLabel } from "@/lib/matcher";

function money(value: number | null) {
  return value == null
    ? "Nuk është publikuar"
    : new Intl.NumberFormat("sq-AL", {
        style: "currency",
        currency: "ALL",
        maximumFractionDigits: 0,
      }).format(value);
}
function dateLabel(value: string | null) {
  if (!value) return "Nuk është publikuar";
  const date = new Date(value);
  return Number.isNaN(date.getTime())
    ? "Datë e pavlefshme"
    : new Intl.DateTimeFormat("sq-AL", { dateStyle: "long" }).format(date);
}
const componentLabels: Record<string, string> = {
  scope: "Fusha dhe CPV",
  compliance: "Licenca dhe pajtueshmëria",
  experience: "Eksperienca",
  people: "Njerëzit dhe ekipet",
  equipment: "Pajisjet",
  financial: "Kapaciteti financiar",
  geography: "Gjeografia",
  schedule: "Ngarkesa dhe afati",
  preference: "Preferencat",
};
const componentMaximums: Record<string, number> = {
  scope: 20,
  compliance: 15,
  experience: 15,
  people: 15,
  equipment: 10,
  financial: 10,
  geography: 5,
  schedule: 5,
  preference: 5,
};
const workflowLabels: Record<TenderWorkflowStatus, string> = {
  new: "I ri",
  watching: "Në ndjekje",
  reviewing: "Në shqyrtim",
  bid: "Për ofertë",
  no_bid: "Mos e ndiq",
};
const eligibilityLabels: Record<TenderEligibility, string> = {
  eligible: "Kualifikimi i mbuluar",
  eligibility_pending: "Kualifikimi për verifikim",
  not_eligible: "Nuk plotëson kriteret",
};
const suitabilityLabels: Record<TenderDecisionBrief["suitability"], string> = {
  strong_fit: "Përshtatje e fortë", good_fit: "Përshtatje e mirë", review_required: "Kërkon shqyrtim", weak_fit: "Përshtatje e dobët", unsuitable: "E papërshtatshme",
};
const evidenceLabels: Record<TenderDecisionBrief["evidenceCompleteness"], string> = {
  complete: "Prova të plota", substantial: "Prova të mjaftueshme", partial: "Prova të pjesshme", limited: "Prova të kufizuara",
};
const recommendationLabels: Record<TenderDecisionBrief["recommendation"], string> = {
  proceed: "Vazhdo me ofertën", conditional: "Vazhdo pas verifikimeve", partner_required: "Partner ose qira e nevojshme", high_risk: "Rrezik i lartë", do_not_proceed: "Mos vazhdo",
};

export default function TenderDetailPage() {
  const params = useParams<{ id: string }>();
  const [record, setRecord] = useState<TenderRecord | null>(null);
  const [loading, setLoading] = useState(true);
  const [workflowStatus, setWorkflowStatus] =
    useState<TenderWorkflowStatus>("new");
  const [savingStatus, setSavingStatus] = useState(false);
  const [deliveryPlan, setDeliveryPlan] = useState<TenderDeliveryPlan | null>(
    null,
  );
  const [decisionBrief, setDecisionBrief] = useState<TenderDecisionBrief | null>(null);
  const [enriching, setEnriching] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    if (!params.id) return;
    const controller = new AbortController();
    setLoading(true);
    setError("");
    void (async () => {
      try {
        const response = await fetch(
          `/api/tenders/${encodeURIComponent(params.id)}`,
          { signal: controller.signal, cache: "no-store" },
        );
        if (response.status === 404) {
          setRecord(null);
          return;
        }
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        const body = (await response.json()) as TenderRecord;
        setRecord(body);
        setDeliveryPlan(body.deliveryPlan ?? null);
        setDecisionBrief(body.decisionBrief ?? null);
        setWorkflowStatus(body.workflowStatus ?? "new");
      } catch (cause) {
        if (cause instanceof DOMException && cause.name === "AbortError")
          return;
        console.error("[tender-detail] load failed", cause);
        setError(
          "Analiza nuk mund të ngarkohej. Kontrolloni serverin dhe provoni përsëri.",
        );
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    })();
    return () => controller.abort();
  }, [params.id]);
  const saveWorkflow = async (status: TenderWorkflowStatus) => {
    if (!record) return;
    setSavingStatus(true);
    setError("");
    try {
      const response = await fetch("/api/workflow", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ tenderId: record.tender.id, status }),
      });
      const body = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      if (!response.ok) throw new Error(body?.error ?? "Statusi nuk u ruajt.");
      setWorkflowStatus(status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Statusi nuk u ruajt.");
    } finally {
      setSavingStatus(false);
    }
  };
  const enrichWithAi = async () => {
    if (!record) return;
    setEnriching(true);
    setError("");
    try {
      const response = await fetch(
        `/api/tenders/${encodeURIComponent(record.tender.id)}/insights`,
        { method: "POST" },
      );
      const body = (await response.json().catch(() => null)) as
        | (TenderRecord & { error?: string })
        | null;
      if (!response.ok || !body?.tender)
        throw new Error(body?.error ?? "Analiza AI dështoi.");
      setRecord(body);
      setDeliveryPlan(body.deliveryPlan ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Analiza AI dështoi.");
    } finally {
      setEnriching(false);
    }
  };
  if (loading)
    return (
      <div className="detail-page">
        <div className="detail-loading">Duke hapur analizën…</div>
      </div>
    );
  if (error && !record)
    return (
      <div className="detail-page">
        <Link href="/" className="back-link">
          ← Përmbledhja
        </Link>
        <div className="not-found" role="alert">
          <h1>Veprimi nuk përfundoi</h1>
          <p>{error}</p>
          <button
            type="button"
            className="secondary-button"
            onClick={() => window.location.reload()}
          >
            Riprovo
          </button>
        </div>
      </div>
    );
  if (!record)
    return (
      <div className="detail-page">
        <Link href="/" className="back-link">
          ← Përmbledhja
        </Link>
        <div className="not-found">
          <h1>Tenderi nuk u gjet</h1>
          <p>Ky njoftim mund të jetë hequr ose procesimi nuk ka përfunduar.</p>
        </div>
      </div>
    );
  const { tender, match, insights, bulletin } = record;
  const scopeCriterion = match.criterionResults?.find(
    (criterion) => criterion.key === "scope",
  );
  const scoreUnavailable = scopeCriterion?.applicability === "unknown";
  return (
    <div className="detail-page">
      <header className="detail-top">
        <Link href="/" className="back-link">
          ← Përmbledhja
        </Link>
        <span className="detail-brand">
          <span className="brand-mark">T</span>
          <b>Tenderat AI</b>
        </span>
        <span className="detail-context">HAPËSIRË PRIVATE · APP</span>
      </header>
      <main className="detail-main">
        {error && (
          <div className="detail-action-error" role="alert">
            <span>{error}</span>
            <button type="button" onClick={() => setError("")} aria-label="Mbyll njoftimin">
              Mbyll
            </button>
          </div>
        )}
        <div className="detail-crumb">
          BULETINI NR. {bulletin.bulletinNumber} <span>/</span> ANALIZË E
          TENDERIT
        </div>
        <section className="detail-hero">
          <div className="detail-title">
            <div className="tag-row">
              <span className={`pill pill-${match.decision}`}>
                {decisionLabel(match.decision)}
              </span>
              <span
                className={`eligibility-tag eligibility-${match.eligibility}`}
              >
                {eligibilityLabels[match.eligibility]}
              </span>
              <span className="tag">{tender.referenceNumber}</span>
              <span className="tag">
                Profili v{match.capabilityVersion || "—"}
              </span>
              <span className="tag">
                {match.scoringModelVersion?.includes("v2") ? "Scoring V2" : "Scoring V1"}
              </span>
              <span className="tag">
                Faqet {tender.sourcePages.start}–{tender.sourcePages.end}
              </span>
            </div>
            <h1>{tender.contractObject}</h1>
            <p>
              {tender.contractingAuthority} ·{" "}
              {tender.address || "Lokacioni nuk është publikuar"}
            </p>
          </div>
          <div className="big-score">
            <small>{scoreUnavailable ? "STATUSI" : "PËRPUTHJA"}</small>
            {scoreUnavailable ? (
              <strong className="score-pending">Pa vlerësim</strong>
            ) : (
              <>
                <strong>{match.score}</strong>
                <span>/100</span>
              </>
            )}
            <small className="score-confidence">
              SIGURIA {match.confidenceScore ?? match.evidenceCoverage}%
            </small>
          </div>
        </section>
        <div className="tender-workspace">
          <div className="tender-workspace-main">
            {decisionBrief && (
              <DecisionBriefSection
                brief={decisionBrief}
                tenderId={tender.id}
                deliveryPlan={deliveryPlan}
                onChange={setDecisionBrief}
              />
            )}
            {deliveryPlan && (
              <DeliveryPlanSection
                plan={deliveryPlan}
                onPlanChange={setDeliveryPlan}
                tenderId={tender.id}
              />
            )}
            <section className="detail-card">
              <div className="detail-card-heading">
                <div>
                  <p className="eyebrow">PSE U RENDIT</p>
                  <h2>Arsyeja e përputhjes</h2>
                </div>
                <span className="verified">✓ E GJURMUESHME</span>
              </div>
              <div className="components">
                {match.criterionResults?.length ? match.criterionResults.map((criterion) => (
                  <div className={`component component-${criterion.applicability}`} key={criterion.key}>
                    <div>
                      <span>{criterion.label}</span>
                      <b>{criterion.applicability === "not_applicable" ? "Nuk zbatohet" : criterion.score == null ? "E panjohur" : `${criterion.score}/100`}</b>
                    </div>
                    <div className="component-bar">
                      <i style={{ width: `${criterion.score ?? 0}%` }} />
                    </div>
                    <p className="component-meta">Peshë {criterion.weight}% · siguri {Math.round(criterion.evidenceQuality * 100)}% · {criterion.explanation}</p>
                  </div>
                )) : Object.entries(match.components).map(([key, value]) => (
                  <div className="component" key={key}>
                    <div>
                      <span>{componentLabels[key] ?? key}</span>
                      <b>{value} pikë</b>
                    </div>
                    <div className="component-bar">
                      <i
                        style={{
                          width: `${Math.min(100, (value / (componentMaximums[key] ?? 1)) * 100)}%`,
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div className="reason-list">
                {match.reasons.map((reason) => (
                  <div key={reason}>
                    <span>✓</span>
                    <p>{reason}</p>
                  </div>
                ))}
              </div>
              {match.confirmedCapabilities?.length > 0 && (
                <div className="capability-proof capability-proof-good">
                  <b>Kapacitete të konfirmuara</b>
                  {match.confirmedCapabilities.map((item) => (
                    <p key={item}>✓ {item}</p>
                  ))}
                </div>
              )}
              {match.capabilityGaps?.length > 0 && (
                <div className="capability-proof capability-proof-gap">
                  <b>Boshllëqe ose verifikime</b>
                  {match.capabilityGaps.map((item) => (
                    <p key={item}>! {item}</p>
                  ))}
                </div>
              )}
              {match.blockers.length > 0 && (
                <div className="blocker-box">
                  <b>Vëmendje para se të ndiqni këtë tender</b>
                  {match.blockers.map((blocker) => (
                    <p key={blocker}>! {blocker}</p>
                  ))}
                </div>
              )}
            </section>
            <section className="detail-card">
              <div className="detail-card-heading">
                <div>
                  <p className="eyebrow">INSIGHTE TË STRUKTURUARA</p>
                  <h2>Çfarë duhet të dini</h2>
                </div>
                <div className="insight-actions">
                  <span className="ai-label">✦ AI + FAKTE</span>
                  <button
                    type="button"
                    className="secondary-button"
                    disabled={enriching}
                    onClick={() => void enrichWithAi()}
                  >
                    {enriching ? "Po analizon…" : "Analizo me AI"}
                  </button>
                </div>
              </div>
              <div className="insight-list">
                {insights.map((insight) => (
                  <article
                    className={`detail-insight insight-${insight.type}`}
                    key={insight.id}
                  >
                    <div className="insight-type">
                      {insight.type === "summary"
                        ? "PËRMBLEDHJE"
                        : insight.type === "work"
                          ? "FUSHA E PUNËS"
                          : insight.type === "risk"
                            ? "RREZIK / VËMENDJE"
                            : insight.type === "next_action"
                              ? "HAPI I RADHËS"
                              : "KËRKESË"}
                      <span>
                        {Math.round(insight.confidence * 100)}% siguri
                      </span>
                    </div>
                    <p>{insight.textAl}</p>
                    <div className="evidence">
                      <span>
                        PROVË · FAQE{" "}
                        {insight.evidence[0]?.page ?? tender.sourcePages.start}
                      </span>
                      <q>
                        “{insight.evidence[0]?.text ?? "Teksti i njoftimit"}”
                      </q>
                    </div>
                  </article>
                ))}
              </div>
            </section>
          </div>
          <aside className="detail-side detail-side-sticky">
            <section className="detail-card tender-status-card">
              <div className="side-card-heading">
                <div>
                  <p className="eyebrow">STATUSI I PUNËS</p>
                  <h2>{workflowLabels[workflowStatus]}</h2>
                </div>
                <span className="status-live-dot" aria-hidden="true" />
              </div>
              <div className="workflow-actions workflow-actions-vertical" aria-label="Gjendja e tenderit">
                {(
                  ["watching", "reviewing", "bid", "no_bid"] as TenderWorkflowStatus[]
                ).map((status) => (
                  <button
                    key={status}
                    type="button"
                    className={workflowStatus === status ? "active" : ""}
                    disabled={savingStatus}
                    onClick={() => void saveWorkflow(status)}
                  >
                    <span>{workflowLabels[status]}</span>
                    <b>{workflowStatus === status ? "Aktiv" : "Zgjidh"}</b>
                  </button>
                ))}
              </div>
            </section>
            <section className="detail-card analysis-health-card">
              <div className="side-card-heading">
                <div>
                  <p className="eyebrow">CILËSIA E ANALIZËS</p>
                  <h2>Sa mund t&apos;i besojmë?</h2>
                </div>
              </div>
              <div className="analysis-health-row">
                <span>Siguria</span>
                <b>{match.confidenceScore ?? match.evidenceCoverage}%</b>
              </div>
              <div className="analysis-meter" aria-hidden="true">
                <i style={{ width: `${match.confidenceScore ?? match.evidenceCoverage}%` }} />
              </div>
              <div className="analysis-health-row">
                <span>Intervali i përshtatjes</span>
                <b>{match.fitRangeLow ?? match.score}–{match.fitRangeHigh ?? match.score}</b>
              </div>
              <p>{match.eligibilityReason}</p>
            </section>
            <section className="detail-card facts-card">
              <div className="detail-card-heading">
                <div>
                  <p className="eyebrow">TË DHËNAT E PROJEKTIT</p>
                  <h2>Fakte kryesore</h2>
                </div>
              </div>
              <Fact label="Autoriteti" value={tender.contractingAuthority} />
              <Fact label="Procedura" value={tender.procedureType} />
              <Fact
                label="Kodi CPV"
                value={tender.cpvCodes.join(", ") || "Nuk u gjet"}
              />
              <Fact
                label="Fondi limit"
                value={money(tender.limitFundAll)}
                strong
              />
              <Fact
                label="Afati i ofertës"
                value={dateLabel(tender.submissionDeadline)}
                strong
              />
              <Fact
                label="Kohëzgjatja"
                value={tender.durationText || "Nuk u gjet"}
              />
              <Fact
                label="TVSH"
                value={tender.vatStatus || "Duhet verifikuar"}
              />
            </section>
            <section className="detail-card source-card">
              <p className="eyebrow">BURIMI</p>
              <h2>Buletini zyrtar</h2>
              <p>Ky analizim bazohet në PDF-në e ngarkuar nga kompania.</p>
              <div className="source-file">
                <span className="pdf-icon">PDF</span>
                <div>
                  <b>{bulletin.fileName}</b>
                  <small>
                    {bulletin.pageCount} faqe · {bulletin.publicationDate}
                  </small>
                </div>
              </div>
              <button
                className="secondary-button"
                type="button"
                onClick={() =>
                  window.open(
                    `/api/bulletins/${encodeURIComponent(bulletin.id)}/file#page=${tender.sourcePages.start}`,
                    "_blank",
                    "noopener,noreferrer",
                  )
                }
              >
                Hap PDF-në në faqen {tender.sourcePages.start} ↗
              </button>
              <span className="source-note">
                Gjithmonë verifikoni dokumentin zyrtar para çdo vendimi.
              </span>
            </section>
          </aside>
        </div>
      </main>
    </div>
  );
}

function DecisionBriefSection({ brief, tenderId, deliveryPlan, onChange }: { brief: TenderDecisionBrief; tenderId: string; deliveryPlan: TenderDeliveryPlan | null; onChange: (brief: TenderDecisionBrief) => void }) {
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  async function changeAction(action: TenderAction, patch: Partial<Pick<TenderAction, "status" | "completionNote" | "dueDate">>) {
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/tenders/${encodeURIComponent(tenderId)}/actions/${encodeURIComponent(action.id)}`, { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify(patch) });
      const body = await response.json().catch(() => null) as TenderDecisionBrief & { error?: string } | null;
      if (!response.ok || !body || "error" in body) throw new Error(body?.error ?? "Veprimi nuk u ruajt.");
      onChange(body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Veprimi nuk u ruajt."); }
    finally { setSaving(false); }
  }
  async function saveDecision(status: TenderDecisionStatus, reason: string) {
    setSaving(true); setError("");
    try {
      const response = await fetch(`/api/tenders/${encodeURIComponent(tenderId)}/decision`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ status, reason }) });
      const body = await response.json().catch(() => null) as TenderDecisionBrief & { error?: string } | null;
      if (!response.ok || !body || "error" in body) throw new Error(body?.error ?? "Vendimi nuk u ruajt.");
      onChange(body);
    } catch (cause) { setError(cause instanceof Error ? cause.message : "Vendimi nuk u ruajt."); }
    finally { setSaving(false); }
  }
  const openIssues = brief.issues.filter((item) => item.status === "open");
  return <section className="decision-brief" aria-label="Përmbledhja e vendimit">
    <div className="decision-brief-head">
      <div><p className="eyebrow">PËRMBLEDHJE PËR VENDIM</p><h2>{recommendationLabels[brief.recommendation]}</h2><p>{brief.recommendationReason}</p></div>
      <span className={`recommendation recommendation-${brief.recommendation}`}>{recommendationLabels[brief.recommendation]}</span>
    </div>
    <div className="decision-status-grid">
      <StatusCard title="Përshtatshmëria" value={suitabilityLabels[brief.suitability]} detail="Sa mirë i përshtatet puna kapaciteteve dhe preferencave të kompanisë." tone={brief.suitability} />
      <StatusCard title="Kualifikimi" value={eligibilityLabels[brief.eligibility]} detail="Nëse kërkesat e identifikuara janë të mbuluara." tone={brief.eligibility} />
      <StatusCard title="Provë dokumentare" value={`${brief.evidenceCoverage}% · ${evidenceLabels[brief.evidenceCompleteness]}`} detail="Sa nga analiza mbështetet nga dokumenti i ngarkuar." tone={brief.evidenceCompleteness} />
    </div>
    <div className="decision-brief-grid">
      <div className="brief-scope">
        <p className="eyebrow">1 · ÇFARË PUNE PËRFSHIHET</p>
        <h3>Fusha e projektit</h3>
        {deliveryPlan?.workPackages.length ? <div className="brief-phase-list">{deliveryPlan.workPackages.slice(0, 5).map((item) => <div key={item.id}><span>{item.phase}</span><b>{item.task}</b><small>Faqe {item.sourcePage} · {Math.round(item.confidence * 100)}% siguri</small></div>)}</div> : <p className="brief-empty">Fazat e punës do të shfaqen pasi tenderi të analizohet.</p>}
      </div>
      <div className="brief-why">
        <p className="eyebrow">2 · PSE PËRSHTATET</p><h3>Kapacitetet që përputhen</h3>
        {brief.strengths.length ? <ul>{brief.strengths.map((item) => <li key={item}>✓ {item}</li>)}</ul> : <p className="brief-empty">Nuk ka ende prova të mjaftueshme për një përputhje të fortë.</p>}
      </div>
    </div>
    <div className="delivery-decision-summary">
      <div><p className="eyebrow">3 · PUNË E BRENDSHME</p><b>{deliveryPlan?.summary.internalConfirmedCount ?? 0}/{deliveryPlan?.summary.componentCount ?? 0}</b><span>komponentë me specializim dhe personel të konfirmuar.</span></div>
      <div><p className="eyebrow">4 · PARTNERË DHE QIRA</p><b>{deliveryPlan?.summary.partnerConfirmedCount ?? 0}/{deliveryPlan?.summary.componentCount ?? 0}</b><span>komponentë të mbuluar nga partnerë · {deliveryPlan?.summary.rentalCount ?? 0} alternativa qiraje.</span></div>
      <div className={(deliveryPlan?.summary.uncoveredCount ?? 0) > 0 ? "uncovered" : ""}><p className="eyebrow">PËR VERIFIKIM</p><b>{(deliveryPlan?.summary.unverifiedCount ?? 0) + (deliveryPlan?.summary.uncoveredCount ?? 0)}</b><span>komponentë me kapacitet relevant ose zgjidhje ende të pakonfirmuar.</span></div>
    </div>
    <div className="brief-workflow-grid">
      <div className="brief-issues"><div className="brief-section-head"><div><p className="eyebrow">5 · ÇFARË MUND TË NDALOJË PJESËMARRJEN</p><h3>Bllokues, rreziqe dhe të panjohura</h3></div><span>{openIssues.length} të hapura</span></div>{openIssues.length ? <div className="brief-issue-list">{openIssues.slice(0, 6).map((item) => <article className={`brief-issue issue-${item.type}`} key={item.id}><span>{item.type === "blocker" ? "!" : item.type === "risk" ? "△" : "?"}</span><div><b>{item.title}</b><p>{item.description}</p><small>{item.resolution}</small></div></article>)}</div> : <p className="brief-success">✓ Nuk ka bllokues ose rreziqe të hapura në këtë analizë.</p>}</div>
      <div className="brief-actions"><div className="brief-section-head"><div><p className="eyebrow">6 · HAPI I RADHËS</p><h3>Veprime prioritare</h3></div><span>{brief.actions.filter((item) => item.status !== "completed").length} për t&apos;u bërë</span></div>{brief.actions.length ? <div className="brief-action-list">{brief.actions.slice(0, 5).map((action) => <article className={`brief-action action-${action.priority}`} key={action.id}><div><b>{action.title}</b><p>{action.description}</p></div><select aria-label={`Statusi për ${action.title}`} value={action.status} disabled={saving} onChange={(event) => void changeAction(action, { status: event.target.value as TenderAction["status"] })}><option value="todo">Për t&apos;u bërë</option><option value="in_progress">Në proces</option><option value="waiting">Në pritje</option><option value="completed">Përfunduar</option><option value="not_applicable">Nuk zbatohet</option></select></article>)}</div> : <p className="brief-success">✓ Nuk ka veprime të detyrueshme nga analiza aktuale.</p>}</div>
    </div>
    <DecisionControls brief={brief} saving={saving} onSave={saveDecision} />
    {error && <p className="brief-error" role="alert">{error}</p>}
  </section>;
}

function StatusCard({ title, value, detail, tone }: { title: string; value: string; detail: string; tone: string }) {
  return <article className={`decision-status status-${tone}`}><span>{title}</span><b>{value}</b><p>{detail}</p></article>;
}

function DecisionControls({ brief, saving, onSave }: { brief: TenderDecisionBrief; saving: boolean; onSave: (status: TenderDecisionStatus, reason: string) => Promise<void> }) {
  const [reason, setReason] = useState(brief.decision?.reason ?? "");
  const decisionLabel = brief.decision ? `Vendimi i ruajtur: ${brief.decision.status === "continue" ? "Vazhdo" : brief.decision.status === "conditional" ? "Vazhdo me kushte" : brief.decision.status === "watch" ? "Në ndjekje" : brief.decision.status === "submitted" ? "Ofertë e dorëzuar" : "Mos vazhdo"}` : "Regjistro vendimin e kompanisë";
  return <div className="decision-controls"><div><p className="eyebrow">VENDIMI I KOMPANISË</p><b>{decisionLabel}</b><textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Shënim i shkurtër për vendimin, kushtet ose rreziqet e pranuara…" aria-label="Arsyeja e vendimit" /></div><div className="decision-buttons"><button type="button" className="secondary-button" disabled={saving} onClick={() => void onSave("watch", reason)}>Në ndjekje</button><button type="button" className="secondary-button" disabled={saving} onClick={() => void onSave("decline", reason)}>Mos vazhdo</button><button type="button" className="secondary-button" disabled={saving} onClick={() => void onSave("conditional", reason)}>Vazhdo me kushte</button><button type="button" className="primary-button" disabled={saving} onClick={() => void onSave("continue", reason)}>{saving ? "Duke ruajtur…" : "Vazhdo me ofertën"}</button></div></div>;
}

const sourceLabels: Record<TenderWorkAllocation["source"], string> = {
  internal: "Kompania",
  partner: "Nënkontraktor",
  rental: "Makineri me qira",
  hybrid: "Hibride",
  uncovered: "E pambuluar",
};
const verificationLabels: Record<
  TenderDeliveryPlan["workPackages"][number]["verificationStatus"],
  string
> = {
  provisional: "Paraprake",
  extracted: "Nga dokumentet",
  confirmed: "Konfirmuar",
};
const scopeMatchLabels: Record<NonNullable<TenderDeliveryPlan["workPackages"][number]["scopeMatch"]>, string> = {
  exact: "Përputhje e drejtpërdrejtë",
  equivalent: "Përputhje e ngjashme",
  broad: "Fushë e përgjithshme",
  partner: "Mbulim nga partneri",
  unmatched: "Pa specializim të deklaruar",
  unknown: "Kërkon interpretim",
};
const deliveryStatusLabels: Record<NonNullable<TenderDeliveryPlan["workPackages"][number]["deliveryStatus"]>, string> = {
  confirmed_internal: "E konfirmuar brenda kompanisë",
  confirmed_partner: "E konfirmuar nga partneri",
  relevant_unverified: "Kapacitet relevant · verifiko personelin",
  uncovered: "Pa mbulim të konfirmuar",
  unknown: "Kërkon verifikim",
};

function phaseOverview(packages: TenderDeliveryPlan["workPackages"]): string {
  const tasks = [...new Set(packages.map((item) => item.task).filter(Boolean))];
  const listedTasks = tasks.length <= 3 ? tasks.join(", ") : `${tasks.slice(0, 3).join(", ")} dhe ${tasks.length - 3} komponentë të tjerë`;
  const pages = [...new Set(packages.map((item) => item.sourcePage).filter((page) => Number.isFinite(page)))].sort((a, b) => a - b);
  const inferredOnly = packages.every((item) => item.source === "inference");
  const phase = packages[0]?.phase ?? "";
  const subject = packages[0]?.evidenceText?.replace(/\s+/g, " ").trim().slice(0, 240) || "objektin e tenderit";
  const detail: Record<string, string> = {
    "Projektim dhe koordinim": "Kjo fazë mbulon përgatitjen e projektit të zbatimit dhe dokumentacionit teknik që nevojitet para punimeve në terren.",
    "Punime civile dhe strukturë": "Kjo fazë mbulon realizimin fizik të objektit në kantier: punime ndërtimore dhe strukturore që lidhen me zbatimin e projektit.",
    "Pajisje dhe logjistikë": "Kjo fazë mbulon pajisjet ose makineritë e nevojshme për realizimin e punës dhe organizimin e tyre në kantier.",
    "Instalime dhe rrjete": "Kjo fazë mbulon instalimet teknike të identifikuara, si kabllime, ndriçim ose sisteme elektrike, sipas kodeve CPV të tenderit.",
    "Sisteme të specializuara": "Kjo fazë mbulon sistemet e specializuara të identifikuara, si siguria, pajisjet e portës ose elemente të sigurisë rrugore.",
    "Çati dhe hidroizolim": "Kjo fazë mbulon konstruksionin, mbulesën dhe mbrojtjen nga uji të çatisë ose tarracës.",
    "Fasada dhe përfundime": "Kjo fazë mbulon shtresat dhe përfundimet e jashtme ose të brendshme, përfshirë fasadën, veshjet, suvën apo lyerjen kur identifikohen.",
    "Përgatitje dhe prishje": "Kjo fazë mbulon prishjen, çmontimin dhe përgatitjen e zonës së punës para zbatimit.",
  };
  const source = inferredOnly
    ? "Ky interpretim është paraprak nga objekti dhe CPV-të; dokumentet e plota duhet të konfirmojnë zërat, sasitë dhe standardet."
    : `Në njoftimin e disponueshëm nuk jepen zërat, sasitë ose specifikimet e plota për këtë fazë; ato duhen konfirmuar në dokumentet teknike. Burimi: ${pages.length === 1 ? `faqja ${pages[0]}` : `faqet ${pages.join(", ")}`}.`;
  return `${detail[phase] ?? `Kjo fazë lidhet me ${listedTasks}.`} Lidhet me objektin “${subject}”. ${source}`;
}

function DeliveryPlanSection({
  plan,
  tenderId,
  onPlanChange,
}: {
  plan: TenderDeliveryPlan;
  tenderId: string;
  onPlanChange: (plan: TenderDeliveryPlan) => void;
}) {
  const [error, setError] = useState("");
  const grouped = plan.workPackages.reduce<
    Record<string, TenderDeliveryPlan["workPackages"]>
  >((acc, item) => {
    (acc[item.phase] ??= []).push(item);
    return acc;
  }, {});
  async function changeAllocation(
    item: TenderWorkAllocation,
    patch: Partial<TenderWorkAllocation>,
  ) {
    setError("");
    try {
      const response = await fetch(
        `/api/tenders/${encodeURIComponent(tenderId)}/delivery-plan`,
        {
          method: "PATCH",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ allocationId: item.id, patch }),
        },
      );
      const body = (await response.json().catch(() => null)) as
        | (TenderDeliveryPlan & { error?: string })
        | null;
      if (!response.ok || !body)
        throw new Error(body?.error ?? "Ndryshimi i planit dështoi.");
      onPlanChange(body);
    } catch (cause) {
      setError(
        cause instanceof Error ? cause.message : "Ndryshimi i planit dështoi.",
      );
    }
  }
  return (
    <section className="detail-card delivery-plan-card">
      <div className="detail-card-heading">
        <div>
          <p className="eyebrow">PLAN I REALIZIMIT</p>
          <h2>Fazat e punës dhe përgjegjësit</h2>
          <p className="detail-card-copy">
            Çdo komponent kontrollohet veçmas: specializimi, personeli i
            disponueshëm, partnerët dhe provat nga buletini. Përqindjet nuk
            përdoren kur dokumenti nuk jep sasi ose afate të plota.
          </p>
        </div>
        <span className="verified">
          v{plan.capabilityVersion} · {plan.summary.provisionalCount} paraprake
        </span>
      </div>
      <div className="delivery-summary">
        <span>
          <b>{plan.summary.internalConfirmedCount ?? 0}/{plan.summary.componentCount ?? 0}</b> kompani
        </span>
        <span>
          <b>{plan.summary.partnerConfirmedCount ?? 0}/{plan.summary.componentCount ?? 0}</b> partnerë
        </span>
        <span>
          <b>{plan.summary.rentalCount}</b> qira
        </span>
        <span className={plan.summary.uncoveredCount ? "warning" : ""}>
          <b>{(plan.summary.unverifiedCount ?? 0) + plan.summary.uncoveredCount}</b> për verifikim
        </span>
      </div>
      {error && (
        <p className="delivery-error" role="alert">
          {error}
        </p>
      )}
      <div className="delivery-phases">
        {Object.entries(grouped).map(([phase, packages]) => (
          <div className="delivery-phase" key={phase}>
            <h3>{phase}</h3>
            <p className="delivery-phase-overview">{phaseOverview(packages)}</p>
            {packages.map((workPackage) => (
              <article className="delivery-package" key={workPackage.id}>
                <div className="delivery-package-head">
                  <div>
                    <b>{workPackage.task}</b>
                    <small>
                      {workPackage.source === "inference"
                        ? "Sugjerim nga objekti/CPV"
                        : "Provë në buletin"}{" "}
                      · faqe {workPackage.sourcePage} ·{" "}
                      {Math.round(workPackage.confidence * 100)}% siguri
                    </small>
                  </div>
                  <span
                    className={`delivery-verification delivery-${workPackage.verificationStatus}`}
                  >
                    {verificationLabels[workPackage.verificationStatus]}
                  </span>
                </div>
                <div className="delivery-requirements">
                  {workPackage.requirements.slice(0, 3).map((requirement) => (
                    <span key={requirement}>{requirement}</span>
                  ))}
                  {workPackage.scopeMatch && <span>{scopeMatchLabels[workPackage.scopeMatch]}</span>}
                  {workPackage.deliveryStatus && <span>{deliveryStatusLabels[workPackage.deliveryStatus]}</span>}
                </div>
                {workPackage.resourceEvidence?.length ? <p className="delivery-evidence">Prova e kapacitetit: {workPackage.resourceEvidence.join(" · ")}</p> : null}
                <div className="delivery-allocations">
                  {plan.allocations
                    .filter(
                      (allocation) =>
                        allocation.workPackageId === workPackage.id,
                    )
                    .map((allocation) => (
                      <div className="delivery-allocation" key={allocation.id}>
                        <div className="allocation-main">
                          <span
                            className={`allocation-dot allocation-${allocation.source}`}
                          />
                          <b>{sourceLabels[allocation.source]}</b>
                          <span>
                            {allocation.companyCapability ??
                              allocation.partnerName ??
                              allocation.resourceName ??
                              "Kërkon verifikim"}
                          </span>
                          {allocation.sharePercent > 0 && (
                            <em>{allocation.sharePercent}%</em>
                          )}
                        </div>
                        <div className="allocation-controls">
                          <select
                            aria-label={`Burimi për ${workPackage.task}`}
                            value={allocation.source}
                            onChange={(event) =>
                              void changeAllocation(allocation, {
                                source: event.target
                                  .value as TenderWorkAllocation["source"],
                              })
                            }
                          >
                            <option value="internal">Kompania</option>
                            <option value="partner">Nënkontraktor</option>
                            <option value="hybrid">Hibride</option>
                            <option value="rental">Makineri me qira</option>
                            <option value="uncovered">E pambuluar</option>
                          </select>
                          <button
                            type="button"
                            className={
                              allocation.status === "confirmed"
                                ? "confirmed-button"
                                : "secondary-button"
                            }
                            onClick={() =>
                              void changeAllocation(allocation, {
                                status: "confirmed",
                              })
                            }
                          >
                            {allocation.status === "confirmed"
                              ? "✓ Konfirmuar"
                              : "Konfirmo"}
                          </button>
                        </div>
                        <small className="allocation-rationale">
                          {allocation.rationale}
                          {allocation.dependencyRisk !== "low" &&
                            ` Rrezik varësie: ${allocation.dependencyRisk === "high" ? "i lartë" : "mesatar"}.`}
                        </small>
                      </div>
                    ))}
                </div>
                <div className="delivery-evidence">
                  <span>PROVË · FAQE {workPackage.sourcePage}</span>
                  <q>“{workPackage.evidenceText}”</q>
                </div>
              </article>
            ))}
          </div>
        ))}
      </div>
    </section>
  );
}

function Fact({
  label,
  value,
  strong = false,
}: {
  label: string;
  value: string;
  strong?: boolean;
}) {
  return (
    <div className="fact">
      <span>{label}</span>
      <b className={strong ? "fact-strong" : ""}>{value}</b>
    </div>
  );
}
