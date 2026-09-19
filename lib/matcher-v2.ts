import { emptyCapabilityModel } from "./capabilities";
import { searchTermsForCpvCodes } from "./cpv-catalog";
import { normalize } from "./normalize";
import { generateDeliveryPlan } from "./delivery-plan";
import type {
  CapabilityRequirementMatch,
  CompanyCapabilityModel,
  CompanyCapabilityProfile,
  Evidence,
  MatchComponents,
  ScoringCriterionResult,
  TenderDecision,
  TenderEligibility,
  TenderMatch,
  TenderNotice,
} from "./types";

export const SCORING_MODEL_VERSION = "albania-evidence-adaptive-v2";
export const CALIBRATION_MODEL_VERSION = "feedback-beta-v1";

export type MatchCalibration = {
  adjustment: number;
  evidenceCount: number;
  version?: string;
};

type LegacyMatch = Pick<TenderMatch,
  "blockers" | "reasons" | "matchedTerms" | "missingInformation" | "confirmedCapabilities" |
  "capabilityGaps" | "staleInformation" | "requirementMatches"
>;

const WEIGHTS = { scope: 30, delivery: 25, experience: 15, financial: 15, geography: 5, schedule: 5, preference: 5 } as const;
const DAY = 86_400_000;
const MANDATORY_TERMS = ["kerkohet", "duhet te kete", "detyrimisht", "kusht i vecante", "kapaciteti teknik", "kriteret e vecanta", "operatori ekonomik"];

const WORK_TERMS: Record<string, string[]> = {
  ndërtim: ["ndertim", "punime ndertimi", "ndertimi"],
  rikonstruksion: ["rikonstruksion", "rehabilitim", "rikualifikim", "permiresim"],
  rrugë: ["rruge", "rrugor", "asfalt", "infrastrukture rrugore"],
  ujësjellës: ["ujesjelles", "furnizim me uje", "rrjet uji"],
  kanalizime: ["kanalizim", "ujera te ndotura", "impiant trajtimi"],
  hidroteknikë: ["hidroteknik", "vaditese", "hidrik"],
  shkolla: ["shkolle", "institucion arsimor"],
  shëndetësi: ["spital", "qender shendetesore", "shendetesor"],
  energji: ["energji", "elektrik", "ndricim", "fotovoltaik"],
  mirëmbajtje: ["mirembajtje", "riparim"],
  fasadë: ["fasade", "veshje fasade", "panel fasade", "gure dekorativ", "suvatim"],
  çati: ["cati", "hidroizolim", "ulluq", "mbulim catie"],
};

const REGION_TERMS: Record<string, string[]> = {
  tiranë: ["tirane", "tiranes"], durrës: ["durres", "durresit"], elbasan: ["elbasan", "elbasanit"],
  vlorë: ["vlore", "vlores"], berat: ["berat", "beratit"], shkodër: ["shkoder", "shkodres"],
  korçë: ["korce", "korces"], fier: ["fier", "fierit"], kukës: ["kukes", "kukesit"],
  lezhë: ["lezhe", "lezhes"], dibër: ["diber", "dibres"], gjirokastër: ["gjirokaster", "gjirokastres"],
};

const clamp = (value: number, min = 0, max = 100) => Math.max(min, Math.min(max, value));
const rounded = (value: number) => Math.round(clamp(value));
const sourceText = (tender: TenderNotice) => normalize([
  tender.contractObject, tender.contractingAuthority, tender.address, tender.procedureType,
  tender.cpvCodes.join(" "), tender.sourceText,
].filter(Boolean).join(" "));
const textIncludes = (text: string, value: string) => normalize(value).length >= 3 && text.includes(normalize(value));
const datesAvailable = (value: string | null | undefined) => !value || !Number.isFinite(Date.parse(value)) || Date.parse(value) <= Date.now();
const notExpired = (value: string | null | undefined) => !value || !Number.isFinite(Date.parse(value)) || Date.parse(value) >= Date.now();
const evidence = (tender: TenderNotice, text = tender.contractObject, confidence = tender.extractionConfidence): Evidence[] => [{ page: tender.sourcePages.start, text, confidence: clamp(confidence, 0, 1) }];

function commonPrefix(left: string, right: string): number {
  const a = left.replace(/\D/g, ""); const b = right.replace(/\D/g, "");
  let count = 0; while (count < a.length && count < b.length && a[count] === b[count]) count += 1;
  return count;
}

