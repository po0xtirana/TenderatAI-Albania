import { emptyCapabilityModel } from "./capabilities";
import { normalize } from "./normalize";
import { searchTermsForCpvCodes } from "./cpv-catalog";
import type { CapabilityRequirementMatch, CompanyCapabilityModel, CompanyCapabilityProfile, TenderMatch, TenderNotice } from "./types";

const WORK_TERMS: Record<string, string[]> = {
  ndërtim: ["ndertim", "punime ndertimi", "ndertimi"], rikonstruksion: ["rikonstruksion", "rehabilitim", "rikualifikim", "permiresim"],
  rrugë: ["rruge", "rrugor", "asfalt", "infrastrukture rrugore"], ujësjellës: ["ujesjelles", "ujesjellesi", "furnizim me uje"],
  kanalizime: ["kanalizim", "kanalizimeve", "ujera te ndotura", "impiant trajtimi"], hidroteknikë: ["hidroteknik", "vaditese", "hidrik"],
  shkolla: ["shkolle", "shkollave", "institucion arsimor"], shëndetësi: ["spital", "qender shendetesore", "shendetesor"],
  energji: ["energji", "elektrik", "ndricim", "fotovoltaik"], mirëmbajtje: ["mirembajtje", "sherbim mirembajtje", "riparim"]
};

const REGION_TERMS: Record<string, string[]> = {
  tiranë: ["tirane", "tiranes"], durrës: ["durres", "durresit"], elbasan: ["elbasan", "elbasanit"],
  vlorë: ["vlore", "vlores"], berat: ["berat", "beratit"], shkodër: ["shkoder", "shkodres"],
  korçë: ["korce", "korces"], fier: ["fier", "fierit"], kukës: ["kukes", "kukesit"],
  lezhë: ["lezhe", "lezhes"], dibër: ["diber", "dibres"], gjirokastër: ["gjirokaster", "gjirokastres"]
};

const EQUIPMENT_TERMS = ["eskavator", "kamion", "fadrome", "betoniere", "autobetoniere", "vinç", "vinc", "ngjeshese", "asfalt-shtruese"];
const STAFF_TERMS = ["drejtues teknik", "inxhinier ndertimi", "inxhinier hidroteknik", "inxhinier elektrik", "arkitekt", "topograf", "gjeolog", "specialist sigurie"];

function sourceText(tender: TenderNotice): string {
  return normalize([tender.contractObject, tender.contractingAuthority, tender.address, tender.procedureType, tender.cpvCodes.join(" "), tender.sourceText].filter(Boolean).join(" "));
}

const clamp = (value: number) => Math.max(0, Math.min(100, Math.round(value)));
const matches = (left: string, right: string) => normalize(left).includes(normalize(right)) || normalize(right).includes(normalize(left));

function projectTerms(tender: TenderNotice): string[] {
  const text = sourceText(tender);
  return Object.entries(WORK_TERMS).filter(([, terms]) => terms.some((term) => text.includes(normalize(term)))).map(([key]) => key);
}

function parseRequiredLicences(tender: TenderNotice): string[] {
  const text = normalize(tender.sourceText);
  const direct = text.match(/\b(?:np|ns)-?\s?\d{1,2}(?:-[a-z0-9]+)?\b/g) ?? [];
  return [...new Set(direct.map((value) => value.toUpperCase().replace(/\s/g, "")))].slice(0, 8);
}

function explicitRequirements(text: string, terms: string[]): string[] {
  const requirementContext = /kerkohet|duhet te kete|kapaciteti teknik|kriteret e vecanta|stafi teknik|mjetet dhe pajisjet/.test(text);
  if (!requirementContext) return [];
  return terms.filter((term) => text.includes(normalize(term)));
}

function requirement(type: string, tenderRequirement: string, companyCapability: string | null, result: CapabilityRequirementMatch["result"], tender: TenderNotice, explanation: string, confidence = 0.82): CapabilityRequirementMatch {
  return {
    requirementType: type, tenderRequirement, companyCapability, result,
    tenderEvidence: [{ page: tender.sourcePages.start, text: tenderRequirement, confidence }],
    companyEvidence: companyCapability ? [companyCapability] : [], confidence, explanation
  };
}

