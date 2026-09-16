import { CONSTRUCTION_CPV_CATALOG, suggestCpvSpecializations } from "./cpv-catalog";
import { normalize } from "./normalize";
import type { CapabilityPartner, CompanyCapabilityModel, TenderDeliveryPlan, TenderNotice, TenderWorkAllocation, TenderWorkPackage } from "./types";

type PackageSeed = { phase: string; task: string; cpv: string; requirements: string[]; confidence: number };

const phaseFor = (label: string) => {
  const value = normalize(label);
  if (/(cati|hidroizolim|ulluq)/.test(value)) return "Çati dhe hidroizolim";
  if (/(fasade|veshje|panel|suvat|lyerje|skeleri)/.test(value)) return "Fasada dhe përfundime";
  if (/(elektr|hidraul|ujesjelles|kanaliz|tubacion)/.test(value)) return "Instalime dhe rrjete";
  if (/(rruge|asfalt|beton|murature|ndertim)/.test(value)) return "Punime civile dhe strukturë";
  if (/(prish|demolim)/.test(value)) return "Përgatitje dhe prishje";
  return "Punime të specializuara";
};

function packageSeeds(tender: TenderNotice): PackageSeed[] {
  const suggestions = suggestCpvSpecializations(`${tender.contractObject} ${tender.cpvCodes.join(" ")}`, 8);
  const fromCodes = CONSTRUCTION_CPV_CATALOG.filter((item) => tender.cpvCodes.some((code) => code.startsWith(item.code) || item.code.startsWith(code.slice(0, 8)))).map((item) => ({ ...item, score: 70, reason: "Kodi CPV i tenderit" }));
  const unique = new Map<string, PackageSeed>();
  for (const item of [...fromCodes, ...suggestions]) {
    const key = item.code;
    if (unique.has(key)) continue;
    unique.set(key, { phase: phaseFor(item.labelAl), task: item.labelAl, cpv: item.code, requirements: [item.labelAl, ...item.examples.slice(0, 2)], confidence: item.score >= 70 ? 0.78 : 0.58 });
  }
  if (!unique.size) unique.set("unknown", { phase: "Analizë e tenderit", task: tender.contractObject || "Objekti duhet verifikuar", cpv: "", requirements: ["Dokumentet e plota të tenderit"], confidence: 0.35 });
  return [...unique.values()].slice(0, 12);
}

const availableNow = (value: string | null | undefined) => !value || !Number.isFinite(Date.parse(value)) || Date.parse(value) <= Date.now();

function internalFit(seed: PackageSeed, model: CompanyCapabilityModel): { name: string; crew: string | null } | null {
  const taskText = normalize(`${seed.task} ${seed.requirements.join(" ")}`);
  const found = model.workCapabilities.find((work) => {
    if (!work.active || work.deliveryMethod === "subcontracted") return false;
    return (seed.cpv && work.cpvPrefixes.some((prefix) => seed.cpv.startsWith(prefix) || prefix.startsWith(seed.cpv.slice(0, 4)))) || [work.trade, ...work.projectTypes, ...work.buildingTypes].some((term) => term && (taskText.includes(normalize(term)) || normalize(term).includes(taskText)));
  });
  if (!found) return null;
  const crew = model.crews.find((item) => item.active && item.availableCrewCount > 0 && availableNow(item.availableFrom) && [item.workCategory, item.name, ...item.roles.flatMap((role) => [role.role, role.skill])].some((term) => term && (taskText.includes(normalize(term)) || normalize(term).includes(taskText))));
  const labour = model.labourPools.find((item) => item.active && item.availableHeadcount > 0 && availableNow(item.availableFrom) && [item.role, ...item.skills].some((term) => term && (taskText.includes(normalize(term)) || normalize(term).includes(taskText))));
  // A declared specialism without a free crew or relevant labour is not yet an
  // executable internal allocation. The matcher may still show it as scope fit.
  return crew || labour ? { name: found.trade, crew: crew?.name ?? null } : null;
}