function cpvSimilarity(companyCode: string, tenderCode: string): number {
  const company = companyCode.replace(/\D/g, ""); const tender = tenderCode.replace(/\D/g, "");
  if (!company || !tender) return 0;
  if (tender.startsWith(company) || company.startsWith(tender)) {
    const specificity = Math.min(company.length, tender.length);
    return specificity >= 6 ? 100 : specificity >= 4 ? 90 : specificity >= 2 ? 72 : 0;
  }
  const shared = commonPrefix(company, tender);
  return shared >= 5 ? 88 : shared >= 4 ? 75 : shared >= 3 ? 45 : 0;
}

function partnerTerms(partner: CompanyCapabilityModel["partners"][number]): string[] {
  return [...partner.categories, ...(partner.workTypes ?? []), ...(partner.capabilities ?? []).flatMap((item) => [item.name, item.category, ...item.tasks])].filter(Boolean);
}

function activeApprovedPartners(model: CompanyCapabilityModel) {
  return model.partners.filter((partner) => partner.active && partner.approvalStatus === "approved");
}

function partnerMatchesTender(partner: CompanyCapabilityModel["partners"][number], tender: TenderNotice): boolean {
  const codes = [...(partner.cpvCodes ?? []), ...(partner.capabilities ?? []).flatMap((item) => item.cpvCodes)];
  if (codes.some((code) => tender.cpvCodes.some((tenderCode) => cpvSimilarity(code, tenderCode) >= 75))) return true;
  const text = sourceText(tender);
  return partnerTerms(partner).some((term) => textIncludes(text, term));
}

function detectedWorkTerms(tender: TenderNotice): string[] {
  const text = sourceText(tender);
  return Object.entries(WORK_TERMS).filter(([, terms]) => terms.some((term) => textIncludes(text, term))).map(([key]) => key);
}

function resultFor(score: number | null, applicability: ScoringCriterionResult["applicability"]): ScoringCriterionResult["result"] {
  if (applicability === "unknown" || score == null) return "unknown";
  if (applicability === "not_applicable") return "confirmed";
  if (score >= 75) return "confirmed";
  if (score >= 45) return "partial";
  if (score >= 20) return "missing";
  return "contradicted";
}

function makeCriterion(input: {
  key: ScoringCriterionResult["key"];
  label: string;
  weight: number;
  applicability: ScoringCriterionResult["applicability"];
  score: number | null;
  evidenceQuality: number;
  tenderEvidence?: Evidence[];
  companyEvidence?: string[];
  explanation: string;
}): ScoringCriterionResult {
  const quality = clamp(input.evidenceQuality, 0, 1);
  const score = input.score == null ? null : rounded(input.score);
  const uncertainty = 30 * (1 - quality);
  return {
    key: input.key,
    label: input.label,
    weight: input.weight,
    applicability: input.applicability,
    result: resultFor(score, input.applicability),
    score,
    evidenceQuality: Number(quality.toFixed(2)),
    contribution: score == null || input.applicability !== "applicable" ? 0 : Number((input.weight * score / 100).toFixed(1)),
    lowerBound: input.applicability === "unknown" ? 0 : input.applicability === "not_applicable" ? 0 : rounded((score ?? 0) - uncertainty),
    upperBound: input.applicability === "unknown" ? 100 : input.applicability === "not_applicable" ? 0 : rounded((score ?? 0) + uncertainty),
    tenderEvidence: input.tenderEvidence ?? [],
    companyEvidence: input.companyEvidence ?? [],
    explanation: input.explanation,
  };
}

