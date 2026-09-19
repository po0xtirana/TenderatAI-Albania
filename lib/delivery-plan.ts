import { CONSTRUCTION_CPV_CATALOG, suggestCpvSpecializations } from "./cpv-catalog";
import { normalize } from "./normalize";
import type { CapabilityPartner, CompanyCapabilityModel, TenderDeliveryPlan, TenderNotice, TenderWorkAllocation, TenderWorkPackage, WorkPackageSource } from "./types";

type ScopeMatch = NonNullable<TenderWorkPackage["scopeMatch"]>;
type DeliveryStatus = NonNullable<TenderWorkPackage["deliveryStatus"]>;
type PackageSeed = { key: string; phase: string; task: string; cpv: string; requirements: string[]; confidence: number; source: WorkPackageSource; roleGroups: string[][]; minimumQualifiedGroups: number };
type WorkFit = { work: CompanyCapabilityModel["workCapabilities"][number]; match: ScopeMatch } | null;
type InternalFit = { work: CompanyCapabilityModel["workCapabilities"][number]; evidence: string[]; confirmed: boolean } | null;

export const DELIVERY_PLANNER_VERSION = "evidence-components-v3";

const ROLE_FAMILIES: Array<{ cpvPrefixes: string[]; groups: string[][]; minimum: number }> = [
  { cpvPrefixes: ["4521"], groups: [["murator", "murature"], ["karpentier", "marangoz"], ["hekur kthyes", "betonist"]], minimum: 2 },
  { cpvPrefixes: ["4526"], groups: [["karpentier", "marangoz", "catipunues"], ["hidroizol", "llamarin"]], minimum: 1 },
  { cpvPrefixes: ["452623"], groups: [["betonist", "hekur kthyes"], ["karpentier", "marangoz"]], minimum: 1 },
  { cpvPrefixes: ["452625"], groups: [["murator", "murature"]], minimum: 1 },
  { cpvPrefixes: ["4531"], groups: [["elektr", "elekrit", "ndricim", "kabll"]], minimum: 1 },
  { cpvPrefixes: ["4533", "45232"], groups: [["hidraul", "ujesjelles", "kanaliz", "tubacion"]], minimum: 1 },
  { cpvPrefixes: ["4541", "4543", "4544", "4545"], groups: [["bojaxhi", "suvat", "fasad", "pllaka", "murator"]], minimum: 1 },
  { cpvPrefixes: ["4511"], groups: [["prish", "demolim", "punetor krahu", "operator"]], minimum: 1 },
  { cpvPrefixes: ["4523"], groups: [["rruge", "asfalt", "operator", "shofer"], ["hidraul", "kanaliz", "ujesjelles"]], minimum: 1 },
];

const digits = (value: string) => value.replace(/\D/g, "").slice(0, 8);
const sharedCpvPrefix = (left: string, right: string) => { const a = digits(left); const b = digits(right); let count = 0; while (count < a.length && count < b.length && a[count] === b[count]) count += 1; return count; };
const cpvRelated = (left: string, right: string, minimum = 4) => { const a = digits(left); const b = digits(right); return Boolean(a && b) && (a.startsWith(b) || b.startsWith(a) || sharedCpvPrefix(a, b) >= minimum); };
const availableNow = (value: string | null | undefined) => !value || !Number.isFinite(Date.parse(value)) || Date.parse(value) <= Date.now();

function phaseFor(label: string) {
  const value = normalize(label);
  if (/(projektim|mbikeqyr|inxhinier)/.test(value)) return "Projektim dhe koordinim";
  if (/(cati|hidroizolim|ulluq)/.test(value)) return "Çati dhe hidroizolim";
  if (/(fasade|veshje|panel|suvat|lyerje|skeleri)/.test(value)) return "Fasada dhe përfundime";
  if (/(elektr|hidraul|ujesjelles|kanaliz|tubacion)/.test(value)) return "Instalime dhe rrjete";
  if (/(rruge|asfalt|beton|murature|ndertim)/.test(value)) return "Punime civile dhe strukturë";
  if (/(prish|demolim)/.test(value)) return "Përgatitje dhe prishje";
  return "Punë ose furnizime të specializuara";
}

