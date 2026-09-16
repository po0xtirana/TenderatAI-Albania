import type {
  CapabilityReadiness,
  CapabilitySectionKey,
  CapabilitySnapshot,
  CompanyCapabilityModel,
  CompanyCapabilityProfile,
  ReadinessItem
} from "./types";

const now = () => new Date().toISOString();
const dateAfter = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const id = (prefix: string, value: number | string) => `${prefix}-${value}`;

export function emptyCapabilityModel(profile?: CompanyCapabilityProfile): CompanyCapabilityModel {
  const timestamp = now();
  return {
    identity: {
      legalName: profile?.companyName ?? "", tradingName: "", nipt: "", entityType: "sh.p.k.",
      registeredAddress: "", phone: "", email: "", website: "", yearFounded: null,
      procurementRegistered: false, description: ""
    },
    operatingLocations: [],
    workCapabilities: (profile?.trades ?? []).map((trade, index) => ({
      id: id("work", index), trade, cpvPrefixes: profile?.cpvPrefixes ?? [], projectTypes: [], buildingTypes: [],
      deliveryMethod: "self_performed", minProjectValueAll: profile?.minValueAll ?? null,
      preferredProjectValueAll: null, maxProjectValueAll: profile?.maxValueAll ?? null,
      excludedWork: profile?.excludedTerms ?? [], active: true
    })),
    serviceAreas: (profile?.serviceRegions ?? []).map((region, index) => ({
      id: id("area", index), region, municipalities: [], travelRadiusKm: null, mobilizationDays: null,
      remoteLimitations: "", temporarySiteCapable: false, active: true
    })),
    complianceRecords: (profile?.licences ?? []).map((name, index) => ({
      id: id("licence", index), recordType: "licence", name, category: name, subcategory: "", level: "",
      issuer: "", referenceNumber: "", issueDate: null, expiryDate: null, status: "valid", documentIds: [], active: true
    })),
    keyPeople: [],
    labourPools: profile?.availableEmployees ? [{
      id: "pool-general", role: "Punonjës ndërtimi", skills: profile.trades, skillLevel: "qualified",
      headcount: profile.availableEmployees, availableHeadcount: profile.availableEmployees,
      availableFrom: null, updatedAt: timestamp, active: true
    }] : [],
    crews: [],
    equipment: (profile?.availableEquipment ?? []).map((name, index) => ({
      id: id("equipment", index), resourceType: "equipment", name, category: "Pajisje pune", ownership: "owned",
      model: "", quantity: 1, availableQuantity: 1, capacity: "", location: "", availableFrom: null,
      condition: "good", inspectionExpiry: null, limitations: "", rentalFallback: false, updatedAt: timestamp, active: true
    })),
    financialCapacity: {
      turnoverHistory: [], workingCapitalAll: null, creditFacilitiesAll: null, availableProjectFinancingAll: null,
      maxContractValueAll: profile?.maxValueAll ?? null, currentBacklogAll: null, maxConcurrentCommitmentAll: null,
      bidSecurityLimitAll: null, performanceGuaranteeLimitAll: null, insuranceLimitAll: null, bondingLimitAll: null,
      updatedAt: timestamp
    },
    referenceProjects: [],
    partners: [],
    commitments: [],
    bidPreferences: {
      preferredAuthorities: profile?.preferredAuthorities ?? [], excludedAuthorities: [], preferredProjectTypes: [],
      excludedProjectTypes: profile?.excludedTerms ?? [], minimumLeadDays: 7, maxContractMonths: null,
      maxConcurrentProjects: profile?.maxConcurrentProjects ?? null, acceptedPaymentDays: null,
      requiresAdvancePayment: false, maxLiquidatedDamagesPercent: null, jointVentureAllowed: false, rules: []
    },
    status: "draft", activeVersion: 0, draftUpdatedAt: timestamp, documents: []
  };
}