function partnerFit(seed: PackageSeed, partner: CapabilityPartner): { score: number; capability: string } | null {
  if (!partner.active || partner.approvalStatus !== "approved") return null;
  const taskText = normalize(`${seed.task} ${seed.requirements.join(" ")}`);
  const activeCapabilities = (partner.capabilities ?? []).filter((item) => item.active);
  const codes = [...(partner.cpvCodes ?? []), ...activeCapabilities.flatMap((capability) => capability.cpvCodes)];
  const terms = [ ...(partner.categories ?? []), ...(partner.workTypes ?? []), ...activeCapabilities.flatMap((capability) => [capability.name, capability.category, ...capability.tasks]) ];
  const codeHit = seed.cpv && codes.some((code) => seed.cpv.startsWith(code) || code.startsWith(seed.cpv.slice(0, 4)));
  const termHit = terms.some((term) => term && (taskText.includes(normalize(term)) || normalize(term).includes(taskText)));
  if (!codeHit && !termHit) return null;
  const matchedCapability = activeCapabilities.find((item) => item.headcount > 0 && item.crewCount > 0 && availableNow(item.availableFrom) && (item.cpvCodes.some((code) => seed.cpv && (seed.cpv.startsWith(code) || code.startsWith(seed.cpv.slice(0, 4)))) || [item.name, item.category, ...item.tasks].some((term) => term && (taskText.includes(normalize(term)) || normalize(term).includes(taskText)))));
  // Detailed capability records become the source of truth once configured;
  // a broad legacy category must not bypass an unavailable specialist crew.
  if (activeCapabilities.length > 0 && !matchedCapability) return null;
  const capability = matchedCapability?.name ?? partner.categories[0] ?? "Specializim i regjistruar";
  return { score: (codeHit ? 2 : 0) + (termHit ? 1 : 0) + (partner.approvalStatus === "approved" ? 1 : 0), capability };
}

function rentalFit(seed: PackageSeed, partner: CapabilityPartner): { resourceId: string; name: string; amountAll: number | null } | null {
  if (!partner.active || partner.approvalStatus !== "approved" || !["strategic_partner", "equipment_rental"].includes(partner.partnerType)) return null;
  const text = normalize(`${seed.task} ${seed.requirements.join(" ")}`);
  const resource = (partner.resources ?? []).find((item) => item.active && item.resourceType === "equipment" && item.availableQuantity > 0 && item.condition !== "unavailable" && (!item.inspectionExpiry || Date.parse(item.inspectionExpiry) >= Date.now()) && [item.name, item.category, item.capacity].some((value) => text.includes(normalize(value)) || normalize(value).includes(text)));
  if (!resource) return null;
  const rate = (partner.rates ?? []).find((item) => item.resourceId === resource.id && (!item.validFrom || Date.parse(item.validFrom) <= Date.now()) && (!item.validUntil || Date.parse(item.validUntil) >= Date.now()));
  return { resourceId: resource.id, name: `${resource.name}${resource.model ? ` · ${resource.model}` : ""}`, amountAll: rate?.amountAll ?? null };
}

function allocation(workPackageId: string, source: TenderWorkAllocation["source"], sharePercent: number, partnerId: string | null, resourceId: string | null, companyCapability: string | null, estimatedAmountAll: number | null, rationale: string, dependencyRisk: TenderWorkAllocation["dependencyRisk"], confidence: number): TenderWorkAllocation {
  return { id: `${workPackageId}-${source}-${partnerId ?? resourceId ?? "company"}`, workPackageId, source, sharePercent, partnerId, resourceId, companyCapability, estimatedAmountAll, status: "suggested", rationale, dependencyRisk, confidence };
}

export function recalculateDeliverySummary(plan: TenderDeliveryPlan): TenderDeliveryPlan {
  const packageIds = [...new Set(plan.workPackages.map((item) => item.id))];
  const packageCoverage = (sources: TenderWorkAllocation["source"][]) => packageIds.length ? packageIds.reduce((sum, workPackageId) => sum + plan.allocations.filter((item) => item.workPackageId === workPackageId && sources.includes(item.source)).reduce((packageSum, item) => packageSum + item.sharePercent, 0), 0) / packageIds.length : 0;
  return { ...plan, summary: { ...plan.summary, internalPercent: Math.round(packageCoverage(["internal", "hybrid"])), partnerPercent: Math.round(packageCoverage(["partner"])), rentalCount: plan.allocations.filter((item) => item.source === "rental").length, uncoveredCount: plan.allocations.filter((item) => item.source === "uncovered").length, provisionalCount: plan.workPackages.filter((item) => item.verificationStatus === "provisional").length } };
}

