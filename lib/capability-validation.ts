import type { CapabilitySectionKey } from "./types";

type JsonRecord = Record<string, unknown>;

const object = (value: unknown, label: string): JsonRecord => {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error(`${label} nuk ka format të vlefshëm.`);
  return value as JsonRecord;
};

const list = (value: unknown, label: string): JsonRecord[] => {
  if (!Array.isArray(value)) throw new Error(`${label} duhet të jetë listë.`);
  return value.map((entry, index) => object(entry, `${label} #${index + 1}`));
};

const number = (value: unknown, label: string, options: { nullable?: boolean; integer?: boolean; min?: number; max?: number } = {}) => {
  if (value == null && options.nullable) return null;
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error(`${label} duhet të jetë numër i vlefshëm.`);
  if (options.integer && !Number.isInteger(value)) throw new Error(`${label} duhet të jetë numër i plotë.`);
  if (options.min != null && value < options.min) throw new Error(`${label} nuk mund të jetë më i vogël se ${options.min}.`);
  if (options.max != null && value > options.max) throw new Error(`${label} nuk mund të jetë më i madh se ${options.max}.`);
  return value;
};

const optionalNumber = (record: JsonRecord, key: string, label: string, options: { integer?: boolean; min?: number; max?: number } = {}) =>
  number(record[key], label, { ...options, nullable: true });

const validDate = (value: unknown, label: string) => {
  if (value == null || value === "") return null;
  if (typeof value !== "string" || !Number.isFinite(Date.parse(value))) throw new Error(`${label} nuk është datë e vlefshme.`);
  return Date.parse(value);
};

const validateRange = (minimum: number | null, maximum: number | null, label: string) => {
  if (minimum != null && maximum != null && minimum > maximum) throw new Error(`${label}: minimumi nuk mund të jetë më i madh se maksimumi.`);
};

