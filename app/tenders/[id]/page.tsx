"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import type {
  TenderDeliveryPlan,
  TenderEligibility,
  TenderRecord,
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
            <small>PËRPUTHJA</small>
            <strong>{match.score}</strong>
            <span>/100</span>
          </div>
        </section>
        <section className="workflow-bar" aria-label="Gjendja e tenderit">
          <div>
            <span className="eyebrow">HAPI I KOMPANISË</span>
            <strong>{workflowLabels[workflowStatus]}</strong>
          </div>
          <div className="workflow-actions">
            {(
              [
                "watching",
                "reviewing",
                "bid",
                "no_bid",
              ] as TenderWorkflowStatus[]
            ).map((status) => (
              <button
                key={status}
                type="button"
                className={workflowStatus === status ? "active" : ""}
                disabled={savingStatus}
                onClick={() => void saveWorkflow(status)}
              >
                {workflowLabels[status]}
              </button>
            ))}
          </div>
        </section>
        <section className="eligibility-panel">
          <div>
            <span className="eyebrow">STATUSI I KUALIFIKIMIT</span>
            <b>{eligibilityLabels[match.eligibility]}</b>
            <p>{match.eligibilityReason}</p>
          </div>
          <div>
            <span className="eyebrow">MBULIMI I PROVAVE</span>
            <b>{match.evidenceCoverage}%</b>
            <p>Sa shumë fakte të kontrollueshme u gjetën në buletin.</p>
          </div>
        </section>
        {deliveryPlan && (
          <DeliveryPlanSection
            plan={deliveryPlan}
            onPlanChange={setDeliveryPlan}
            tenderId={tender.id}
          />
        )}
        <div className="detail-grid">
          <div>
            <section className="detail-card">
              <div className="detail-card-heading">
                <div>
                  <p className="eyebrow">PSE U RENDIT</p>
                  <h2>Arsyeja e përputhjes</h2>
                </div>
                <span className="verified">✓ E GJURMUESHME</span>
              </div>
              <div className="components">
                {Object.entries(match.components).map(([key, value]) => (
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
          <aside className="detail-side">
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
            Sistemi ndan detyrat mes kompanisë, partnerëve dhe makinerive me
            qira. Konfirmoni sugjerimet para ofertës.
          </p>
        </div>
        <span className="verified">
          v{plan.capabilityVersion} · {plan.summary.provisionalCount} paraprake
        </span>
      </div>
      <div className="delivery-summary">
        <span>
          <b>{plan.summary.internalPercent}%</b> kompani
        </span>
        <span>
          <b>{plan.summary.partnerPercent}%</b> partnerë
        </span>
        <span>
          <b>{plan.summary.rentalCount}</b> qira
        </span>
        <span className={plan.summary.uncoveredCount ? "warning" : ""}>
          <b>{plan.summary.uncoveredCount}</b> pambuluara
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
                </div>
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