function roleRequirement(cpv: string): Pick<PackageSeed, "roleGroups" | "minimumQualifiedGroups"> {
  const found = ROLE_FAMILIES.find((family) => family.cpvPrefixes.some((prefix) => digits(cpv).startsWith(prefix)));
  return found ? { roleGroups: found.groups, minimumQualifiedGroups: found.minimum } : { roleGroups: [], minimumQualifiedGroups: 0 };
}

function unresolvedSeed(code: string): PackageSeed {
  const prefix = digits(code).slice(0, 2);
  const mapping: Record<string, { task: string; phase: string }> = {
    "71": { task: "Projektim dhe shërbime teknike", phase: "Projektim dhe koordinim" },
    "43": { task: "Makineri dhe pajisje kantieri", phase: "Pajisje dhe logjistikë" },
    "35": { task: "Sisteme sigurie dhe mbrojtjeje", phase: "Sisteme të specializuara" },
    "34": { task: "Pajisje transporti, porte ose sigurie rrugore", phase: "Sisteme të specializuara" },
    "45": { task: "Punime ndërtimi të paspecifikuara", phase: "Punime civile dhe strukturë" },
  };
  const resolved = mapping[prefix] ?? { task: `Komponent i paspecifikuar (CPV ${digits(code)})`, phase: "Kërkon verifikim" };
  return { key: `unresolved-${prefix || digits(code)}`, phase: resolved.phase, task: resolved.task, cpv: digits(code), requirements: [`CPV ${digits(code)}`], confidence: 0.58, source: "bulletin", roleGroups: [], minimumQualifiedGroups: 0 };
}

function packageSeeds(tender: TenderNotice): PackageSeed[] {
  const byKey = new Map<string, PackageSeed>();
  const add = (seed: PackageSeed) => { const existing = byKey.get(seed.key); byKey.set(seed.key, existing ? { ...existing, requirements: [...new Set([...existing.requirements, ...seed.requirements])], confidence: Math.max(existing.confidence, seed.confidence) } : seed); };
  for (const code of tender.cpvCodes) {
    const candidates = CONSTRUCTION_CPV_CATALOG.map((item) => ({ item, shared: sharedCpvPrefix(code, item.code) })).filter((item) => item.shared >= 4);
    const highest = Math.max(0, ...candidates.map((item) => item.shared));
    if (!highest) { add(unresolvedSeed(code)); continue; }
    for (const { item } of candidates.filter((candidate) => candidate.shared === highest)) {
      const roles = roleRequirement(item.code);
      add({ key: item.code, phase: phaseFor(item.labelAl), task: item.labelAl, cpv: item.code, requirements: [`CPV ${digits(code)}`], confidence: 0.82, source: "bulletin", ...roles });
    }
  }
  for (const item of suggestCpvSpecializations(tender.contractObject, 8)) {
    const roles = roleRequirement(item.code);
    add({ key: item.code, phase: phaseFor(item.labelAl), task: item.labelAl, cpv: item.code, requirements: ["Përfundim nga objekti i kontratës"], confidence: Math.min(0.7, item.score / 100), source: "inference", ...roles });
  }
  if (!byKey.size) add({ key: "unknown", phase: "Analizë e tenderit", task: tender.contractObject || "Objekti duhet verifikuar", cpv: "", requirements: ["Nuk u gjet kod ose përshkrim i mjaftueshëm"], confidence: 0.25, source: "inference", roleGroups: [], minimumQualifiedGroups: 0 });
  return [...byKey.values()].slice(0, 16);
}

function workFit(seed: PackageSeed, model: CompanyCapabilityModel): WorkFit {
  const task = normalize(seed.task); const work = model.workCapabilities.filter((item) => item.active && item.deliveryMethod !== "subcontracted");
  let best: WorkFit = null; let rank = -1;
  for (const item of work) {
    const prefixScore = Math.max(0, ...item.cpvPrefixes.map((code) => sharedCpvPrefix(seed.cpv, code)));
    const termHit = [item.trade, ...item.projectTypes, ...item.buildingTypes].some((term) => term && (task.includes(normalize(term)) || normalize(term).includes(task)));
    const next: ScopeMatch = prefixScore >= 6 ? "exact" : prefixScore >= 4 || termHit ? "equivalent" : seed.cpv && item.cpvPrefixes.some((code) => digits(code).slice(0, 2) === digits(seed.cpv).slice(0, 2)) ? "broad" : "unmatched";
    const nextRank = next === "exact" ? 4 : next === "equivalent" ? 3 : next === "broad" ? 2 : 0;
    if (nextRank > rank) { best = next === "unmatched" ? null : { work: item, match: next }; rank = nextRank; }
  }
  return best;
}