export function validateCapabilitySection(section: CapabilitySectionKey, payload: Record<string, unknown>): void {
  if (section === "identity") {
    const identity = object(payload.identity, "Identiteti");
    const founded = optionalNumber(identity, "yearFounded", "Viti i themelimit", { integer: true, min: 1800, max: new Date().getFullYear() });
    void founded;
    list(payload.operatingLocations, "Vendndodhjet");
    return;
  }
  if (section === "work") {
    for (const work of list(payload.workCapabilities, "Fushat e punës")) {
      const min = optionalNumber(work, "minProjectValueAll", "Vlera minimale", { min: 0 });
      const preferred = optionalNumber(work, "preferredProjectValueAll", "Vlera e preferuar", { min: 0 });
      const max = optionalNumber(work, "maxProjectValueAll", "Vlera maksimale", { min: 0 });
      validateRange(min, max, "Kufijtë e projektit");
      if (preferred != null && ((min != null && preferred < min) || (max != null && preferred > max))) throw new Error("Vlera e preferuar duhet të jetë brenda kufijve minimal dhe maksimal.");
    }
    return;
  }
  if (section === "geography") {
    for (const area of list(payload.serviceAreas, "Zonat e shërbimit")) {
      optionalNumber(area, "travelRadiusKm", "Rrezja e udhëtimit", { min: 0 });
      optionalNumber(area, "mobilizationDays", "Ditët e mobilizimit", { integer: true, min: 0 });
    }
    return;
  }
  if (section === "compliance") {
    for (const record of list(payload.complianceRecords, "Licencat dhe dokumentet")) {
      const issue = validDate(record.issueDate, "Data e lëshimit");
      const expiry = validDate(record.expiryDate, "Data e skadimit");
      if (issue != null && expiry != null && issue > expiry) throw new Error("Data e skadimit duhet të jetë pas datës së lëshimit.");
    }
    return;
  }
  if (section === "people") {
    for (const person of list(payload.keyPeople, "Personeli kyç")) {
      optionalNumber(person, "yearsExperience", "Vitet e eksperiencës", { min: 0, max: 80 });
      number(person.availabilityPercent, "Disponueshmëria e personit", { min: 0, max: 100 });
      validDate(person.availableFrom, "Data e disponueshmërisë së personit");
    }
    for (const pool of list(payload.labourPools, "Fuqia punëtore")) {
      const total = number(pool.headcount, "Numri total i punonjësve", { integer: true, min: 0 })!;
      const available = number(pool.availableHeadcount, "Punonjësit e disponueshëm", { integer: true, min: 0 })!;
      if (available > total) throw new Error("Punonjësit e disponueshëm nuk mund të jenë më shumë se numri total.");
      validDate(pool.availableFrom, "Data e disponueshmërisë së grupit");
      validDate(pool.updatedAt, "Data e përditësimit të grupit");
    }
    return;
  }
  if (section === "crews") {
    for (const crew of list(payload.crews, "Ekipet")) {
      number(crew.availableCrewCount, "Numri i ekipeve të lira", { integer: true, min: 0 });
      number(crew.maxConcurrentProjects, "Projektet e njëkohshme", { integer: true, min: 0 });
      optionalNumber(crew, "maxShiftHours", "Orët maksimale të turnit", { min: 1, max: 24 });
      for (const role of list(crew.roles, "Rolet e ekipit")) number(role.headcount, "Numri për rol", { integer: true, min: 1 });
    }
    return;
  }
  if (section === "equipment") {
    for (const resource of list(payload.equipment, "Pajisjet")) {
      const total = number(resource.quantity, "Sasia totale e pajisjes", { integer: true, min: 0 })!;
      const available = number(resource.availableQuantity, "Sasia e disponueshme e pajisjes", { integer: true, min: 0 })!;
      if (available > total) throw new Error("Sasia e pajisjeve të disponueshme nuk mund të kalojë sasinë totale.");
      validDate(resource.availableFrom, "Data e disponueshmërisë së pajisjes");
      validDate(resource.inspectionExpiry, "Data e inspektimit të pajisjes");
    }
    return;
  }
  if (section === "financial") {
    const financial = object(payload.financialCapacity, "Kapaciteti financiar");
    for (const key of ["workingCapitalAll", "creditFacilitiesAll", "availableProjectFinancingAll", "maxContractValueAll", "currentBacklogAll", "maxConcurrentCommitmentAll", "bidSecurityLimitAll", "performanceGuaranteeLimitAll", "insuranceLimitAll", "bondingLimitAll"]) optionalNumber(financial, key, key, { min: 0 });
    for (const row of list(financial.turnoverHistory, "Historiku i xhiros")) {
      number(row.year, "Viti i xhiros", { integer: true, min: 1990, max: new Date().getFullYear() });
      number(row.amountAll, "Vlera e xhiros", { min: 0 });
    }
    validDate(financial.updatedAt, "Data e përditësimit financiar");
    return;
  }
  if (section === "experience") {
    for (const project of list(payload.referenceProjects, "Projektet reference")) {
      optionalNumber(project, "valueAll", "Vlera e projektit", { min: 0 });
      const start = validDate(project.startDate, "Data e fillimit të projektit");
      const end = validDate(project.endDate, "Data e përfundimit të projektit");
      if (start != null && end != null && start > end) throw new Error("Projekti nuk mund të përfundojë para datës së fillimit.");
      if (project.status === "completed" && end != null && end > Date.now()) throw new Error("Një projekt i përfunduar nuk mund të ketë datë përfundimi në të ardhmen.");
    }
    return;
  }
  if (section === "partners") {
    for (const partner of list(payload.partners, "Partnerët")) {
      optionalNumber(partner, "leadTimeDays", "Ditët e mobilizimit të partnerit", { integer: true, min: 0 });
      optionalNumber(partner, "maxContractValueAll", "Vlera maksimale e partnerit", { min: 0 });
      optionalNumber(partner, "maxConcurrentProjects", "Projektet e njëkohshme të partnerit", { integer: true, min: 0 });
      for (const capability of list(partner.capabilities ?? [], "Kapacitetet e partnerit")) {
        number(capability.headcount, "Personeli i partnerit", { integer: true, min: 0 });
        number(capability.crewCount, "Ekipet e partnerit", { integer: true, min: 0 });
      }
      for (const resource of list(partner.resources ?? [], "Pajisjet e partnerit")) {
        const total = number(resource.quantity, "Sasia totale e partnerit", { integer: true, min: 0 })!;
        const available = number(resource.availableQuantity, "Sasia e lirë e partnerit", { integer: true, min: 0 })!;
        if (available > total) throw new Error("Sasia e lirë e partnerit nuk mund të kalojë sasinë totale.");
      }
      if (partner.performance) {
        const performance = object(partner.performance, "Performanca e partnerit");
        number(performance.completedProjects, "Projektet e partnerit", { integer: true, min: 0 });
        optionalNumber(performance, "onTimeRate", "Dorëzimi në afat", { min: 0, max: 100 });
        optionalNumber(performance, "qualityRating", "Vlerësimi i cilësisë", { min: 0, max: 5 });
      }
    }
    return;
  }
  const preferences = object(payload.bidPreferences, "Rregullat e ofertimit");
  for (const [key, label] of [["minimumLeadDays", "Koha minimale"], ["maxContractMonths", "Kohëzgjatja maksimale"], ["maxConcurrentProjects", "Projektet e njëkohshme"], ["acceptedPaymentDays", "Afati i pagesës"]]) optionalNumber(preferences, key, label, { integer: true, min: 0 });
  optionalNumber(preferences, "maxLiquidatedDamagesPercent", "Penaliteti maksimal", { min: 0, max: 100 });
  for (const commitment of list(payload.commitments, "Angazhimet aktive")) {
    number(commitment.committedPeople, "Personeli i angazhuar", { integer: true, min: 0 });
    number(commitment.committedCrews, "Ekipet e angazhuara", { integer: true, min: 0 });
    const start = validDate(commitment.startDate, "Fillimi i angazhimit");
    const end = validDate(commitment.endDate, "Përfundimi i angazhimit");
    if (start != null && end != null && start > end) throw new Error("Angazhimi nuk mund të përfundojë para datës së fillimit.");
  }
}