export function demoCapabilityModel(profile: CompanyCapabilityProfile): CompanyCapabilityModel {
  const model = emptyCapabilityModel(profile);
  const timestamp = now();
  return {
    ...model,
    identity: {
      legalName: profile.companyName, tradingName: "Alba Construct", nipt: "L82415012A", entityType: "sh.p.k.",
      registeredAddress: "Rruga e Kavajës, Tiranë", phone: "+355 69 200 0000", email: "tendera@albaconstruct.al",
      website: "https://albaconstruct.al", yearFounded: 2014, procurementRegistered: true,
      description: "Kontraktor shqiptar për infrastrukturë, rikonstruksione, ujësjellës dhe punime hidroteknike."
    },
    operatingLocations: [
      { id: "location-tirane", name: "Zyra dhe baza qendrore", address: "Rruga e Kavajës", city: "Tiranë", region: "Tiranë", isPrimary: true, active: true },
      { id: "location-vlore", name: "Bazë operative jug", address: "Zona Industriale", city: "Vlorë", region: "Vlorë", isPrimary: false, active: true }
    ],
    workCapabilities: model.workCapabilities.map((item) => ({
      ...item, projectTypes: ["Punë publike", "Infrastrukturë"], buildingTypes: ["Objekte publike", "Infrastrukturë civile"],
      preferredProjectValueAll: 80_000_000
    })),
    serviceAreas: model.serviceAreas.map((item) => ({ ...item, travelRadiusKm: 180, mobilizationDays: 5, temporarySiteCapable: true })),
    complianceRecords: [
      ...model.complianceRecords.map((item, index) => ({ ...item, issuer: "Ministria e Infrastrukturës dhe Energjisë", referenceNumber: `AL-${1200 + index}`, issueDate: "2024-01-15", expiryDate: dateAfter(410), status: "valid" as const })),
      { id: "compliance-iso", recordType: "certification", name: "ISO 9001", category: "Menaxhim cilësie", subcategory: "", level: "", issuer: "Bureau Veritas", referenceNumber: "ISO-9001-AC", issueDate: "2025-03-01", expiryDate: dateAfter(190), status: "valid", documentIds: [], active: true },
      { id: "compliance-insurance", recordType: "insurance", name: "Sigurim përgjegjësie profesionale", category: "Sigurim", subcategory: "", level: "", issuer: "SIGAL", referenceNumber: "POL-2026-442", issueDate: "2026-01-01", expiryDate: dateAfter(95), status: "valid", documentIds: [], active: true },
      { id: "compliance-tax", recordType: "compliance", name: "Detyrime tatimore dhe sigurime shoqërore", category: "Pajtueshmëri", subcategory: "", level: "", issuer: "Drejtoria e Tatimeve", referenceNumber: "VRT-2026-08", issueDate: "2026-08-01", expiryDate: dateAfter(65), status: "valid", documentIds: [], active: true }
    ],
    keyPeople: [
      { id: "person-arben", fullName: "Arben Kola", role: "Drejtues teknik", discipline: "Inxhinieri ndërtimi", skills: ["drejtim kantieri", "beton", "infrastrukturë"], yearsExperience: 16, education: "MSc Inxhinieri Ndërtimi", licences: ["Drejtues teknik"], certifications: ["Siguri në kantier"], availableFrom: null, availabilityPercent: 60, documentIds: [], active: true },
      { id: "person-elira", fullName: "Elira Hoxha", role: "Inxhiniere hidroteknike", discipline: "Hidroteknikë", skills: ["ujësjellës", "kanalizime", "impiant trajtimi"], yearsExperience: 11, education: "MSc Inxhinieri Hidroteknike", licences: ["Inxhiniere zbatimi"], certifications: ["ISO 45001 awareness"], availableFrom: null, availabilityPercent: 80, documentIds: [], active: true }
    ],
    labourPools: [
      { id: "pool-skilled", role: "Punëtorë të kualifikuar", skills: ["beton", "muraturë", "tubacione"], skillLevel: "qualified", headcount: 14, availableHeadcount: 8, availableFrom: null, updatedAt: timestamp, active: true },
      { id: "pool-operators", role: "Operatorë makinerish", skills: ["eskavator", "ngjeshje", "kamion"], skillLevel: "specialist", headcount: 5, availableHeadcount: 3, availableFrom: null, updatedAt: timestamp, active: true },
      { id: "pool-general", role: "Punëtorë ndihmës", skills: ["kantier", "ngarkim", "siguri"], skillLevel: "entry", headcount: 8, availableHeadcount: 5, availableFrom: null, updatedAt: timestamp, active: true }
    ],
    crews: [
      { id: "crew-water", name: "Ekipi i rrjeteve ujore", workCategory: "ujësjellës", roles: [{ id: "cr1", role: "Përgjegjës ekipi", skill: "tubacione", headcount: 1 }, { id: "cr2", role: "Montues", skill: "ujësjellës", headcount: 4 }, { id: "cr3", role: "Operator", skill: "eskavator", headcount: 1 }], availableCrewCount: 1, currentAssignment: "", availableFrom: null, maxShiftHours: 10, maxConcurrentProjects: 1, productionCapacity: "120–180 m tubacion/ditë sipas terrenit", active: true },
      { id: "crew-civil", name: "Ekipi civil dhe rikonstruksion", workCategory: "rikonstruksion", roles: [{ id: "cr4", role: "Përgjegjës ekipi", skill: "drejtim kantieri", headcount: 1 }, { id: "cr5", role: "Murator", skill: "muraturë", headcount: 4 }, { id: "cr6", role: "Punëtor ndihmës", skill: "kantier", headcount: 3 }], availableCrewCount: 1, currentAssignment: "Rehabilitim shkolle", availableFrom: dateAfter(18), maxShiftHours: 9, maxConcurrentProjects: 1, productionCapacity: "1 front pune aktiv", active: true }
    ],
    equipment: model.equipment.map((item, index) => ({ ...item, model: ["CAT 320", "Mercedes Actros", "IMER 350", "Bomag BW120"][index] ?? "", quantity: index === 1 ? 3 : 1, availableQuantity: index === 1 ? 2 : 1, capacity: index === 0 ? "20 ton" : index === 1 ? "18 m³" : "", location: index % 2 ? "Vlorë" : "Tiranë", inspectionExpiry: dateAfter(150 + index * 20), rentalFallback: true })),
    financialCapacity: {
      turnoverHistory: [{ id: "turnover-2025", year: 2025, amountAll: 410_000_000 }, { id: "turnover-2024", year: 2024, amountAll: 365_000_000 }, { id: "turnover-2023", year: 2023, amountAll: 302_000_000 }],
      workingCapitalAll: 85_000_000, creditFacilitiesAll: 120_000_000, availableProjectFinancingAll: 95_000_000,
      maxContractValueAll: 600_000_000, currentBacklogAll: 138_000_000, maxConcurrentCommitmentAll: 750_000_000,
      bidSecurityLimitAll: 30_000_000, performanceGuaranteeLimitAll: 75_000_000,
      insuranceLimitAll: 500_000_000, bondingLimitAll: 110_000_000, updatedAt: timestamp
    },
    referenceProjects: [
      { id: "project-water", title: "Rikonstruksion rrjeti ujësjellësi", client: "Ujësjellës Kanalizime", authority: "Bashkia Tiranë", cpvCodes: ["45232150"], workTypes: ["ujësjellës", "gërmime", "rikthim rruge"], valueAll: 186_000_000, region: "Tiranë", startDate: "2024-02-01", endDate: "2025-04-30", role: "main_contractor", status: "completed", outcome: "Përfunduar brenda afatit dhe pa penalitete", referenceContact: "Drejtoria teknike", documentIds: [], active: true },
      { id: "project-school", title: "Rikonstruksion i shkollës 9-vjeçare", client: "Bashkia Durrës", authority: "Bashkia Durrës", cpvCodes: ["45454000"], workTypes: ["rikonstruksion", "instalime", "punime civile"], valueAll: 72_000_000, region: "Durrës", startDate: "2023-05-01", endDate: "2024-01-20", role: "main_contractor", status: "completed", outcome: "Marrje në dorëzim pa rezerva", referenceContact: "Njësia e prokurimit", documentIds: [], active: true }
    ],
    partners: [
      { id: "partner-electrical", name: "Elektro Partner sh.p.k.", partnerType: "subcontractor", categories: ["instalime elektrike"], licences: ["NS-14"], regions: ["Tiranë", "Durrës"], availability: "Njoftim 10 ditë", dependencyRisk: "low", jointVentureReady: false, active: true, approvalStatus: "approved", nipt: "K12345678A", cpvCodes: ["45310000"], capabilities: [{ id: "partner-electrical-cap", name: "Instalime elektrike", category: "Elektrike", cpvCodes: ["45310000"], tasks: ["kabllime", "ndriçim", "panele elektrike"], deliveryMode: "execution", headcount: 6, crewCount: 1, availableFrom: null, capacityNotes: "Një ekip aktiv për objekte publike", active: true }], rates: [{ id: "partner-electrical-rate", scope: "instalime elektrike", unit: "unit", amountAll: 1500000, vatIncluded: false, minimumCommitment: null, validFrom: "2026-01-01", validUntil: null, notes: "Tarifë orientuese" }], performance: { completedProjects: 12, onTimeRate: 92, qualityRating: 4.5, lastUsedAt: "2026-06-15", notes: "Partner i përdorur në projekte publike" } },
      { id: "partner-lab", name: "GeoLab Albania", partnerType: "strategic_partner", categories: ["testime laboratorike", "gjeoteknikë"], licences: ["Laborator i akredituar"], regions: ["Shqipëri"], availability: "Sipas porosisë", dependencyRisk: "medium", jointVentureReady: true, active: true, approvalStatus: "approved", cpvCodes: ["71630000"], capabilities: [{ id: "partner-lab-cap", name: "Testime laboratorike", category: "Kontroll cilësie", cpvCodes: ["71630000"], tasks: ["prova betoni", "testime materiali"], deliveryMode: "specialist", headcount: 4, crewCount: 1, availableFrom: null, capacityNotes: "Raport brenda 5 ditësh", active: true }], performance: { completedProjects: 18, onTimeRate: 96, qualityRating: 4.8, lastUsedAt: "2026-07-02", notes: "Dokumentacion i rregullt" } },
      { id: "partner-rental", name: "Alba Makineri Rent", partnerType: "equipment_rental", categories: ["makineri gërmimi", "transport"], licences: [], regions: ["Tiranë", "Durrës", "Vlorë"], availability: "Rezervim 3 ditë", dependencyRisk: "medium", jointVentureReady: false, active: true, approvalStatus: "approved", capabilities: [{ id: "partner-rental-cap", name: "Makineri kantieri", category: "Qira pajisjesh", cpvCodes: [], tasks: ["gërmime", "ngjeshje", "transport"], deliveryMode: "specialist", headcount: 0, crewCount: 0, availableFrom: null, capacityNotes: "Faturim ditor", active: true }], resources: [{ id: "rental-excavator", resourceType: "equipment", name: "Ekskavator", model: "CAT 320", category: "makineri gërmimi", quantity: 2, availableQuantity: 1, capacity: "20 ton", location: "Tiranë", availableFrom: null, operatorIncluded: true, fuelIncluded: false, transportIncluded: false, rentalMinimumDays: 3, condition: "good", inspectionExpiry: "2027-03-01", active: true }], rates: [{ id: "rental-excavator-rate", scope: "Ekskavator CAT 320", resourceId: "rental-excavator", unit: "day", amountAll: 65000, vatIncluded: false, minimumCommitment: 3, validFrom: "2026-01-01", validUntil: null, notes: "Operatori i përfshirë; karburanti veç" }] }
    ],
    commitments: [
      { id: "commitment-school", projectName: "Rehabilitim shkolle", workType: "rikonstruksion", startDate: "2026-06-10", endDate: dateAfter(18), committedPeople: 8, committedCrews: 1, committedEquipment: ["kamion"], active: true },
      { id: "commitment-road", projectName: "Sistemim rruge lokale", workType: "rrugë", startDate: "2026-07-15", endDate: dateAfter(45), committedPeople: 5, committedCrews: 1, committedEquipment: ["makineri ngjeshëse"], active: true }
    ],
    bidPreferences: {
      preferredAuthorities: profile.preferredAuthorities, excludedAuthorities: [], preferredProjectTypes: ["Infrastrukturë publike", "Rikonstruksion"],
      excludedProjectTypes: profile.excludedTerms, minimumLeadDays: 7, maxContractMonths: 30,
      maxConcurrentProjects: profile.maxConcurrentProjects, acceptedPaymentDays: 60, requiresAdvancePayment: false,
      maxLiquidatedDamagesPercent: 10, jointVentureAllowed: true,
      rules: [{ id: "rule-deadline", name: "Kohë minimale për ofertën", condition: "Të ketë të paktën 7 ditë për përgatitje", severity: "warning", active: true }, { id: "rule-excluded", name: "Punë jashtë profilit", condition: "Mos ndiq pastrim ose mobilim urban si objekt kryesor", severity: "blocker", active: true }]
    },
    status: "active", activeVersion: 1, draftUpdatedAt: timestamp
  };
}