function mandatoryContext(tender: TenderNotice, requirementText: string): boolean {
  const text = normalize(tender.sourceText);
  const needle = normalize(requirementText);
  let index = text.indexOf(needle);
  if (index < 0) {
    const compact = needle.replace(/[^a-z0-9]/g, "");
    if (compact.length >= 3) {
      const flexible = new RegExp(compact.split("").map((character) => character.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("[^a-z0-9]*"), "i");
      index = text.search(flexible);
    }
  }
  if (index < 0) return false;
  const window = text.slice(Math.max(0, index - 180), Math.min(text.length, index + needle.length + 180));
  return MANDATORY_TERMS.some((term) => window.includes(term));
}

function freshnessPenalty(model: CompanyCapabilityModel): number {
  const staleLabour = model.labourPools.some((item) => item.active && Number.isFinite(Date.parse(item.updatedAt)) && Date.now() - Date.parse(item.updatedAt) > 30 * DAY);
  const staleEquipment = model.equipment.some((item) => item.active && Number.isFinite(Date.parse(item.updatedAt)) && Date.now() - Date.parse(item.updatedAt) > 30 * DAY);
  return staleLabour || staleEquipment ? 0.15 : 0;
}

function scopeCriterion(tender: TenderNotice, model: CompanyCapabilityModel, profile: CompanyCapabilityProfile): ScoringCriterionResult {
  const text = sourceText(tender);
  const work = model.workCapabilities.filter((item) => item.active);
  const partners = activeApprovedPartners(model);
  const companyCodes = work.flatMap((item) => item.cpvPrefixes.map((code) => ({ code, label: item.trade })));
  const partnerCodes = partners.flatMap((partner) => [...(partner.cpvCodes ?? []), ...(partner.capabilities ?? []).flatMap((item) => item.cpvCodes)].map((code) => ({ code, label: partner.name })));
  let bestCpv = 0; const cpvEvidence: string[] = [];
  for (const companyCode of [...companyCodes, ...partnerCodes]) for (const tenderCode of tender.cpvCodes) {
    const similarity = cpvSimilarity(companyCode.code, tenderCode);
    if (similarity > bestCpv) { bestCpv = similarity; cpvEvidence.splice(0, cpvEvidence.length, `${companyCode.label}: ${companyCode.code} ↔ ${tenderCode}`); }
  }
  const directTerms = work.filter((item) => [item.trade, ...item.projectTypes, ...item.buildingTypes, ...searchTermsForCpvCodes(item.cpvPrefixes)].some((term) => textIncludes(text, term)));
  const matchingPartners = partners.filter((partner) => partnerMatchesTender(partner, tender));
  const legacyTerms = profile.trades.filter((trade) => (WORK_TERMS[trade] ?? [trade]).some((term) => textIncludes(text, term)));
  const configured = work.length > 0 || profile.trades.length > 0 || partners.length > 0;
  if (!configured) return makeCriterion({ key: "scope", label: "Fusha, CPV dhe paketat e punës", weight: WEIGHTS.scope, applicability: "unknown", score: null, evidenceQuality: 0, tenderEvidence: evidence(tender), explanation: "Kompania nuk ka aktivizuar ende fusha pune ose partnerë të aprovuar." });
  const semanticScore = directTerms.length || matchingPartners.length ? 86 : legacyTerms.length ? 78 : 0;
  const score = Math.max(bestCpv, semanticScore, tender.contractObject ? 10 : 0);
  const quality = bestCpv >= 75 && tender.cpvCodes.length ? Math.min(0.98, tender.extractionConfidence + 0.03) : semanticScore ? Math.min(0.84, tender.extractionConfidence) : Math.min(0.76, tender.extractionConfidence);
  const companyEvidence = [...cpvEvidence, ...directTerms.map((item) => item.trade), ...matchingPartners.map((item) => `${item.name} · partner i aprovuar`), ...legacyTerms].filter(Boolean);
  return makeCriterion({
    key: "scope", label: "Fusha, CPV dhe paketat e punës", weight: WEIGHTS.scope, applicability: "applicable", score,
    evidenceQuality: quality, tenderEvidence: evidence(tender), companyEvidence,
    explanation: score >= 75 ? `Objekti dhe CPV-ja përputhen me ${companyEvidence.slice(0, 3).join(", ")}.` : "Objekti është i qartë, por nuk u gjet një specializim i afërt në profilin aktiv.",
  });
}

function deliveryCriterion(tender: TenderNotice, model: CompanyCapabilityModel, legacy: LegacyMatch): ScoringCriterionResult {
  const plan = generateDeliveryPlan(tender, model);
  const explicit = legacy.requirementMatches.filter((item) => ["personnel", "equipment"].includes(item.requirementType) && mandatoryContext(tender, item.tenderRequirement));
  const confirmed = explicit.filter((item) => item.result === "confirmed").length;
  const companyEvidence = plan.allocations.filter((item) => item.source !== "uncovered" && item.source !== "rental").map((item) => item.companyCapability ?? item.partnerName ?? item.rationale).filter(Boolean);
  if (!explicit.length && !companyEvidence.length && !model.workCapabilities.length) return makeCriterion({ key: "delivery", label: "Kapaciteti i realizimit", weight: WEIGHTS.delivery, applicability: "unknown", score: null, evidenceQuality: 0, tenderEvidence: evidence(tender), explanation: "Nuk ka të dhëna të mjaftueshme për njerëzit, ekipet, pajisjet ose partnerët." });
  let score: number; let quality: number; let explanation: string;
  if (explicit.length) {
    score = 100 * confirmed / explicit.length;
    quality = Math.min(0.95, explicit.reduce((sum, item) => sum + item.confidence, 0) / explicit.length);
    explanation = `${confirmed} nga ${explicit.length} kërkesa të shprehura për personel ose pajisje mbulohen.`;
  } else if (plan.summary.internalPercent > 0 || plan.summary.partnerPercent > 0) {
    score = Math.round(plan.summary.internalPercent * 0.95 + plan.summary.partnerPercent * 0.75);
    quality = Math.max(0.35, Math.min(0.82, plan.workPackages.reduce((sum, item) => sum + item.confidence, 0) / Math.max(1, plan.workPackages.length) - freshnessPenalty(model)));
    explanation = plan.summary.internalPercent === 100
      ? "Të gjitha paketat e identifikuara mbulohen nga kapaciteti i brendshëm i disponueshëm."
      : `${plan.summary.internalPercent}% mbulohet brenda kompanisë dhe ${plan.summary.partnerPercent}% nga partnerë të aprovuar; pjesa tjetër kërkon verifikim.`;
  } else if (model.workCapabilities.length) {
    score = 60; quality = 0.45 - freshnessPenalty(model);
    explanation = "Fusha është deklaruar, por nuk u gjet staf, ekip ose partner i disponueshëm për paketat e identifikuara.";
  } else {
    score = 35; quality = 0.5;
    explanation = "Nuk u gjet kapacitet realizimi i lidhur qartë me objektin e tenderit.";
  }
  return makeCriterion({ key: "delivery", label: "Kapaciteti i realizimit", weight: WEIGHTS.delivery, applicability: "applicable", score, evidenceQuality: quality, tenderEvidence: explicit.flatMap((item) => item.tenderEvidence), companyEvidence, explanation });
}

function experienceCriterion(tender: TenderNotice, model: CompanyCapabilityModel): ScoringCriterionResult {
  const completed = model.referenceProjects.filter((project) => project.active && project.status === "completed");
  if (!completed.length) return makeCriterion({ key: "experience", label: "Eksperienca e ngjashme", weight: WEIGHTS.experience, applicability: "unknown", score: null, evidenceQuality: 0, tenderEvidence: evidence(tender), explanation: "Nuk janë regjistruar ende projekte reference të përfunduara." });
  const terms = detectedWorkTerms(tender); const text = sourceText(tender);
  const scored = completed.map((project) => {
    const cpv = Math.max(0, ...project.cpvCodes.flatMap((code) => tender.cpvCodes.map((tenderCode) => cpvSimilarity(code, tenderCode)))) * 0.35;
    const work = project.workTypes.some((type) => terms.some((term) => normalize(type).includes(normalize(term)) || normalize(term).includes(normalize(type))) || textIncludes(text, type)) ? 30 : 0;
    const valueRatio = project.valueAll && tender.limitFundAll ? Math.min(project.valueAll, tender.limitFundAll) / Math.max(project.valueAll, tender.limitFundAll) : null;
    const value = valueRatio == null ? 7 : valueRatio >= 0.5 ? 15 : valueRatio >= 0.2 ? 10 : 4;
    const authority = project.authority && normalize(project.authority) === normalize(tender.contractingAuthority) ? 10 : 0;
    const region = project.region && textIncludes(text, project.region) ? 5 : 0;
    const ageYears = project.endDate && Number.isFinite(Date.parse(project.endDate)) ? (Date.now() - Date.parse(project.endDate)) / (365 * DAY) : null;
    const recency = ageYears == null ? 2 : ageYears <= 3 ? 5 : ageYears <= 7 ? 3 : 1;
    return { project, score: rounded(cpv + work + value + authority + region + recency) };
  }).sort((a, b) => b.score - a.score);
  const top = scored.slice(0, 3); const factors = [0.5, 0.3, 0.2].slice(0, top.length); const denominator = factors.reduce((sum, item) => sum + item, 0);
  const score = top.reduce((sum, item, index) => sum + item.score * factors[index], 0) / denominator;
  const quality = Math.min(0.9, 0.55 + top.length * 0.1 + (tender.limitFundAll != null ? 0.05 : 0));
  return makeCriterion({ key: "experience", label: "Eksperienca e ngjashme", weight: WEIGHTS.experience, applicability: "applicable", score, evidenceQuality: quality, tenderEvidence: evidence(tender), companyEvidence: top.map((item) => `${item.project.title} · ${item.score}% ngjashmëri`), explanation: score >= 70 ? "Projektet reference tregojnë eksperiencë të fortë dhe të krahasueshme." : score >= 45 ? "Ka eksperiencë pjesërisht të krahasueshme, por jo një precedent të plotë." : "Projektet e regjistruara kanë ngjashmëri të ulët me këtë objekt." });
}

function financialCriterion(tender: TenderNotice, model: CompanyCapabilityModel, profile: CompanyCapabilityProfile, legacy: LegacyMatch): ScoringCriterionResult {
  const value = tender.limitFundAll;
  const workMaximum = Math.max(0, ...model.workCapabilities.filter((item) => item.active).map((item) => item.maxProjectValueAll ?? 0));
  const maximum = model.financialCapacity.maxContractValueAll ?? (workMaximum || profile.maxValueAll);
  const backlog = model.financialCapacity.currentBacklogAll;
  const concurrent = model.financialCapacity.maxConcurrentCommitmentAll;
  const remaining = concurrent != null && backlog != null ? Math.max(0, concurrent - backlog) : null;
  const available = maximum == null ? remaining : remaining == null ? maximum : Math.min(maximum, remaining);
  if (value == null || available == null) return makeCriterion({ key: "financial", label: "Kapaciteti financiar", weight: WEIGHTS.financial, applicability: "unknown", score: null, evidenceQuality: 0, tenderEvidence: value == null ? [] : evidence(tender, `${value} ALL`), companyEvidence: available == null ? [] : [`Kapacitet i lirë: ${available.toLocaleString("sq-AL")} ALL`], explanation: value == null ? "Fondi limit nuk është publikuar ose nuk u ekstraktua me siguri." : "Kompania nuk ka deklaruar kufirin e kontratës ose angazhimin e lirë." });
  const ratio = available / Math.max(1, value);
  let score = ratio >= 2 ? 100 : ratio >= 1.25 ? 90 : ratio >= 1 ? 75 : ratio >= 0.8 ? 35 : 0;
  const guaranteeFailure = legacy.requirementMatches.some((item) => item.requirementType === "financial" && item.result === "missing" && item.confidence >= 0.85 && mandatoryContext(tender, item.tenderRequirement));
  if (guaranteeFailure) score = 0;
  return makeCriterion({ key: "financial", label: "Kapaciteti financiar", weight: WEIGHTS.financial, applicability: "applicable", score, evidenceQuality: Math.min(0.94, tender.extractionConfidence), tenderEvidence: evidence(tender, `${value.toLocaleString("sq-AL")} ALL`), companyEvidence: [`Kapacitet i lirë: ${available.toLocaleString("sq-AL")} ALL`, `Raporti i mbulimit: ${ratio.toFixed(2)}×`], explanation: score >= 75 ? "Vlera e tenderit mbulohet nga kufiri financiar dhe angazhimi i lirë." : score > 0 ? "Vlera është pranë ose mbi kapacitetin e deklaruar dhe kërkon verifikim financiar." : "Vlera ose garancia tejkalon kapacitetin financiar të deklaruar." });
}

function geographyCriterion(tender: TenderNotice, model: CompanyCapabilityModel, profile: CompanyCapabilityProfile): ScoringCriterionResult {
  const areas = model.serviceAreas.filter((item) => item.active);
  const legacyAreas = profile.serviceRegions;
  const text = sourceText(tender);
  const locationKnown = Boolean(tender.address) || Object.values(REGION_TERMS).some((terms) => terms.some((term) => textIncludes(text, term)));
  if (!locationKnown) return makeCriterion({ key: "geography", label: "Gjeografia dhe mobilizimi", weight: WEIGHTS.geography, applicability: "unknown", score: null, evidenceQuality: 0, explanation: "Vendndodhja nuk është publikuar qartë në buletin." });
  if (!areas.length && !legacyAreas.length) return makeCriterion({ key: "geography", label: "Gjeografia dhe mobilizimi", weight: WEIGHTS.geography, applicability: "unknown", score: null, evidenceQuality: 0, tenderEvidence: evidence(tender, tender.address ?? tender.contractObject), explanation: "Kompania nuk ka deklaruar ende zonat e shërbimit." });
  const hit = areas.find((area) => (REGION_TERMS[area.region] ?? [area.region]).some((term) => textIncludes(text, term)) || area.municipalities.some((item) => textIncludes(text, item)));
  const legacyHit = legacyAreas.find((area) => textIncludes(text, area));
  const temporary = areas.some((area) => area.temporarySiteCapable && !area.remoteLimitations);
  const score = hit || legacyHit ? 100 : temporary ? 65 : 20;
  return makeCriterion({ key: "geography", label: "Gjeografia dhe mobilizimi", weight: WEIGHTS.geography, applicability: "applicable", score, evidenceQuality: Math.min(0.88, tender.extractionConfidence), tenderEvidence: evidence(tender, tender.address ?? tender.contractObject), companyEvidence: hit ? [`${hit.region} · mobilizim ${hit.mobilizationDays ?? "—"} ditë`] : legacyHit ? [legacyHit] : areas.map((area) => area.region), explanation: score === 100 ? "Vendndodhja mbulohet nga zona aktive e shërbimit." : score >= 60 ? "Nevojitet mobilizim jashtë bazës, por kompania ka deklaruar kantier të përkohshëm." : "Vendndodhja duket jashtë zonave të deklaruara." });
}

function scheduleCriterion(tender: TenderNotice, model: CompanyCapabilityModel): ScoringCriterionResult {
  if (!tender.submissionDeadline || !Number.isFinite(Date.parse(tender.submissionDeadline))) return makeCriterion({ key: "schedule", label: "Afati dhe ngarkesa", weight: WEIGHTS.schedule, applicability: "unknown", score: null, evidenceQuality: 0, explanation: "Afati i ofertës nuk është publikuar qartë." });
  const leadDays = Math.ceil((Date.parse(tender.submissionDeadline) - Date.now()) / DAY);
  const commitments = model.commitments.filter((item) => item.active && (!item.endDate || Date.parse(item.endDate) >= Date.now()));
  const maxProjects = model.bidPreferences.maxConcurrentProjects;
  const full = maxProjects != null && commitments.length >= maxProjects;
  const minimumLead = model.bidPreferences.minimumLeadDays;
  const score = leadDays <= 0 ? 0 : minimumLead != null && leadDays < minimumLead ? 20 : full ? 30 : 90;
  return makeCriterion({ key: "schedule", label: "Afati dhe ngarkesa", weight: WEIGHTS.schedule, applicability: "applicable", score, evidenceQuality: Math.min(0.95, tender.extractionConfidence), tenderEvidence: evidence(tender, tender.submissionDeadline), companyEvidence: [`${commitments.length} angazhime aktive`, minimumLead == null ? "Pa prag minimal të ofertës" : `Minimumi: ${minimumLead} ditë`], explanation: leadDays <= 0 ? "Afati i ofertës ka kaluar." : score >= 75 ? `Mbeten ${leadDays} ditë dhe kapaciteti i projekteve nuk rezulton i plotë.` : `Mbeten ${leadDays} ditë ose ngarkesa aktuale kërkon verifikim.` });
}

function preferenceCriterion(tender: TenderNotice, model: CompanyCapabilityModel, profile: CompanyCapabilityProfile): ScoringCriterionResult {
  const preferences = model.bidPreferences; const text = sourceText(tender);
  const excludedWork = [...profile.excludedTerms, ...model.workCapabilities.flatMap((item) => item.excludedWork), ...preferences.excludedProjectTypes].find((term) => term.trim() && textIncludes(text, term));
  const excludedAuthority = preferences.excludedAuthorities.find((item) => textIncludes(text, item));
  const preferredAuthority = [...profile.preferredAuthorities, ...preferences.preferredAuthorities].find((item) => textIncludes(text, item));
  const preferredType = preferences.preferredProjectTypes.find((item) => textIncludes(text, item));
  const configured = Boolean(excludedWork || excludedAuthority || preferredAuthority || preferredType || preferences.preferredAuthorities.length || preferences.preferredProjectTypes.length || preferences.excludedAuthorities.length || preferences.excludedProjectTypes.length);
  if (!configured) return makeCriterion({ key: "preference", label: "Preferencat tregtare", weight: WEIGHTS.preference, applicability: "not_applicable", score: null, evidenceQuality: 1, explanation: "Nuk janë vendosur rregulla tregtare që zbatohen për këtë tender." });
  const score = excludedWork || excludedAuthority ? 0 : preferredAuthority || preferredType ? 100 : 60;
  const evidenceItems = [excludedWork, excludedAuthority, preferredAuthority, preferredType].filter((item): item is string => Boolean(item));
  return makeCriterion({ key: "preference", label: "Preferencat tregtare", weight: WEIGHTS.preference, applicability: "applicable", score, evidenceQuality: evidenceItems.length ? 0.9 : 0.6, tenderEvidence: evidenceItems.length ? evidence(tender, evidenceItems.join(", ")) : [], companyEvidence: evidenceItems, explanation: excludedWork || excludedAuthority ? "Tenderi prek një përjashtim të deklaruar nga kompania." : preferredAuthority || preferredType ? "Autoriteti ose lloji i projektit është i preferuar." : "Nuk ka preferencë të drejtpërdrejtë; tenderi mbetet neutral tregtarisht." });
}

function componentProjection(criteria: ScoringCriterionResult[]): MatchComponents {
  const contribution = (key: ScoringCriterionResult["key"]) => Math.round(criteria.find((item) => item.key === key)?.contribution ?? 0);
  const delivery = criteria.find((item) => item.key === "delivery");
  const peopleShare = delivery ? Math.round(delivery.contribution * 0.76) : 0;
  const equipmentShare = delivery ? Math.round(delivery.contribution - peopleShare) : 0;
  return { scope: contribution("scope"), compliance: 0, experience: contribution("experience"), people: peopleShare, equipment: equipmentShare, financial: contribution("financial"), geography: contribution("geography"), schedule: contribution("schedule"), preference: contribution("preference") };
}

export function matchTenderV2(tender: TenderNotice, profile: CompanyCapabilityProfile, suppliedModel: CompanyCapabilityModel | undefined, legacy: LegacyMatch, calibration: MatchCalibration = { adjustment: 0, evidenceCount: 0 }): TenderMatch {
  const model = suppliedModel ?? emptyCapabilityModel(profile);
  const requirementMatches: CapabilityRequirementMatch[] = legacy.requirementMatches.map((item) => {
    if (item.result !== "missing" || mandatoryContext(tender, item.tenderRequirement)) return item;
    return { ...item, result: "unknown", explanation: `${item.tenderRequirement} u përmend, por nuk u konfirmua si kërkesë detyruese në burimin e disponueshëm.` };
  });
  const criteria = [scopeCriterion(tender, model, profile), deliveryCriterion(tender, model, { ...legacy, requirementMatches }), experienceCriterion(tender, model), financialCriterion(tender, model, profile, { ...legacy, requirementMatches }), geographyCriterion(tender, model, profile), scheduleCriterion(tender, model), preferenceCriterion(tender, model, profile)];
  const denominator = criteria.filter((item) => item.applicability !== "not_applicable").reduce((sum, item) => sum + item.weight, 0) || 100;
  const known = criteria.filter((item) => item.applicability === "applicable" && item.score != null && item.evidenceQuality > 0);
  const observedWeight = known.reduce((sum, item) => sum + item.weight * item.evidenceQuality, 0);
  const observedFit = observedWeight ? known.reduce((sum, item) => sum + item.weight * item.evidenceQuality * (item.score ?? 0), 0) / observedWeight : 50;
  const coverage = clamp(observedWeight / denominator, 0, 1);
  const trust = 0.35 + 0.65 * coverage;
  const boundedAdjustment = calibration.evidenceCount >= 5 ? clamp(calibration.adjustment, -5, 5) : 0;
  let score = rounded(50 + (observedFit - 50) * trust + boundedAdjustment);
  let fitRangeLow = rounded(criteria.reduce((sum, item) => sum + item.weight * item.lowerBound / 100, 0) / denominator * 100);
  let fitRangeHigh = rounded(criteria.reduce((sum, item) => sum + item.weight * item.upperBound / 100, 0) / denominator * 100);
  const confidenceScore = rounded(coverage * 100);
  const scopeResult = criteria.find((item) => item.key === "scope")!;
  // Schedule or geography can refine a suitable opportunity, but they must
  // never manufacture suitability when the company has not declared its work.
  if (scopeResult.applicability === "unknown") score = Math.min(score, 50);

  const explicitFailures = requirementMatches.filter((item) => ["missing", "expired", "unavailable"].includes(item.result) && item.confidence >= 0.85 && mandatoryContext(tender, item.tenderRequirement));
  const expiredDeadline = tender.submissionDeadline != null && Number.isFinite(Date.parse(tender.submissionDeadline)) && Date.parse(tender.submissionDeadline) <= Date.now();
  const excluded = criteria.find((item) => item.key === "preference")?.score === 0;
  const financialFailure = criteria.find((item) => item.key === "financial")?.score === 0 && criteria.find((item) => item.key === "financial")?.evidenceQuality! >= 0.85;
  const lifecycleFailure = tender.lifecycleStatus === "cancelled" || tender.lifecycleStatus === "correction";
  const hardBlocked = lifecycleFailure || expiredDeadline || excluded || financialFailure || explicitFailures.length > 0;
  const blockers = [
    ...(tender.lifecycleStatus === "cancelled" ? ["Procedura është anuluar dhe nuk është mundësi aktive."] : []),
    ...(tender.lifecycleStatus === "correction" ? ["Ky është njoftim korrigjimi dhe duhet lidhur me procedurën kryesore."] : []),
    ...(expiredDeadline ? ["Afati i dorëzimit ka kaluar."] : []),
    ...(excluded ? [criteria.find((item) => item.key === "preference")!.explanation] : []),
    ...(financialFailure ? ["Vlera ose garancia tejkalon kapacitetin financiar të deklaruar."] : []),
    ...explicitFailures.map((item) => `Kërkesë e detyrueshme e pambuluar: ${item.tenderRequirement}.`),
  ];
  // A blocker answers whether the company can pursue the opportunity; it does
  // not erase how closely the work itself fits the company. Keeping these
  // values separate prevents an expired deadline or a commercial exclusion
  // from being presented as zero technical capability.

  const mandatory = requirementMatches.filter((item) => mandatoryContext(tender, item.tenderRequirement));
  let eligibility: TenderEligibility = hardBlocked ? "not_eligible" : mandatory.length && mandatory.every((item) => item.result === "confirmed") ? "eligible" : "eligibility_pending";
  if (hardBlocked) eligibility = "not_eligible";
  const eligibilityReason = eligibility === "eligible" ? "Kërkesat detyruese të identifikuara në burim mbulohen nga profili aktiv." : eligibility === "not_eligible" ? "Të paktën një bllokues ose kërkesë detyruese e konfirmuar nuk mbulohet." : "Buletini nuk përmban kriteret e plota; kualifikimi mbetet për verifikim pa ulur artificialisht përshtatjen.";
  const criticalUnknowns = criteria.filter((item) => item.applicability === "unknown" && item.weight >= 10).map((item) => item.explanation);

  let decision: TenderDecision; let recommendation: TenderMatch["recommendation"]; let recommendationReason: string;
  if (hardBlocked) { decision = "blocked"; recommendation = "blocked"; recommendationReason = "Ekziston të paktën një bllokues i konfirmuar."; }
  else if (score >= 80 && confidenceScore >= 60 && (scopeResult.score ?? 0) >= 65 && !criticalUnknowns.length) { decision = "high_fit"; recommendation = "strong"; recommendationReason = "Përshtatja është e lartë, provat janë të mjaftueshme dhe nuk ka boshllëqe kritike."; }
  else if (score >= 65 && confidenceScore >= 40 && (scopeResult.score ?? 0) >= 65) { decision = "good_fit"; recommendation = "good"; recommendationReason = "Tenderi përputhet mirë me kapacitetet e njohura; verifikoni kriteret që mungojnë."; }
  else if ((scopeResult.score ?? 0) >= 65 && (score >= 55 || fitRangeHigh >= 65)) { decision = "review"; recommendation = "promising_verify"; recommendationReason = "Mundësia duket premtuese, por të dhënat e kufizuara nuk lejojnë një vendim të fortë."; }
  else if (score >= 50) { decision = "review"; recommendation = "review"; recommendationReason = "Ka elemente të përshtatshme dhe boshllëqe që duhen kontrolluar para vendimit."; }
  else if (fitRangeHigh < 65 && confidenceScore >= 35) { decision = "low_fit"; recommendation = "low"; recommendationReason = "Edhe skenari pozitiv nuk e çon tenderin në një përputhje të fortë."; }
  else { decision = "review"; recommendation = "promising_verify"; recommendationReason = "Informacioni është tepër i kufizuar për ta refuzuar me siguri."; }

  const strongest = [...criteria].filter((item) => item.score != null).sort((a, b) => (b.contribution * b.evidenceQuality) - (a.contribution * a.evidenceQuality)).slice(0, 3);
  const reasons = strongest.map((item) => item.explanation);
  if (boundedAdjustment) reasons.push(`Preferencat e mësuara nga ${calibration.evidenceCount} vlerësime ndryshuan renditjen me ${boundedAdjustment > 0 ? "+" : ""}${boundedAdjustment} pikë.`);
  const missingInformation = [...new Set([
    ...criteria.filter((item) => item.applicability === "unknown").map((item) => item.explanation),
    ...requirementMatches.filter((item) => item.result === "unknown").map((item) => item.explanation),
  ])];
  const confirmedCapabilities = [...new Set([
    ...criteria.filter((item) => item.result === "confirmed").flatMap((item) => item.companyEvidence),
    ...requirementMatches.filter((item) => item.result === "confirmed" && item.companyCapability).map((item) => item.companyCapability!),
  ])];
  const capabilityGaps = [...new Set([
    ...criteria.filter((item) => ["missing", "contradicted"].includes(item.result)).map((item) => item.explanation),
    ...explicitFailures.map((item) => `Kërkesa e detyrueshme nuk mbulohet: ${item.tenderRequirement}.`),
  ])];

  return {
    tenderId: tender.id,
    score,
    decision,
    components: componentProjection(criteria),
    blockers: [...new Set(blockers)],
    reasons,
    matchedTerms: legacy.matchedTerms.length ? legacy.matchedTerms : detectedWorkTerms(tender),
    missingInformation,
    confirmedCapabilities,
    capabilityGaps,
    staleInformation: [...new Set(legacy.staleInformation)],
    requirementMatches,
    eligibility,
    eligibilityReason,
    evidenceCoverage: confidenceScore,
    observedFitScore: rounded(observedFit),
    confidenceScore,
    fitRangeLow,
    fitRangeHigh,
    criterionResults: criteria,
    recommendation,
    recommendationReason,
    criticalUnknowns,
    scoringModelVersion: SCORING_MODEL_VERSION,
    calibrationVersion: calibration.version ?? CALIBRATION_MODEL_VERSION,
    capabilityVersion: model.activeVersion,
    updatedAt: new Date().toISOString(),
  };
}