function valuesCoverGroups(values: string[], groups: string[][]): { evidence: string[]; count: number } {
  const text = normalize(values.filter(Boolean).join(" "));
  const matched = groups.map((group) => group.find((term) => text.includes(normalize(term))) ?? null).filter((item): item is string => Boolean(item));
  return { evidence: [...new Set(matched)], count: matched.length };
}

function internalFit(seed: PackageSeed, model: CompanyCapabilityModel): InternalFit {
  const scope = workFit(seed, model); if (!scope) return null;
  // Preserve the actual matched role family. Counting words in a rendered label
  // made a single "punëtor krahu" look like several qualified construction
  // roles. A component is confirmed only when its distinct required families
  // are covered by available people or crews.
  const candidates = [
    ...model.crews.filter((item) => item.active && item.availableCrewCount > 0 && availableNow(item.availableFrom)).map((item) => {
      const cover = valuesCoverGroups([item.name, item.workCategory, ...item.roles.flatMap((role) => [role.role, role.skill])], seed.roleGroups);
      return { label: `${item.name}: ${cover.evidence.join(", ")}`, matched: cover.evidence };
    }),
    ...model.labourPools.filter((item) => item.active && item.availableHeadcount > 0 && availableNow(item.availableFrom)).map((item) => {
      const cover = valuesCoverGroups([item.role, ...item.skills], seed.roleGroups);
      return { label: `${item.role}: ${cover.evidence.join(", ")}`, matched: cover.evidence };
    }),
  ].filter((item) => item.matched.length);
  const evidence = [...new Set(candidates.map((item) => item.label))];
  const matchedGroups = new Set(candidates.flatMap((item) => item.matched.map((term) => normalize(term))));
  // Components without a defined role template stay relevant-but-unverified;
  // lack of a template must never turn into a fabricated internal confirmation.
  return { work: scope.work, evidence, confirmed: seed.minimumQualifiedGroups > 0 && matchedGroups.size >= seed.minimumQualifiedGroups };
}

function partnerFit(seed: PackageSeed, partner: CapabilityPartner): { score: number; capability: string } | null {
  if (!partner.active || partner.approvalStatus !== "approved") return null;
  const declaredCapabilities = partner.capabilities ?? [];
  const capabilities = (partner.capabilities ?? []).filter((item) => item.active && item.headcount + item.crewCount > 0 && availableNow(item.availableFrom));
  // A detailed partner profile is stronger evidence than a broad category.
  // If all declared crews are unavailable, do not silently fall back to the
  // category label and present the partner as available.
  if (declaredCapabilities.length > 0 && capabilities.length === 0) return null;
  const terms = capabilities.length ? capabilities.flatMap((item) => [item.name, item.category, ...item.tasks]) : [ ...(partner.categories ?? []), ...(partner.workTypes ?? []) ];
  const codes = capabilities.length ? capabilities.flatMap((item) => item.cpvCodes) : [...(partner.cpvCodes ?? [])];
  const codeHit = codes.some((code) => cpvRelated(seed.cpv, code)); const task = normalize(seed.task);
  const termHit = terms.some((term) => term && (task.includes(normalize(term)) || normalize(term).includes(task)));
  if (!codeHit && !termHit) return null;
  const capability = capabilities.find((item) => item.cpvCodes.some((code) => cpvRelated(seed.cpv, code)) || [item.name, item.category, ...item.tasks].some((term) => term && task.includes(normalize(term))))?.name ?? partner.categories[0] ?? partner.name;
  return { score: (codeHit ? 2 : 0) + (termHit ? 1 : 0), capability };
}