export function generateDeliveryPlan(tender: TenderNotice, model: CompanyCapabilityModel): TenderDeliveryPlan {
  const seeds = packageSeeds(tender);
  const workPackages: TenderWorkPackage[] = seeds.map((seed, index) => ({
    id: `${tender.id}-work-${index + 1}`, phase: seed.phase, task: seed.task, quantity: null, unit: null, requirements: seed.requirements,
    source: seed.confidence >= 0.7 ? "bulletin" : "inference", sourcePage: tender.sourcePages.start, evidenceText: tender.contractObject || tender.sourceText.slice(0, 220), confidence: Math.min(seed.confidence, tender.extractionConfidence), verificationStatus: seed.confidence >= 0.7 ? "extracted" : "provisional"
  }));
  const allocations: TenderWorkAllocation[] = [];
  for (const [index, workPackage] of workPackages.entries()) {
    const seed = seeds[index];
    const internal = internalFit(seed, model);
    const partnerMatches = model.partners.map((partner) => ({ partner, fit: partnerFit(seed, partner) })).filter((item): item is { partner: CapabilityPartner; fit: { score: number; capability: string } } => Boolean(item.fit)).sort((a, b) => b.fit.score - a.fit.score);
    const bestPartner = partnerMatches[0];
    const rental = model.partners.map((partner) => ({ partner, resource: rentalFit(seed, partner) })).find((item) => item.resource);
    if (internal && bestPartner) {
      const hybrid = allocation(workPackage.id, "hybrid", 70, bestPartner.partner.id, null, internal.name, null, `Kompania mbulon pjesën kryesore; ${bestPartner.partner.name} plotëson ${bestPartner.fit.capability}.`, bestPartner.partner.dependencyRisk, 0.74); hybrid.partnerName = bestPartner.partner.name; allocations.push(hybrid);
      const partnerAllocation = allocation(workPackage.id, "partner", 30, bestPartner.partner.id, null, null, null, `Partner i sugjeruar për pjesën specialistike: ${bestPartner.fit.capability}.`, bestPartner.partner.dependencyRisk, 0.74); partnerAllocation.partnerName = bestPartner.partner.name; allocations.push(partnerAllocation);
    } else if (internal) {
      allocations.push(allocation(workPackage.id, "internal", 100, null, null, internal.crew ? `${internal.name} · ${internal.crew}` : internal.name, null, `Përputhet me fushën aktive dhe ${internal.crew ? `ekipi ${internal.crew} është i disponueshëm.` : "një grup pune i disponueshëm e mbulon."}`, "low", 0.8));
    } else if (bestPartner) {
      const partnerAllocation = allocation(workPackage.id, "partner", 100, bestPartner.partner.id, null, null, null, `Nuk u gjet mbulim i brendshëm; ${bestPartner.partner.name} mbulon ${bestPartner.fit.capability}.`, bestPartner.partner.dependencyRisk, 0.72); partnerAllocation.partnerName = bestPartner.partner.name; allocations.push(partnerAllocation);
    } else {
      allocations.push(allocation(workPackage.id, "uncovered", 100, null, null, null, null, "Nuk u gjet kompani ose partner i konfirmuar për këtë detyrë.", "high", 0.35));
    }
    if (rental?.resource) { const rentalAllocation = allocation(workPackage.id, "rental", 0, rental.partner.id, rental.resource.resourceId, null, rental.resource.amountAll, `Makineri me qira nga ${rental.partner.name}: ${rental.resource.name}.`, rental.partner.dependencyRisk, 0.68); rentalAllocation.partnerName = rental.partner.name; rentalAllocation.resourceName = rental.resource.name; allocations.push(rentalAllocation); }
  }
  return recalculateDeliverySummary({ tenderId: tender.id, workPackages, allocations, generatedAt: new Date().toISOString(), capabilityVersion: model.activeVersion, summary: { internalPercent: 0, partnerPercent: 0, rentalCount: 0, uncoveredCount: 0, provisionalCount: 0 } });
}

export function updateAllocation(plan: TenderDeliveryPlan, allocationId: string, patch: Partial<TenderWorkAllocation>): TenderDeliveryPlan | null {
  const index = plan.allocations.findIndex((item) => item.id === allocationId);
  if (index < 0) return null;
  const next = structuredClone(plan); next.allocations[index] = { ...next.allocations[index], ...patch, status: patch.status ?? "overridden" };
  const updated = next.allocations[index];
  if (!Number.isFinite(updated.sharePercent) || updated.sharePercent < 0 || updated.sharePercent > 100) throw new Error("Përqindja duhet të jetë midis 0 dhe 100.");
  if ((updated.source === "partner" || updated.source === "hybrid") && !updated.partnerId) throw new Error("Nuk ka partner të konfirmuar për këtë ndarje.");
  if (updated.source === "rental" && !updated.resourceId) throw new Error("Nuk ka pajisje me qira të konfirmuar për këtë ndarje.");
  const execution = next.allocations.filter((item) => ["internal", "hybrid", "partner", "uncovered"].includes(item.source));
  const total = execution.filter((item) => item.workPackageId === next.allocations[index].workPackageId).reduce((sum, item) => sum + item.sharePercent, 0);
  if (Math.abs(total - 100) > 0.001) throw new Error("Përqindja e kësaj detyre duhet të jetë saktësisht 100%.");
  return recalculateDeliverySummary(next);
}