export function matchTender(tender: TenderNotice, profile: CompanyCapabilityProfile, suppliedModel?: CompanyCapabilityModel): TenderMatch {
  const model = suppliedModel ?? emptyCapabilityModel(profile);
  const text = sourceText(tender);
  const tenderTerms = projectTerms(tender);
  const activeWork = model.workCapabilities.filter((item) => item.active);
  const configuredTerms = [...new Set([...profile.trades, ...activeWork.map((item) => item.trade)])];
  const termHits = configuredTerms.filter((trade) => (WORK_TERMS[trade] ?? [trade]).some((term) => text.includes(normalize(term))));
  const detailedTermHits = activeWork.filter((work) => {
    const terms = [work.trade, ...work.projectTypes, ...work.buildingTypes, ...searchTermsForCpvCodes(work.cpvPrefixes)];
    return terms.some((term) => normalize(term).length >= 3 && text.includes(normalize(term)));
  });
  const cpvHits = activeWork.filter((work) => work.cpvPrefixes.some((prefix) => tender.cpvCodes.some((code) => code.startsWith(prefix))));
  const activePartners = model.partners.filter((partner) => partner.active && partner.approvalStatus === "approved");
  const pendingPartners = model.partners.filter((partner) => partner.active && partner.approvalStatus !== "approved" && partner.approvalStatus !== "blocked");
  const partnerScopeHits = activePartners.filter((partner) => {
    const partnerTerms = [...(partner.categories ?? []), ...(partner.workTypes ?? []), ...(partner.capabilities ?? []).flatMap((capability) => [capability.name, capability.category, ...capability.tasks])];
    const partnerCodes = [...(partner.cpvCodes ?? []), ...(partner.capabilities ?? []).flatMap((capability) => capability.cpvCodes)];
    return partnerCodes.some((code) => tender.cpvCodes.some((tenderCode) => tenderCode.startsWith(code) || code.startsWith(tenderCode.slice(0, 4)))) || partnerTerms.some((term) => term && text.includes(normalize(term)));
  });
  const pendingPartnerScopeHits = pendingPartners.filter((partner) => {
    const partnerTerms = [...(partner.categories ?? []), ...(partner.workTypes ?? []), ...(partner.capabilities ?? []).flatMap((capability) => [capability.name, capability.category, ...capability.tasks])];
    const partnerCodes = [...(partner.cpvCodes ?? []), ...(partner.capabilities ?? []).flatMap((capability) => capability.cpvCodes)];
    return partnerCodes.some((code) => tender.cpvCodes.some((tenderCode) => tenderCode.startsWith(code) || code.startsWith(tenderCode.slice(0, 4)))) || partnerTerms.some((term) => term && text.includes(normalize(term)));
  });
  const scope = termHits.length || detailedTermHits.length || cpvHits.length || partnerScopeHits.length ? 20 : 3;

  const requirementMatches: CapabilityRequirementMatch[] = [];
  const confirmedCapabilities: string[] = [];
  const capabilityGaps: string[] = [];
  const staleInformation: string[] = [];
  const blockers: string[] = [];
  const missingInformation: string[] = [];
  if (tender.lifecycleStatus === "cancelled") blockers.push("Procedura është anuluar dhe nuk është mundësi aktive.");
  if (tender.lifecycleStatus === "correction") blockers.push("Ky është njoftim korrigjimi; duhet lidhur me procedurën kryesore para vlerësimit.");
  if (pendingPartnerScopeHits.length) missingInformation.push(`Partnerët ${pendingPartnerScopeHits.map((partner) => partner.name).join(", ")} mund të ndihmojnë, por duhet të aprovohen para se kapaciteti i tyre të numërohet.`);

  if (termHits.length || detailedTermHits.length || cpvHits.length || partnerScopeHits.length) confirmedCapabilities.push(`Fusha e punës: ${termHits.join(", ") || detailedTermHits.map((item) => item.trade).join(", ") || cpvHits.map((item) => item.trade).join(", ") || "mbulim nga partnerët"}`);
  else capabilityGaps.push("Nuk u gjet përputhje e fortë me fushat e deklaruara.");

  const requiredLicences = parseRequiredLicences(tender);
  const validLicences = model.complianceRecords.filter((item) => item.active && item.recordType === "licence" && item.status === "valid" && (!item.expiryDate || Date.parse(item.expiryDate) >= Date.now()));
  const missingLicences = requiredLicences.filter((required) => !validLicences.some((item) => [item.name, item.category, item.subcategory].some((value) => value && matches(value, required))));
  for (const licence of requiredLicences) {
    const found = validLicences.find((item) => [item.name, item.category, item.subcategory].some((value) => value && matches(value, licence)));
    requirementMatches.push(requirement("licence", licence, found?.name ?? null, found ? "confirmed" : "missing", tender, found ? "Licenca u gjet në profilin aktiv të kompanisë." : "Licenca nuk u gjet në profilin aktiv."));
  }
  const compliance = requiredLicences.length ? (missingLicences.length ? 0 : 15) : validLicences.length ? 9 : 3;
  if (requiredLicences.length && !missingLicences.length) confirmedCapabilities.push(`Licencat e kërkuara: ${requiredLicences.join(", ")}`);
  if (missingLicences.length) {
    const message = `Mungojnë licencat: ${missingLicences.join(", ")}`;
    capabilityGaps.push(message);
    if (tender.extractionConfidence >= 0.8) blockers.push(message);
  }
  if (!requiredLicences.length) missingInformation.push("Licencat e detajuara duhet verifikuar në dokumentet e tenderit.");

  const completedProjects = model.referenceProjects.filter((item) => item.active && item.status === "completed");
  const similarProjects = completedProjects.filter((project) => project.cpvCodes.some((prefix) => tender.cpvCodes.some((code) => code.startsWith(prefix) || prefix.startsWith(code.slice(0, 4)))) || project.workTypes.some((type) => tenderTerms.some((term) => matches(type, term))));
  const experience = similarProjects.length >= 2 ? 15 : similarProjects.length === 1 ? 12 : completedProjects.length ? 5 : 2;
  if (similarProjects.length) confirmedCapabilities.push(`${similarProjects.length} projekt${similarProjects.length === 1 ? "" : "e"} reference të ngjashme.`);
  else missingInformation.push("Nuk u gjet eksperiencë reference e krahasueshme sipas CPV/fushës.");

  const requiredStaff = explicitRequirements(text, STAFF_TERMS);
  const availablePeople = model.keyPeople.filter((person) => person.active && person.availabilityPercent > 0);
  const availableLabour = model.labourPools.filter((pool) => pool.active).reduce((sum, pool) => sum + pool.availableHeadcount, 0);
  const partnerCovers = (term: string) => activePartners.some((partner) => [...(partner.categories ?? []), ...(partner.workTypes ?? []), ...(partner.capabilities ?? []).flatMap((capability) => [capability.name, capability.category, ...capability.tasks])].some((value) => value && matches(value, term)));
  const missingStaff = requiredStaff.filter((role) => !availablePeople.some((person) => matches(person.role, role) || matches(person.discipline, role) || person.skills.some((skill) => matches(skill, role))) && !partnerCovers(role));
  for (const role of requiredStaff) {
    const found = availablePeople.find((person) => matches(person.role, role) || matches(person.discipline, role) || person.skills.some((skill) => matches(skill, role)));
    const partner = !found ? activePartners.find((candidate) => partnerCovers(role) && [...(candidate.categories ?? []), ...(candidate.capabilities ?? []).flatMap((capability) => [capability.name, ...capability.tasks])].some((value) => value && matches(value, role))) : null;
    requirementMatches.push(requirement("personnel", role, found?.fullName ?? partner?.name ?? null, found || partner ? "confirmed" : "missing", tender, found ? `${found.fullName} mbulon këtë kërkesë.` : partner ? `${partner.name} mund ta mbulojë përmes nënkontraktimit.` : "Profili nuk ka një profesionist ose partner të disponueshëm për këtë kërkesë."));
  }
  const people = missingStaff.length ? 2 : requiredStaff.length ? 15 : availablePeople.length && availableLabour ? 10 : availableLabour ? 7 : 2;
  if (missingStaff.length) capabilityGaps.push(`Personel teknik për verifikim: ${missingStaff.join(", ")}`);
  else if (availablePeople.length || availableLabour) confirmedCapabilities.push(`${availablePeople.length} profesionistë kyç dhe ${availableLabour} punonjës të disponueshëm.`);
  if (!requiredStaff.length) missingInformation.push("Kërkesat e hollësishme për stafin nuk janë në njoftimin përmbledhës.");

  const requiredEquipment = explicitRequirements(text, EQUIPMENT_TERMS);
  const availableEquipment = model.equipment.filter((item) => item.active && item.availableQuantity > 0 && item.condition !== "unavailable");
  const partnerEquipment = (name: string) => activePartners.find((partner) => (partner.resources ?? []).some((resource) => resource.active && resource.availableQuantity > 0 && (matches(resource.name, name) || matches(resource.category, name))) || partner.categories.some((category) => matches(category, name)));
  const missingEquipment = requiredEquipment.filter((name) => !availableEquipment.some((item) => matches(item.name, name) || matches(item.category, name)) && !partnerEquipment(name));
  for (const name of requiredEquipment) {
    const found = availableEquipment.find((item) => matches(item.name, name) || matches(item.category, name));
    const partner = !found ? partnerEquipment(name) : null;
    requirementMatches.push(requirement("equipment", name, found ? `${found.name} (${found.availableQuantity} të lira)` : partner?.name ?? null, found || partner ? "confirmed" : "missing", tender, found ? "Pajisja është e regjistruar dhe e disponueshme." : partner ? `${partner.name} mund ta sigurojë pajisjen me qira ose si kapacitet partneri.` : "Pajisja nuk është e disponueshme në profil."));
  }
  const equipment = missingEquipment.length ? 1 : requiredEquipment.length ? 10 : availableEquipment.length ? 7 : 2;
  if (missingEquipment.length) capabilityGaps.push(`Pajisje për verifikim: ${missingEquipment.join(", ")}`);
  else if (availableEquipment.length) confirmedCapabilities.push(`${availableEquipment.length} lloje pajisjesh/automjetesh të disponueshme.`);
  if (!requiredEquipment.length) missingInformation.push("Lista e detajuar e makinerive duhet verifikuar në dokumentet e tenderit.");

  const value = tender.limitFundAll;
  const profileMin = Math.min(...activeWork.map((item) => item.minProjectValueAll ?? Number.POSITIVE_INFINITY));
  const minimum = Number.isFinite(profileMin) ? profileMin : profile.minValueAll;
  const maximum = model.financialCapacity.maxContractValueAll ?? profile.maxValueAll;
  const valueInRange = value == null || ((minimum == null || value >= minimum) && (maximum == null || value <= maximum));
  const financial = value == null ? 4 : valueInRange && maximum != null ? 10 : valueInRange ? 6 : 0;
  if (value == null) missingInformation.push("Fondi limit nuk u gjet qartë.");
  else if (valueInRange) confirmedCapabilities.push("Fondi limit është brenda kapacitetit të kontratës.");
  else {
    const message = "Fondi limit është jashtë kapacitetit financiar të deklaruar.";
    blockers.push(message); capabilityGaps.push(message);
  }

  const serviceAreas = model.serviceAreas.filter((item) => item.active);
  const regionHit = serviceAreas.find((area) => (REGION_TERMS[area.region] ?? [area.region]).some((region) => text.includes(normalize(region))) || area.municipalities.some((municipality) => text.includes(normalize(municipality))));
  const geography = serviceAreas.length === 0 ? 2 : regionHit ? 5 : 2;
  if (regionHit) confirmedCapabilities.push(`Zona e shërbimit: ${regionHit.region}.`);
  else missingInformation.push("Lokacioni ose mobilizimi kërkon verifikim.");

  const deadlineMs = tender.submissionDeadline ? Date.parse(tender.submissionDeadline) - Date.now() : null;
  const leadDays = deadlineMs == null ? null : Math.ceil(deadlineMs / 86_400_000);
  const minLead = model.bidPreferences.minimumLeadDays ?? 0;
  const activeCommitments = model.commitments.filter((item) => item.active && (!item.endDate || Date.parse(item.endDate) >= Date.now()));
  const maxConcurrent = model.bidPreferences.maxConcurrentProjects;
  const capacityFull = maxConcurrent != null && activeCommitments.length >= maxConcurrent;
  const schedule = deadlineMs == null ? 2 : deadlineMs <= 0 ? 0 : (leadDays ?? 0) < minLead ? 1 : capacityFull ? 2 : 5;
  if (deadlineMs != null && deadlineMs <= 0) blockers.push("Afati i dorëzimit ka kaluar.");
  else if (leadDays != null && leadDays < minLead) capabilityGaps.push(`Mbeten ${leadDays} ditë; rregulli i kompanisë kërkon ${minLead}.`);
  if (capacityFull) capabilityGaps.push("Angazhimet aktive kanë arritur kufirin e projekteve të njëkohshme.");

  const excluded = [...profile.excludedTerms, ...model.bidPreferences.excludedProjectTypes].find((term) => term.trim() && text.includes(normalize(term)));
  const excludedAuthority = model.bidPreferences.excludedAuthorities.find((authority) => text.includes(normalize(authority)));
  const preferredAuthority = model.bidPreferences.preferredAuthorities.find((authority) => text.includes(normalize(authority)));
  const preference = excluded || excludedAuthority ? 0 : preferredAuthority ? 5 : 2;
  if (excluded) blockers.push(`Punë e përjashtuar: ${excluded}`);
  if (excludedAuthority) blockers.push(`Autoritet i përjashtuar: ${excludedAuthority}`);
  if (preferredAuthority) confirmedCapabilities.push(`Autoritet i preferuar: ${preferredAuthority}.`);

  const lastPeopleUpdate = Math.min(...model.labourPools.filter((item) => item.active).map((item) => Date.parse(item.updatedAt)));
  const lastEquipmentUpdate = Math.min(...model.equipment.filter((item) => item.active).map((item) => Date.parse(item.updatedAt)));
  if (Number.isFinite(lastPeopleUpdate) && Date.now() - lastPeopleUpdate > 30 * 86_400_000) staleInformation.push("Disponueshmëria e personelit është më e vjetër se 30 ditë.");
  if (Number.isFinite(lastEquipmentUpdate) && Date.now() - lastEquipmentUpdate > 30 * 86_400_000) staleInformation.push("Disponueshmëria e pajisjeve është më e vjetër se 30 ditë.");

  const components = { scope, compliance, experience, people, equipment, financial, geography, schedule, preference };
  let score = clamp(Object.values(components).reduce((sum, component) => sum + component, 0));
  const hardBlocked = blockers.some((blocker) => blocker.includes("përjashtuar") || blocker.includes("ka kaluar") || blocker.includes("kapacitetit financiar") || blocker.includes("Mungojnë licencat") || blocker.includes("është anuluar") || blocker.includes("njoftim korrigjimi"));
  if (hardBlocked) score = 0;
  const detailedCriteriaMentioned = /kriteret e vecanta|kapaciteti teknik|duhet te kete/.test(text);
  let decision: TenderMatch["decision"] = hardBlocked ? "blocked" : score >= 80 ? "high_fit" : score >= 65 ? "good_fit" : score >= 45 ? "review" : "low_fit";
  if (detailedCriteriaMentioned && !requiredLicences.length && !requiredStaff.length && !requiredEquipment.length && !hardBlocked) decision = "review";

  const reasons = [
    termHits.length || detailedTermHits.length || cpvHits.length ? `Përputhet me ${termHits.join(", ") || detailedTermHits.map((item) => item.trade).join(", ") || "kodet CPV"}.` : partnerScopeHits.length ? `Mbulimi konfirmohet nga partnerët: ${partnerScopeHits.map((partner) => partner.name).join(", ")}.` : "Nuk u gjet përputhje e fortë me specializimet.",
    similarProjects.length ? `Ka ${similarProjects.length} eksperienca të ngjashme të regjistruara.` : "Eksperienca e ngjashme duhet verifikuar.",
    regionHit ? `Kompania operon në ${regionHit.region}.` : "Gjeografia dhe mobilizimi kërkojnë verifikim.",
    value == null ? "Fondi limit nuk është i qartë." : valueInRange ? "Vlera është brenda kapacitetit financiar." : "Vlera është jashtë kapacitetit financiar.",
    requiredLicences.length || requiredStaff.length || requiredEquipment.length ? "Kërkesat e identifikuara u krahasuan me profilin aktiv." : "Kriteret e detajuara të kualifikimit nuk janë në buletinin përmbledhës."
  ];

  return {
    tenderId: tender.id, score, decision, components, blockers, reasons,
    matchedTerms: tenderTerms.length ? tenderTerms : cpvHits.length ? ["përputhje sipas CPV"] : partnerScopeHits.map((partner) => `partner: ${partner.name}`),
    missingInformation, confirmedCapabilities, capabilityGaps, staleInformation, requirementMatches,
    capabilityVersion: model.activeVersion, updatedAt: new Date().toISOString()
  };
}

export function decisionLabel(decision: TenderMatch["decision"]): string {
  return ({ high_fit: "Përshtatje shumë e lartë", good_fit: "Përshtatje e mirë", review: "Për rishikim", low_fit: "Përshtatje e dobët", blocked: "I bllokuar" })[decision];
}