function rentalFit(seed: PackageSeed, partner: CapabilityPartner): { resourceId: string; name: string; amountAll: number | null } | null {
  if (!partner.active || partner.approvalStatus !== "approved" || !["strategic_partner", "equipment_rental"].includes(partner.partnerType)) return null;
  const task = normalize(seed.task); const resource = (partner.resources ?? []).find((item) => item.active && item.resourceType === "equipment" && item.availableQuantity > 0 && item.condition !== "unavailable" && (!item.inspectionExpiry || Date.parse(item.inspectionExpiry) >= Date.now()) && [item.name, item.category, item.capacity].some((value) => value && task.includes(normalize(value))));
  if (!resource) return null;
  const rate = (partner.rates ?? []).find((item) => item.resourceId === resource.id && (!item.validFrom || Date.parse(item.validFrom) <= Date.now()) && (!item.validUntil || Date.parse(item.validUntil) >= Date.now()));
  return { resourceId: resource.id, name: `${resource.name}${resource.model ? ` · ${resource.model}` : ""}`, amountAll: rate?.amountAll ?? null };
}

function allocation(workPackageId: string, source: TenderWorkAllocation["source"], sharePercent: number, partnerId: string | null, resourceId: string | null, companyCapability: string | null, estimatedAmountAll: number | null, rationale: string, dependencyRisk: TenderWorkAllocation["dependencyRisk"], confidence: number): TenderWorkAllocation { return { id: `${workPackageId}-${source}-${partnerId ?? resourceId ?? "company"}`, workPackageId, source, sharePercent, partnerId, resourceId, companyCapability, estimatedAmountAll, status: "suggested", rationale, dependencyRisk, confidence }; }

export function recalculateDeliverySummary(plan: TenderDeliveryPlan): TenderDeliveryPlan {
  const workPackages = plan.workPackages.map((item) => item.verificationStatus === "provisional" && ["bulletin", "document"].includes(item.source) && item.confidence >= 0.7 ? { ...item, verificationStatus: "extracted" as const } : item);
  const packageIds = [...new Set(workPackages.map((item) => item.id))]; const coverage = (sources: TenderWorkAllocation["source"][]) => packageIds.length ? packageIds.reduce((sum, packageId) => sum + plan.allocations.filter((item) => item.workPackageId === packageId && sources.includes(item.source)).reduce((inner, item) => inner + item.sharePercent, 0), 0) / packageIds.length : 0;
  const internalConfirmedCount = workPackages.filter((item) => item.deliveryStatus === "confirmed_internal").length;
  const partnerConfirmedCount = workPackages.filter((item) => item.deliveryStatus === "confirmed_partner").length;
  const unverifiedCount = workPackages.filter((item) => ["relevant_unverified", "unknown"].includes(item.deliveryStatus ?? "unknown")).length;
  return { ...plan, workPackages, summary: { ...plan.summary, internalPercent: Math.round(coverage(["internal", "hybrid"])), partnerPercent: Math.round(coverage(["partner"])), rentalCount: plan.allocations.filter((item) => item.source === "rental").length, uncoveredCount: workPackages.filter((item) => item.deliveryStatus === "uncovered").length, provisionalCount: workPackages.filter((item) => item.verificationStatus === "provisional").length, componentCount: workPackages.length, internalConfirmedCount, partnerConfirmedCount, unverifiedCount } };
}

