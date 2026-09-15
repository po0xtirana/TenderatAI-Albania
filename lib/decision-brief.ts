import type {
  EvidenceCompleteness,
  TenderAction,
  TenderDecisionBrief,
  TenderDecisionIssue,
  TenderDeliveryPlan,
  TenderRecord,
  TenderRecommendation,
  TenderSuitability,
} from "./types";

const issueId = (kind: string, text: string) => `${kind}-${text.toLocaleLowerCase("sq-AL").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 100)}`;
const evidenceFor = (record: TenderRecord) => [{ page: record.tender.sourcePages.start, text: record.tender.contractObject, confidence: record.tender.extractionConfidence }];

function suitability(record: TenderRecord): TenderSuitability {
  if (record.match.decision === "high_fit") return "strong_fit";
  if (record.match.decision === "good_fit") return "good_fit";
  if (record.match.decision === "review") return "review_required";
  if (record.match.decision === "low_fit") return "weak_fit";
  return "unsuitable";
}

function evidenceCompleteness(record: TenderRecord): EvidenceCompleteness {
  const coverage = record.match.evidenceCoverage;
  if (coverage >= 85 && record.tender.sourceText.length > 1_500) return "complete";
  if (coverage >= 65) return "substantial";
  if (coverage >= 40) return "partial";
  return "limited";
}

function recommendation(record: TenderRecord, plan: TenderDeliveryPlan | undefined): { value: TenderRecommendation; reason: string } {
  if (record.match.eligibility === "not_eligible" || record.match.decision === "blocked") return { value: "do_not_proceed", reason: "Ka një kërkesë të konfirmuar që kompania nuk e mbulon ende." };
  if (record.match.decision === "low_fit") return { value: "do_not_proceed", reason: "Puna nuk përputhet mjaftueshëm me specializimet dhe kapacitetet e deklaruara." };
  if (plan?.summary.uncoveredCount) return { value: "high_risk", reason: "Disa faza të punës nuk kanë kapacitet të mbuluar." };
  if ((plan?.summary.partnerPercent ?? 0) > 0 || (plan?.summary.rentalCount ?? 0) > 0) return { value: "partner_required", reason: "Projekti është i realizueshëm, por kërkon partner ose pajisje me qira." };
  if (record.match.eligibility === "eligibility_pending" || record.match.evidenceCoverage < 70) return { value: "conditional", reason: "Përputhja është premtuese, por kriteret dhe provat duhet të verifikohen." };
  return { value: "proceed", reason: "Kapacitetet kryesore janë të mbuluara dhe nuk u gjet bllokues i konfirmuar." };
}

function generatedIssues(record: TenderRecord, plan: TenderDeliveryPlan | undefined): TenderDecisionIssue[] {
  const evidence = evidenceFor(record);
  const issues: TenderDecisionIssue[] = [];
  for (const text of record.match.blockers) issues.push({ id: issueId("blocker", text), type: "blocker", severity: "critical", title: "Bllokues i konfirmuar", description: text, tenderEvidence: evidence, companyEvidence: [], resolution: "Zgjidheni ose mos vazhdoni me ofertën.", status: "open" });
  for (const text of record.match.capabilityGaps) issues.push({ id: issueId("gap", text), type: "risk", severity: "high", title: "Boshllëk kapaciteti", description: text, tenderEvidence: evidence, companyEvidence: [], resolution: "Konfirmoni kapacitetin e brendshëm ose një partner të aprovuar.", status: "open" });
  for (const text of record.match.staleInformation) issues.push({ id: issueId("stale", text), type: "risk", severity: "medium", title: "Informacion që duhet përditësuar", description: text, tenderEvidence: [], companyEvidence: [text], resolution: "Përditësoni dokumentin ose disponueshmërinë në profilin e kompanisë.", status: "open" });
  for (const text of record.match.missingInformation) issues.push({ id: issueId("unknown", text), type: "unknown", severity: "medium", title: "Kërkon verifikim", description: text, tenderEvidence: evidence, companyEvidence: [], resolution: "Kontrolloni paketën e plotë të tenderit dhe dokumentet zyrtare.", status: "open" });
  if (plan?.summary.uncoveredCount) issues.push({ id: "uncovered-work", type: "blocker", severity: "critical", title: "Punë e pambuluar", description: `${plan.summary.uncoveredCount} faza të punës nuk kanë ekip, partner ose pajisje të konfirmuar.`, tenderEvidence: plan.workPackages.filter((item) => plan.allocations.some((allocation) => allocation.workPackageId === item.id && allocation.source === "uncovered")).map((item) => ({ page: item.sourcePage, text: item.evidenceText, confidence: item.confidence })), companyEvidence: [], resolution: "Shtoni ose konfirmoni një partner, ekip apo qira për këto faza.", status: "open" });
  if ((plan?.summary.partnerPercent ?? 0) > 0) issues.push({ id: "partner-confirmation", type: "risk", severity: "high", title: "Partnerët duhet të konfirmohen", description: "Plani i realizimit përfshin punë të rekomanduara për nënkontraktorë.", tenderEvidence: [], companyEvidence: [], resolution: "Kontaktoni partnerët dhe konfirmoni disponueshmërinë para se të përgatitni ofertën.", status: "open" });
  return issues;
}

function actionFor(issue: TenderDecisionIssue): TenderAction {
  return { id: `action-${issue.id}`, title: issue.type === "blocker" ? "Zgjidh bllokuesin" : issue.type === "unknown" ? "Verifiko kërkesën" : "Kontrollo rrezikun", description: `${issue.description} ${issue.resolution}`, priority: issue.severity === "critical" ? "urgent" : issue.severity === "high" ? "high" : "normal", status: "todo", relatedIssueId: issue.id, dueDate: null, completionNote: "" };
}

export function generateDecisionBrief(record: TenderRecord, existing?: TenderDecisionBrief): TenderDecisionBrief {
  const plan = record.deliveryPlan;
  const issues = generatedIssues(record, plan).map((item) => ({ ...item, status: existing?.issues.find((saved) => saved.id === item.id)?.status ?? item.status }));
  const actions = issues.map(actionFor).map((item) => {
    const saved = existing?.actions.find((action) => action.id === item.id);
    return saved ? { ...item, ...saved } : item;
  });
  const result = recommendation(record, plan);
  const strengths = [...record.match.confirmedCapabilities, ...record.match.reasons].filter((item) => {
    const value = item.trim().toLocaleLowerCase("sq-AL");
    return Boolean(value) && !value.includes("nuk ") && !value.includes("verifik") && !value.startsWith("kërkon ") && !value.startsWith("buletini ") && !value.startsWith("lokacioni ");
  }).slice(0, 5);
  return {
    tenderId: record.tender.id, capabilityVersion: record.match.capabilityVersion, recommendation: result.value,
    recommendationReason: result.reason, suitability: suitability(record), eligibility: record.match.eligibility,
    evidenceCompleteness: evidenceCompleteness(record), evidenceCoverage: record.match.evidenceCoverage,
    strengths, issues, actions, generatedAt: new Date().toISOString(), decision: existing?.decision ?? null,
  };
}