export function capabilitySnapshot(model: CompanyCapabilityModel): CapabilitySnapshot {
  const { documents: _documents, status: _status, activeVersion: _activeVersion, draftUpdatedAt: _draftUpdatedAt, ...snapshot } = model;
  return structuredClone(snapshot);
}

export function capabilityToLegacy(model: CompanyCapabilityModel): CompanyCapabilityProfile {
  const activeWork = model.workCapabilities.filter((item) => item.active);
  const pools = model.labourPools.filter((item) => item.active);
  const availablePeople = pools.reduce((total, item) => total + item.availableHeadcount, 0) + model.keyPeople.filter((item) => item.active && item.availabilityPercent > 0).length;
  return {
    companyName: model.identity.legalName || model.identity.tradingName,
    trades: [...new Set(activeWork.map((item) => item.trade).filter(Boolean))],
    cpvPrefixes: [...new Set(activeWork.flatMap((item) => item.cpvPrefixes).filter(Boolean))],
    serviceRegions: [...new Set(model.serviceAreas.filter((item) => item.active).map((item) => item.region).filter(Boolean))],
    minValueAll: activeWork.map((item) => item.minProjectValueAll).filter((value): value is number => value != null).sort((a, b) => a - b)[0] ?? null,
    maxValueAll: Math.max(0, ...activeWork.map((item) => item.maxProjectValueAll ?? 0)) || model.financialCapacity.maxContractValueAll,
    licences: model.complianceRecords.filter((item) => item.active && item.recordType === "licence" && item.status !== "expired").map((item) => item.category || item.name),
    preferredAuthorities: model.bidPreferences.preferredAuthorities,
    excludedTerms: [...new Set([...activeWork.flatMap((item) => item.excludedWork), ...model.bidPreferences.excludedProjectTypes])],
    availableEmployees: availablePeople || null,
    availableEquipment: model.equipment.filter((item) => item.active && item.availableQuantity > 0).map((item) => item.name),
    maxConcurrentProjects: model.bidPreferences.maxConcurrentProjects,
    currentProjects: model.commitments.filter((item) => item.active).length
  };
}