export function generateDeliveryPlan(tender: TenderNotice, model: CompanyCapabilityModel): TenderDeliveryPlan {
  const seeds = packageSeeds(tender); const allocations: TenderWorkAllocation[] = [];
  const workPackages = seeds.map((seed, index) => {
    const internal = internalFit(seed, model); const partners = model.partners.map((partner) => ({ partner, fit: partnerFit(seed, partner) })).filter((item): item is { partner: CapabilityPartner; fit: { score: number; capability: string } } => Boolean(item.fit)).sort((a, b) => b.fit.score - a.fit.score);
    const partner = partners[0]; const rental = model.partners.map((candidate) => ({ partner: candidate, resource: rentalFit(seed, candidate) })).find((item) => item.resource); const scope = workFit(seed, model);
    let deliveryStatus: DeliveryStatus = "uncovered"; let matchedCapability: string | null = scope?.work.trade ?? null; let resourceEvidence: string[] = internal?.evidence ?? []; const id = `${tender.id}-work-${index + 1}`;
    if (internal?.confirmed) { deliveryStatus = "confirmed_internal"; allocations.push(allocation(id, "internal", 100, null, null, `${internal.work.trade} · ${internal.evidence.join("; ")}`, null, "Specializimi dhe fuqia punëtore e lidhur janë të disponueshme për këtë komponent. Sasia dhe afati i realizimit mbeten për verifikim.", "low", 0.72)); }
    else if (partner) { deliveryStatus = "confirmed_partner"; matchedCapability = partner.partner.name; resourceEvidence = [partner.fit.capability]; const item = allocation(id, "partner", 100, partner.partner.id, null, null, null, `${partner.partner.name} ka kapacitet të aprovuar për ${partner.fit.capability}. Disponueshmëria dhe oferta e partnerit kërkojnë konfirmim.`, partner.partner.dependencyRisk, 0.68); item.partnerName = partner.partner.name; allocations.push(item); }
    else if (internal || scope) { deliveryStatus = "relevant_unverified"; allocations.push(allocation(id, "uncovered", 100, null, null, internal?.work.trade ?? scope?.work.trade ?? null, null, "Kompania ka specializim të lidhur, por nuk u konfirmua kombinimi minimal i personelit ose ekipit për këtë komponent.", "medium", 0.4)); }
    else allocations.push(allocation(id, "uncovered", 100, null, null, null, null, "Nuk u gjet kapacitet i deklaruar ose partner i aprovuar për këtë komponent.", "high", 0.3));
    if (rental?.resource) { const item = allocation(id, "rental", 0, rental.partner.id, rental.resource.resourceId, null, rental.resource.amountAll, `Makineri e mundshme me qira nga ${rental.partner.name}: ${rental.resource.name}.`, rental.partner.dependencyRisk, 0.65); item.partnerName = rental.partner.name; item.resourceName = rental.resource.name; allocations.push(item); }
    return { id, phase: seed.phase, task: seed.task, quantity: null, unit: null, requirements: seed.requirements, source: seed.source, sourcePage: tender.sourcePages.start, evidenceText: tender.contractObject || tender.sourceText.slice(0, 220), confidence: Math.min(seed.confidence, tender.extractionConfidence), verificationStatus: seed.source === "bulletin" && seed.confidence >= 0.7 ? "extracted" as const : "provisional" as const, scopeMatch: scope?.match ?? (partner ? "partner" : seed.cpv ? "unmatched" : "unknown"), deliveryStatus, matchedCapability, resourceEvidence };
  });
  return recalculateDeliverySummary({ tenderId: tender.id, workPackages, allocations, generatedAt: new Date().toISOString(), capabilityVersion: model.activeVersion, capabilityUpdatedAt: model.draftUpdatedAt, plannerVersion: DELIVERY_PLANNER_VERSION, summary: { internalPercent: 0, partnerPercent: 0, rentalCount: 0, uncoveredCount: 0, provisionalCount: 0 } });
}

export function deliveryPlanIsCurrent(plan: TenderDeliveryPlan, model: CompanyCapabilityModel): boolean { return plan.plannerVersion === DELIVERY_PLANNER_VERSION && plan.capabilityVersion === model.activeVersion && plan.capabilityUpdatedAt === model.draftUpdatedAt; }

export function updateAllocation(plan: TenderDeliveryPlan, allocationId: string, patch: Partial<TenderWorkAllocation>): TenderDeliveryPlan | null {
  const index = plan.allocations.findIndex((item) => item.id === allocationId); if (index < 0) return null;
  const next = structuredClone(plan); next.allocations[index] = { ...next.allocations[index], ...patch, status: patch.status ?? "overridden" }; const updated = next.allocations[index];
  if (!Number.isFinite(updated.sharePercent) || updated.sharePercent < 0 || updated.sharePercent > 100) throw new Error("Përqindja duhet të jetë midis 0 dhe 100.");
  if ((updated.source === "partner" || updated.source === "hybrid") && !updated.partnerId) throw new Error("Nuk ka partner të konfirmuar për këtë ndarje.");
  if (updated.source === "rental" && !updated.resourceId) throw new Error("Nuk ka pajisje me qira të konfirmuar për këtë ndarje.");
  const execution = next.allocations.filter((item) => ["internal", "hybrid", "partner", "uncovered"].includes(item.source)); const total = execution.filter((item) => item.workPackageId === next.allocations[index].workPackageId).reduce((sum, item) => sum + item.sharePercent, 0);
  if (Math.abs(total - 100) > 0.001) throw new Error("Përqindja e kësaj detyre duhet të jetë saktësisht 100%.");
  return recalculateDeliverySummary(next);
}