function item(section: CapabilitySectionKey, code: string, message: string, action: string): ReadinessItem {
  return { section, code, message, action };
}

function freshnessDays(value: string): number {
  const parsed = Date.parse(value);
  return Number.isFinite(parsed) ? (Date.now() - parsed) / 86_400_000 : Number.POSITIVE_INFINITY;
}

export function calculateReadiness(model: CompanyCapabilityModel): CapabilityReadiness {
  const scores = {} as Record<CapabilitySectionKey, number>;
  const blockingItems: ReadinessItem[] = [];
  const warningItems: ReadinessItem[] = [];
  const expiredItems: ReadinessItem[] = [];
  const staleItems: ReadinessItem[] = [];
  const validCompliance = model.complianceRecords.filter((record) => record.active && record.status === "valid");
  const activeWork = model.workCapabilities.filter((record) => record.active);

  scores.identity = Math.round(([model.identity.legalName, model.identity.nipt, model.identity.registeredAddress, model.identity.email].filter(Boolean).length / 4) * 100);
  if (!model.identity.legalName) blockingItems.push(item("identity", "legal_name", "Mungon emri ligjor i kompanisë.", "Plotësoni identitetin e kompanisë."));
  if (!model.identity.nipt) blockingItems.push(item("identity", "nipt", "Mungon NUIS/NIPT.", "Shtoni identifikuesin tatimor."));
  if (!model.identity.procurementRegistered) warningItems.push(item("identity", "procurement_registration", "Regjistrimi në prokurim nuk është konfirmuar.", "Konfirmoni statusin e regjistrimit."));

  scores.work = activeWork.length ? Math.min(100, 45 + (activeWork.some((record) => record.cpvPrefixes.length) ? 30 : 0) + (activeWork.some((record) => record.maxProjectValueAll) ? 25 : 0)) : 0;
  if (!activeWork.length) blockingItems.push(item("work", "work_capability", "Nuk është deklaruar asnjë fushë pune.", "Shtoni të paktën një aftësi pune."));
  if (activeWork.length && !activeWork.some((record) => record.cpvPrefixes.length)) warningItems.push(item("work", "cpv", "Fushat e punës nuk kanë kode CPV.", "Shtoni kodet CPV për renditje më të saktë."));

  scores.geography = model.serviceAreas.some((record) => record.active) ? (model.serviceAreas.some((record) => record.travelRadiusKm != null && record.mobilizationDays != null) ? 100 : 65) : 0;
  if (!model.serviceAreas.some((record) => record.active)) blockingItems.push(item("geography", "service_area", "Nuk është përcaktuar zona e shërbimit.", "Shtoni rajonet ku kompania mund të mobilizohet."));

  scores.compliance = validCompliance.length ? Math.min(100, 55 + (validCompliance.some((record) => record.referenceNumber) ? 20 : 0) + (validCompliance.some((record) => record.expiryDate) ? 25 : 0)) : 0;
  if (!validCompliance.length) warningItems.push(item("compliance", "licence", "Nuk ka licenca ose dokumente të vlefshme të regjistruara.", "Shtojini kur ekzistojnë; sistemi i verifikon si bllokues vetëm kur tenderi i kërkon shprehimisht."));
  for (const record of model.complianceRecords.filter((entry) => entry.active)) {
    const days = record.expiryDate ? (Date.parse(record.expiryDate) - Date.now()) / 86_400_000 : null;
    if (record.status === "expired" || (days != null && days < 0)) expiredItems.push(item("compliance", `expired_${record.id}`, `${record.name} ka skaduar.`, "Rinovoni dokumentin dhe ngarkoni provën e re."));
    else if (days != null && days <= 60) warningItems.push(item("compliance", `expires_${record.id}`, `${record.name} skadon pas ${Math.max(0, Math.ceil(days))} ditësh.`, "Planifikoni rinovimin."));
  }

  const availablePeople = model.labourPools.filter((record) => record.active).reduce((sum, record) => sum + record.availableHeadcount, 0);
  scores.people = Math.min(100, (model.keyPeople.some((record) => record.active) ? 50 : 0) + (availablePeople > 0 ? 40 : 0) + (model.keyPeople.some((record) => record.documentIds.length) ? 10 : 0));
  if (!model.keyPeople.some((record) => record.active)) warningItems.push(item("people", "key_people", "Nuk ka personel teknik të emërtuar.", "Shtoni drejtuesit teknikë dhe profesionistët kyç."));
  if (!availablePeople) blockingItems.push(item("people", "available_labour", "Nuk ka fuqi punëtore të disponueshme.", "Shtoni grupet e punës dhe disponueshmërinë."));
  if (model.labourPools.some((record) => record.active && freshnessDays(record.updatedAt) > 30)) staleItems.push(item("people", "stale_people", "Disponueshmëria e fuqisë punëtore është më e vjetër se 30 ditë.", "Rikonfirmoni numrat e disponueshëm."));

  scores.crews = model.crews.some((record) => record.active) ? (model.crews.some((record) => record.roles.length > 1 && record.availableCrewCount > 0) ? 100 : 65) : 0;
  if (!model.crews.some((record) => record.active)) warningItems.push(item("crews", "crew", "Nuk janë ndërtuar formacionet e ekipeve.", "Shtoni ekipet që përdorni në projekte."));

  const availableEquipment = model.equipment.filter((record) => record.active && record.availableQuantity > 0);
  scores.equipment = availableEquipment.length ? Math.min(100, 60 + (availableEquipment.some((record) => record.capacity) ? 20 : 0) + (availableEquipment.some((record) => record.inspectionExpiry) ? 20 : 0)) : 0;
  if (!availableEquipment.length) warningItems.push(item("equipment", "equipment", "Nuk ka pajisje të disponueshme të regjistruara.", "Shtoni pajisjet, automjetet ose alternativat me qira."));
  if (model.equipment.some((record) => record.active && freshnessDays(record.updatedAt) > 30)) staleItems.push(item("equipment", "stale_equipment", "Disponueshmëria e pajisjeve është më e vjetër se 30 ditë.", "Rikonfirmoni pajisjet e lira."));

  const financial = model.financialCapacity;
  scores.financial = Math.min(100, (financial.maxContractValueAll ? 35 : 0) + (financial.turnoverHistory.length ? 30 : 0) + (financial.workingCapitalAll != null ? 20 : 0) + (financial.performanceGuaranteeLimitAll != null ? 15 : 0));
  if (!financial.maxContractValueAll) blockingItems.push(item("financial", "max_contract", "Nuk është përcaktuar kapaciteti maksimal i kontratës.", "Plotësoni kapacitetin financiar."));
  if (freshnessDays(financial.updatedAt) > 365) staleItems.push(item("financial", "stale_financial", "Të dhënat financiare janë më të vjetra se 12 muaj.", "Përditësoni pasqyrën financiare."));

  const completedProjects = model.referenceProjects.filter((record) => record.active && record.status === "completed");
  scores.experience = completedProjects.length ? Math.min(100, 55 + (completedProjects.some((record) => record.cpvCodes.length) ? 25 : 0) + (completedProjects.some((record) => record.documentIds.length) ? 20 : 0)) : 0;
  if (!completedProjects.length) warningItems.push(item("experience", "reference_project", "Nuk ka projekte reference të përfunduara.", "Shtoni eksperiencën e ngjashme të kompanisë."));

  scores.partners = model.partners.some((record) => record.active) ? 100 : 50;
  if (!model.partners.some((record) => record.active)) warningItems.push(item("partners", "partners", "Nuk janë regjistruar partnerë ose nënkontraktorë.", "Shtoni partnerët ose konfirmoni se nuk përdoren."));

  scores.rules = Math.min(100, (model.bidPreferences.minimumLeadDays != null ? 35 : 0) + (model.bidPreferences.maxConcurrentProjects != null ? 35 : 0) + ((model.bidPreferences.preferredAuthorities.length || model.bidPreferences.rules.length) ? 30 : 0));
  if (model.bidPreferences.minimumLeadDays == null) warningItems.push(item("rules", "lead_time", "Nuk është përcaktuar koha minimale për përgatitjen e ofertës.", "Shtoni rregullin e afatit."));
  const currentCommitments = model.commitments.filter((record) => record.active && (!record.endDate || Date.parse(record.endDate) >= Date.now()));
  if (model.bidPreferences.maxConcurrentProjects != null && currentCommitments.length >= model.bidPreferences.maxConcurrentProjects) warningItems.push(item("rules", "capacity_full", "Numri i projekteve aktive ka arritur kufirin e deklaruar.", "Përditësoni angazhimet ose kapacitetin."));

  const weights: Record<CapabilitySectionKey, number> = { identity: 10, work: 14, geography: 7, compliance: 12, people: 12, crews: 10, equipment: 8, financial: 10, experience: 9, partners: 3, rules: 5 };
  const overallScore = Math.round((Object.keys(weights) as CapabilitySectionKey[]).reduce((sum, section) => sum + scores[section] * weights[section], 0) / 100);
  return { overallScore, sectionScores: scores, blockingItems, warningItems, expiredItems, staleItems, readyForMatching: blockingItems.length === 0 && overallScore >= 70, lastCalculatedAt: now() };
}
