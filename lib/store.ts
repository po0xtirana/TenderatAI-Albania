import { createHash, randomUUID } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { extractBulletin } from "./parse-bulletin";
import { createDeterministicInsights } from "./insights";
import { generateAiInsights } from "./ai-insights";
import { hasAiProvider } from "./ai-provider";
import { matchTender } from "./matcher";
import { authorityFacets, authorityMatches } from "./authority-catalog";
import { generateDeliveryPlan, recalculateDeliverySummary, updateAllocation } from "./delivery-plan";
import { calculateReadiness, capabilitySnapshot, capabilityToLegacy, demoCapabilityModel, emptyCapabilityModel } from "./capabilities";
import type {
  AppSnapshot, Bulletin, CapabilityDocument, CapabilityReadiness, CapabilitySectionKey, CapabilitySnapshot,
  CapabilityVersion, CompanyCapabilityModel, CompanyCapabilityProfile, TenderMatch, TenderNotice, TenderRecord, TenderWorkflowStatus
} from "./types";

const demoCompany: CompanyCapabilityProfile = {
  companyName: "Alba Construct sh.p.k.", trades: ["ndërtim", "rikonstruksion", "rrugë", "ujësjellës", "kanalizime", "hidroteknikë"],
  cpvPrefixes: ["45"], serviceRegions: ["tiranë", "durrës", "elbasan", "vlorë", "berat", "korçë"],
  minValueAll: 2_000_000, maxValueAll: 600_000_000, licences: ["NP-1", "NP-2", "NP-3"],
  preferredAuthorities: ["bashkia", "ujësjellës"], excludedTerms: ["pastrim", "mobilim urban"],
  availableEmployees: 22, availableEquipment: ["eskavator", "kamion", "betoniere", "makineri ngjeshëse"],
  maxConcurrentProjects: 4, currentProjects: 2
};

const emptyCompany: CompanyCapabilityProfile = {
  companyName: "", trades: [], cpvPrefixes: [], serviceRegions: [], minValueAll: null, maxValueAll: null,
  licences: [], preferredAuthorities: [], excludedTerms: [], availableEmployees: null, availableEquipment: [],
  maxConcurrentProjects: null, currentProjects: 0
};

const globalKey = Symbol.for("tenderat-ai-albania-store");
type RuntimeStore = {
  company: CompanyCapabilityProfile;
  capability: CompanyCapabilityModel;
  capabilityVersions: CapabilityVersion[];
  bulletins: Bulletin[];
  tenders: Map<string, TenderRecord>;
  files: Map<string, Buffer>;
  capabilityFiles: Map<string, Buffer>;
};
const globalStore = globalThis as typeof globalThis & { [globalKey]?: RuntimeStore };
const dataDirectory = path.join(process.cwd(), "data");
const stateFile = path.join(dataDirectory, "state.json");

type PersistedState = {
  company: CompanyCapabilityProfile;
  capability?: CompanyCapabilityModel;
  capabilityVersions?: CapabilityVersion[];
  bulletins: Bulletin[];
  tenders: TenderRecord[];
};

export type LocalPersistedState = PersistedState;

const feedbackReason = (relevant: boolean) => relevant ? "Relevanca u konfirmua nga përdoruesi." : "Relevanca u refuzua nga përdoruesi.";

function applyRelevanceFeedback(match: TenderMatch, relevant: boolean | null | undefined): TenderMatch {
  const reasons = match.reasons.filter((reason) => !reason.startsWith("Relevanca u "));
  if (relevant == null) return { ...match, reasons };
  const score = Math.max(0, Math.min(100, match.score + (relevant ? 2 : -5)));
  const decision: TenderMatch["decision"] = match.decision === "blocked" ? "blocked" : score >= 80 ? "high_fit" : score >= 65 ? "good_fit" : score >= 45 ? "review" : "low_fit";
  return { ...match, score, decision, reasons: [...reasons, feedbackReason(relevant)] };
}

function refreshedInsights(record: Pick<TenderRecord, "tender" | "match" | "insights">): TenderRecord["insights"] {
  const deterministic = createDeterministicInsights(record.tender, record.match);
  const retainedAi = (record.insights ?? []).filter((insight) => insight.id.includes("-ai-"));
  return [...deterministic, ...retainedAi.filter((insight) => !deterministic.some((item) => item.id === insight.id))];
}

function referenceKey(reference: string): string | null {
  const value = reference.toUpperCase().replace(/[\s\u2010-\u2015\u2212]+/g, "-").replace(/-+/g, "-");
  return value.startsWith("REF-") ? value : null;
}

function recordQuality(record: TenderRecord): number {
  const tender = record.tender;
  return (record.bulletin.id.startsWith("demo-") ? 0 : 4) + (tender.contractingAuthority === "Autoritet i paidentifikuar" ? 0 : 3) + (tender.contractObject === "Objekti nuk u ekstraktua" ? 0 : 2) + (tender.cpvCodes.length ? 2 : 0) + (tender.limitFundAll == null ? 0 : 2) + tender.extractionConfidence + Math.min(1, tender.sourceText.length / 5_000);
}

function dedupeTenderRecords(store: RuntimeStore): boolean {
  const records = [...store.tenders.values()];
  const byReference = new Map<string, TenderRecord>();
  const withoutReference: TenderRecord[] = [];
  let changed = false;
  for (const record of records) {
    const key = referenceKey(record.tender.referenceNumber);
    if (!key) { withoutReference.push(record); continue; }
    const existing = byReference.get(key);
    if (!existing) { byReference.set(key, record); continue; }
    changed = true;
    const existingDate = Date.parse(existing.bulletin.publicationDate) || 0;
    const candidateDate = Date.parse(record.bulletin.publicationDate) || 0;
    const winner = candidateDate > existingDate || (candidateDate === existingDate && recordQuality(record) > recordQuality(existing)) ? record : existing;
    const loser = winner === record ? existing : record;
    if (winner.workflowStatus === "new" && loser.workflowStatus !== "new") winner.workflowStatus = loser.workflowStatus;
    if (winner.relevanceFeedback == null && loser.relevanceFeedback != null) {
      winner.relevanceFeedback = loser.relevanceFeedback;
      winner.match = applyRelevanceFeedback(winner.match, winner.relevanceFeedback);
    }
    byReference.set(key, winner);
  }
  if (changed) store.tenders = new Map([...withoutReference, ...byReference.values()].map((record) => [record.tender.id, record]));
  return changed;
}

function findTenderByReference(store: RuntimeStore, tender: TenderNotice): TenderRecord | null {
  const key = referenceKey(tender.referenceNumber);
  return key ? [...store.tenders.values()].find((record) => referenceKey(record.tender.referenceNumber) === key) ?? null : null;
}

function activeCapability(store: RuntimeStore): CompanyCapabilityModel {
  const version = [...store.capabilityVersions].sort((a, b) => b.version - a.version)[0];
  if (!version) return store.capability;
  return { ...structuredClone(version.snapshot), status: "active", activeVersion: version.version, draftUpdatedAt: store.capability.draftUpdatedAt, documents: store.capability.documents };
}

function persist(store: RuntimeStore): void {
  if (process.env.TENDERAT_AI_TEST_MODE === "1" || process.env.DATA_BACKEND === "supabase") return;
  try {
    const uploadDirectory = path.join(dataDirectory, "uploads");
    const documentDirectory = path.join(dataDirectory, "capability-documents");
    fs.mkdirSync(uploadDirectory, { recursive: true });
    fs.mkdirSync(documentDirectory, { recursive: true });
    const state: PersistedState = { company: store.company, capability: store.capability, capabilityVersions: store.capabilityVersions, bulletins: store.bulletins, tenders: [...store.tenders.values()] };
    fs.writeFileSync(stateFile, JSON.stringify(state, null, 2), "utf8");
    for (const [id, buffer] of store.files) fs.writeFileSync(path.join(uploadDirectory, `${id}.pdf`), buffer);
    for (const [id, buffer] of store.capabilityFiles) fs.writeFileSync(path.join(documentDirectory, id), buffer);
  } catch (error) {
    console.warn("[local-store] persistence unavailable", error instanceof Error ? error.message : String(error));
  }
}

function restoreFromSaved(saved: PersistedState, restoredFiles = new Map<string, Buffer>(), restoredCapabilityFiles = new Map<string, Buffer>()): RuntimeStore {
    const company = saved.company ?? demoCompany;
    const legacyCapability = company.companyName.toLocaleLowerCase("sq-AL").includes("alba construct") ? demoCapabilityModel(company) : emptyCapabilityModel(company);
    const capability = saved.capability ? { ...legacyCapability, ...saved.capability } : legacyCapability;
    const readiness = calculateReadiness(capability);
    const capabilityVersions = saved.capabilityVersions?.length
      ? saved.capabilityVersions
      : capability.status === "active" ? [{ id: "capability-version-1", version: Math.max(1, capability.activeVersion), activatedAt: capability.draftUpdatedAt, readinessScore: readiness.overallScore, snapshot: capabilitySnapshot(capability) }] : [];
    const files = restoredFiles;
    const capabilityFiles = restoredCapabilityFiles;
    const base: RuntimeStore = { company, capability, capabilityVersions, bulletins: saved.bulletins ?? [], tenders: new Map(), files, capabilityFiles };
    const active = activeCapability(base);
    for (const savedRecord of saved.tenders ?? []) {
      const bulletin = base.bulletins.find((item) => item.id === savedRecord.tender.bulletinId) ?? savedRecord.bulletin;
      const match = applyRelevanceFeedback(matchTender(savedRecord.tender, company, active), savedRecord.relevanceFeedback);
      const deliveryPlan = savedRecord.deliveryPlan ? recalculateDeliverySummary(savedRecord.deliveryPlan) : generateDeliveryPlan(savedRecord.tender, active);
      base.tenders.set(savedRecord.tender.id, { ...savedRecord, bulletin, match, insights: refreshedInsights({ tender: savedRecord.tender, match, insights: savedRecord.insights ?? [] }), workflowStatus: savedRecord.workflowStatus ?? "new", deliveryPlan, relevanceFeedback: savedRecord.relevanceFeedback ?? null });
    }
    dedupeTenderRecords(base);
    return base;
}

function restore(): RuntimeStore | null {
  try {
    if (!fs.existsSync(stateFile)) return null;
    const saved = JSON.parse(fs.readFileSync(stateFile, "utf8")) as PersistedState;
    const company = saved.company ?? demoCompany;
    const legacyCapability = company.companyName.toLocaleLowerCase("sq-AL").includes("alba construct") ? demoCapabilityModel(company) : emptyCapabilityModel(company);
    const capability = saved.capability ? { ...legacyCapability, ...saved.capability } : legacyCapability;
    const files = new Map<string, Buffer>();
    for (const bulletin of saved.bulletins ?? []) {
      const filePath = path.join(dataDirectory, "uploads", `${bulletin.id}.pdf`);
      if (fs.existsSync(filePath)) files.set(bulletin.id, fs.readFileSync(filePath));
    }
    const capabilityFiles = new Map<string, Buffer>();
    for (const document of capability.documents) {
      const filePath = path.join(dataDirectory, "capability-documents", document.id);
      if (fs.existsSync(filePath)) capabilityFiles.set(document.id, fs.readFileSync(filePath));
    }
    return restoreFromSaved(saved, files, capabilityFiles);
  } catch (error) {
    console.warn("[local-store] saved state ignored", error instanceof Error ? error.message : String(error));
    return null;
  }
}

export function exportPersistedState(): LocalPersistedState {
  const store = runtime();
  return structuredClone({ company: store.company, capability: store.capability, capabilityVersions: store.capabilityVersions, bulletins: store.bulletins, tenders: [...store.tenders.values()] });
}

export function importPersistedState(saved: LocalPersistedState, files: Map<string, Buffer> = new Map(), capabilityFiles: Map<string, Buffer> = new Map()): void {
  globalStore[globalKey] = restoreFromSaved(saved, files, capabilityFiles);
}

function isoDate(date: string): string { return new Date(`${date}T12:00:00+02:00`).toISOString(); }

const demoBulletin: Bulletin = {
  id: "demo-bulletin-54", bulletinNumber: "54", bulletinType: "regular", publicationDate: "2026-08-24",
  fileName: "BULETINI NR. 54 DATE 24.08.2026.pdf", fileHash: "demo-bulletin-54-hash", pageCount: 985,
  noticeCount: 6, uploadedAt: "2026-08-25T08:30:00.000Z", status: "completed", processingStage: "completed",
  error: null, sourceUrl: "https://www.app.gov.al/të-tjera/arkiva/arkiva-e-buletinit-të-prokurimit-publik/arkiva-e-buletinit-te-prokurimit-publik-2026/"
};

function makeDemoTender(bulletinId: string, index: number, data: Pick<TenderNotice, "referenceNumber" | "contractingAuthority" | "contractObject" | "cpvCodes" | "limitFundAll" | "durationText" | "submissionDeadline" | "address">, capability: CompanyCapabilityModel): TenderRecord {
  const tender: TenderNotice = {
    id: `${bulletinId}-${data.referenceNumber}`, bulletinId, referenceNumber: data.referenceNumber, parentReferenceNumber: null,
    lotNumber: null, contractingAuthority: data.contractingAuthority, address: data.address, contactEmail: null,
    procedureType: "Procedurë e hapur - Punë", contractObject: data.contractObject, cpvCodes: data.cpvCodes,
    limitFundAll: data.limitFundAll, vatStatus: "Pa TVSH", financingText: null, durationText: data.durationText,
    submissionDeadline: data.submissionDeadline, republished: index === 2, sourcePages: { start: 17 + index, end: 18 + index },
    sourceText: `${data.contractingAuthority}\n4. Objekti i kontratës: ${data.contractObject}\n5. Kodi sipas Fjalorit të Përbashkët të Prokurimit (FPP): ${data.cpvCodes.join(" ")}\n6. Fondi limit: ${data.limitFundAll?.toLocaleString("sq-AL") ?? "nuk është publikuar"} lekë pa TVSH.\n7. Kohëzgjatja: ${data.durationText ?? "nuk është publikuar"}.\n8. Afati i fundit: ${data.submissionDeadline ?? "nuk është publikuar"}.`,
    extractionConfidence: 0.93, lifecycleStatus: data.submissionDeadline && Date.parse(data.submissionDeadline) < Date.now() ? "expired" : "active", createdAt: new Date().toISOString()
  };
  const match = matchTender(tender, demoCompany, capability);
  return { tender, bulletin: demoBulletin, match, insights: createDeterministicInsights(tender, match), workflowStatus: "new", deliveryPlan: generateDeliveryPlan(tender, capability) };
}

function createRuntimeStore(): RuntimeStore {
  const saved = process.env.TENDERAT_AI_TEST_MODE === "1" || process.env.DATA_BACKEND === "supabase" ? null : restore();
  if (saved) return saved;
  if (process.env.TENDERAT_AI_TEST_MODE !== "1" && process.env.TENDERAT_AI_DEMO_MODE !== "1") {
    return { company: emptyCompany, capability: emptyCapabilityModel(emptyCompany), capabilityVersions: [], bulletins: [], tenders: new Map(), files: new Map(), capabilityFiles: new Map() };
  }
  const capability = demoCapabilityModel(demoCompany);
  const readiness = calculateReadiness(capability);
  const version: CapabilityVersion = { id: "capability-version-1", version: 1, activatedAt: capability.draftUpdatedAt, readinessScore: readiness.overallScore, snapshot: capabilitySnapshot(capability) };
  const entries = [
    { referenceNumber: "REF-96297-08-14-2026", contractingAuthority: "Shoqëria Rajonale Ujësjellës Kanalizime Korçë Sh.A.", contractObject: "Ndërtimi i rrjetit të kanalizimeve për fshatrat e Bashkisë Pustec dhe impiantet e trajtimit", cpvCodes: ["45232400-6"], limitFundAll: 522_854_560.25, durationText: "18 muaj", submissionDeadline: isoDate("2026-09-01"), address: "Korçë" },
    { referenceNumber: "REF-96241-08-14-2026", contractingAuthority: "Bashkia Himarë", contractObject: "Ndërtimi i ujësjellësit Qeparo", cpvCodes: ["45247130-0"], limitFundAll: 166_666_667, durationText: "12 muaj", submissionDeadline: isoDate("2026-09-01"), address: "Himarë" },
    { referenceNumber: "REF-96249-08-14-2026", contractingAuthority: "Bashkia Vlorë", contractObject: "Rikualifikimi urban dhe përmirësimi i infrastrukturës në zonën rekreative pranë burimit të Rrepeve të Izvorit, Tragjas", cpvCodes: ["45000000-7"], limitFundAll: 12_924_995.13, durationText: "6 muaj", submissionDeadline: isoDate("2026-09-01"), address: "Vlorë" },
    { referenceNumber: "REF-96300-08-14-2026", contractingAuthority: "Ndërmarrja e Pastrimit - Bashkia Vlorë", contractObject: "F.V. Tapet bari natyral", cpvCodes: ["03120000-8"], limitFundAll: 4_779_000, durationText: "30 ditë", submissionDeadline: isoDate("2026-09-01"), address: "Vlorë" },
    { referenceNumber: "REF-96260-08-14-2026", contractingAuthority: "Bashkia Vlorë", contractObject: "Rehabilitim i skemës vaditëse Llakatund VLU 3", cpvCodes: ["45210000-2"], limitFundAll: 16_891_459, durationText: "90 ditë", submissionDeadline: isoDate("2026-09-01"), address: "Vlorë" },
    { referenceNumber: "REF-96320-08-14-2026", contractingAuthority: "Bashkia Tiranë", contractObject: "Rikonstruksion dhe mirëmbajtje e objekteve publike në territorin e bashkisë", cpvCodes: ["45000000-7"], limitFundAll: 48_500_000, durationText: "8 muaj", submissionDeadline: isoDate("2026-09-08"), address: "Tiranë" }
  ];
  const tenders = new Map<string, TenderRecord>();
  for (const [index, entry] of entries.entries()) {
    const record = makeDemoTender(demoBulletin.id, index, entry, capability);
    tenders.set(record.tender.id, record);
  }
  return { company: demoCompany, capability, capabilityVersions: [version], bulletins: [demoBulletin], tenders, files: new Map(), capabilityFiles: new Map() };
}

function runtime(): RuntimeStore {
  if (!globalStore[globalKey]) globalStore[globalKey] = createRuntimeStore();
  const store = globalStore[globalKey]!;
  // Next.js HMR can preserve the previous global store while replacing this module.
  // Upgrade that object in place so open local sessions do not require a restart or lose uploads.
  if (!store.capability) {
    const capability = store.company.companyName.toLocaleLowerCase("sq-AL").includes("alba construct") ? demoCapabilityModel(store.company) : emptyCapabilityModel(store.company);
    const readiness = calculateReadiness(capability);
    store.capability = capability;
    store.capabilityVersions = [{ id: "capability-version-1", version: 1, activatedAt: capability.draftUpdatedAt, readinessScore: readiness.overallScore, snapshot: capabilitySnapshot(capability) }];
    store.capabilityFiles = new Map();
    const active = activeCapability(store);
    for (const record of store.tenders.values()) {
      record.match = matchTender(record.tender, store.company, active);
      record.insights = refreshedInsights(record);
      record.deliveryPlan = generateDeliveryPlan(record.tender, active);
    }
    persist(store);
  }
  if (dedupeTenderRecords(store)) persist(store);
  return store;
}

async function addOptionalAiInsights(records: TenderRecord[]): Promise<void> {
  if (!hasAiProvider()) return;
  const configuredLimit = Number.parseInt(process.env.OPENAI_TENDER_MAX_NOTICES ?? "12", 10);
  const limit = Number.isFinite(configuredLimit) ? Math.max(0, Math.min(25, configuredLimit)) : 12;
  if (!limit) return;
  const candidates = [...records].sort((a, b) => b.match.score - a.match.score).slice(0, limit);
  for (let index = 0; index < candidates.length; index += 3) {
    await Promise.all(candidates.slice(index, index + 3).map(async (record) => {
      try { record.insights = [...record.insights, ...await generateAiInsights(record.tender)]; }
      catch (error) { console.warn("[bulletin-processing] optional AI insight skipped", { tenderId: record.tender.id, error: error instanceof Error ? error.message : String(error) }); }
    }));
  }
}

export function getSnapshot(options: { period?: "30d" | "90d" | "all"; decision?: string; query?: string; authorities?: string[] } = {}): AppSnapshot {
  const store = runtime();
  const nowMs = Date.now();
  const days = options.period === "30d" ? 30 : options.period === "90d" ? 90 : null;
  const query = options.query?.trim().toLocaleLowerCase("sq-AL");
  const tenders = [...store.tenders.values()].filter((record) => {
    const inPeriod = days == null || nowMs - Date.parse(record.bulletin.publicationDate) <= days * 86_400_000;
    const decision = !options.decision || options.decision === "all" || record.match.decision === options.decision;
    const searchable = `${record.tender.contractObject} ${record.tender.contractingAuthority} ${record.tender.referenceNumber}`.toLocaleLowerCase("sq-AL");
    return inPeriod && decision && authorityMatches(record.tender, options.authorities ?? []) && (!query || searchable.includes(query));
  }).sort((a, b) => {
    const scoreDifference = b.match.score - a.match.score; if (scoreDifference) return scoreDifference;
    const aDeadline = a.tender.submissionDeadline ? Date.parse(a.tender.submissionDeadline) : Number.POSITIVE_INFINITY;
    const bDeadline = b.tender.submissionDeadline ? Date.parse(b.tender.submissionDeadline) : Number.POSITIVE_INFINITY;
    return (Number.isFinite(aDeadline) ? aDeadline : Number.POSITIVE_INFINITY) - (Number.isFinite(bDeadline) ? bDeadline : Number.POSITIVE_INFINITY);
  });
  return { company: store.company, readiness: calculateReadiness(store.capability), bulletins: [...store.bulletins].sort((a, b) => Date.parse(b.publicationDate) - Date.parse(a.publicationDate)), tenders, authorityFacets: authorityFacets([...store.tenders.values()].map((record) => record.tender)) };
}

export function getTender(id: string): TenderRecord | null {
  const store = runtime(); const record = store.tenders.get(id); if (!record) return null;
  if (!record.deliveryPlan) { record.deliveryPlan = generateDeliveryPlan(record.tender, activeCapability(store)); persist(store); }
  else record.deliveryPlan = recalculateDeliverySummary(record.deliveryPlan);
  return record;
}
export function getTenderDeliveryPlan(id: string): TenderRecord["deliveryPlan"] | null { return getTender(id)?.deliveryPlan ?? null; }
export function updateTenderDeliveryAllocation(tenderId: string, allocationId: string, patch: Record<string, unknown>): TenderRecord | null {
  const store = runtime(); const record = getTender(tenderId); if (!record?.deliveryPlan) return null;
  const next = updateAllocation(record.deliveryPlan, allocationId, patch as Partial<NonNullable<TenderRecord["deliveryPlan"]>["allocations"][number]>);
  if (!next) return null; record.deliveryPlan = next; persist(store); return record;
}
export function getBulletinFile(id: string): Buffer | null { return runtime().files.get(id) ?? null; }
export function getCapabilityDocument(id: string): { metadata: CapabilityDocument; buffer: Buffer } | null {
  const store = runtime(); const metadata = store.capability.documents.find((item) => item.id === id); const buffer = store.capabilityFiles.get(id);
  return metadata && buffer ? { metadata, buffer } : null;
}
export function getCapabilities(): { model: CompanyCapabilityModel; readiness: CapabilityReadiness } {
  const model = structuredClone(runtime().capability); return { model, readiness: calculateReadiness(model) };
}
export function getCapabilityVersions(): CapabilityVersion[] { return structuredClone([...runtime().capabilityVersions].sort((a, b) => b.version - a.version)); }

export function updateCapabilitySection(section: CapabilitySectionKey, payload: Record<string, unknown>): { model: CompanyCapabilityModel; readiness: CapabilityReadiness } {
  const store = runtime();
  const model = store.capability;
  if (section === "identity") { if (payload.identity) model.identity = payload.identity as CompanyCapabilityModel["identity"]; if (payload.operatingLocations) model.operatingLocations = payload.operatingLocations as CompanyCapabilityModel["operatingLocations"]; }
  else if (section === "work" && payload.workCapabilities) model.workCapabilities = payload.workCapabilities as CompanyCapabilityModel["workCapabilities"];
  else if (section === "geography" && payload.serviceAreas) model.serviceAreas = payload.serviceAreas as CompanyCapabilityModel["serviceAreas"];
  else if (section === "compliance" && payload.complianceRecords) model.complianceRecords = payload.complianceRecords as CompanyCapabilityModel["complianceRecords"];
  else if (section === "people") { if (payload.keyPeople) model.keyPeople = payload.keyPeople as CompanyCapabilityModel["keyPeople"]; if (payload.labourPools) model.labourPools = payload.labourPools as CompanyCapabilityModel["labourPools"]; }
  else if (section === "crews" && payload.crews) model.crews = payload.crews as CompanyCapabilityModel["crews"];
  else if (section === "equipment" && payload.equipment) model.equipment = payload.equipment as CompanyCapabilityModel["equipment"];
  else if (section === "financial" && payload.financialCapacity) model.financialCapacity = payload.financialCapacity as CompanyCapabilityModel["financialCapacity"];
  else if (section === "experience" && payload.referenceProjects) model.referenceProjects = payload.referenceProjects as CompanyCapabilityModel["referenceProjects"];
  else if (section === "partners" && payload.partners) model.partners = payload.partners as CompanyCapabilityModel["partners"];
  else if (section === "rules") { if (payload.bidPreferences) model.bidPreferences = payload.bidPreferences as CompanyCapabilityModel["bidPreferences"]; if (payload.commitments) model.commitments = payload.commitments as CompanyCapabilityModel["commitments"]; }
  else throw new Error("Seksioni ose të dhënat nuk janë të vlefshme.");
  model.draftUpdatedAt = new Date().toISOString();
  persist(store);
  return { model: structuredClone(model), readiness: calculateReadiness(model) };
}

export function activateCapabilities(): { model: CompanyCapabilityModel; readiness: CapabilityReadiness; version: CapabilityVersion } {
  const store = runtime(); const readiness = calculateReadiness(store.capability);
  if (!readiness.readyForMatching) throw new Error("Profili ka ende bllokues. Plotësoni fushat e detyrueshme para aktivizimit.");
  const nextVersion = Math.max(0, ...store.capabilityVersions.map((item) => item.version)) + 1;
  store.capability.status = "active"; store.capability.activeVersion = nextVersion; store.capability.draftUpdatedAt = new Date().toISOString();
  const version: CapabilityVersion = { id: randomUUID(), version: nextVersion, activatedAt: new Date().toISOString(), readinessScore: readiness.overallScore, snapshot: capabilitySnapshot(store.capability) };
  store.capabilityVersions.push(version);
  store.company = capabilityToLegacy(store.capability);
  const active = activeCapability(store);
  for (const record of store.tenders.values()) { record.match = applyRelevanceFeedback(matchTender(record.tender, store.company, active), record.relevanceFeedback); record.insights = refreshedInsights(record); record.deliveryPlan = generateDeliveryPlan(record.tender, active); }
  persist(store);
  return { model: structuredClone(store.capability), readiness, version: structuredClone(version) };
}

export function addCapabilityDocument(section: CapabilitySectionKey, category: string, expiresAt: string | null, name: string, mimeType: string, buffer: Buffer): CapabilityDocument {
  const store = runtime(); const id = randomUUID();
  const metadata: CapabilityDocument = { id, section, category, expiresAt, name, mimeType, fileSize: buffer.byteLength, uploadedAt: new Date().toISOString() };
  store.capability.documents.push(metadata); store.capabilityFiles.set(id, buffer); store.capability.draftUpdatedAt = new Date().toISOString(); persist(store); return metadata;
}
export function removeCapabilityDocument(id: string): boolean {
  const store = runtime(); const index = store.capability.documents.findIndex((item) => item.id === id); if (index < 0) return false;
  store.capability.documents.splice(index, 1); store.capabilityFiles.delete(id);
  const filePath = path.join(dataDirectory, "capability-documents", id); if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  persist(store); return true;
}

export function updateCompany(next: Partial<CompanyCapabilityProfile>): CompanyCapabilityProfile {
  const store = runtime(); store.company = { ...store.company, ...next }; persist(store); return store.company;
}
export function recordFeedback(tenderId: string, relevant: boolean): TenderRecord | null {
  const store = runtime(); const record = getTender(tenderId); if (!record) return null;
  record.relevanceFeedback = relevant;
  record.match = applyRelevanceFeedback(matchTender(record.tender, store.company, activeCapability(store)), relevant);
  persist(store); return record;
}
export function updateTenderWorkflow(tenderId: string, status: TenderWorkflowStatus): TenderRecord | null {
  const record = getTender(tenderId); if (!record) return null; record.workflowStatus = status; persist(runtime()); return record;
}

export function queueBulletin(fileName: string, buffer: Buffer, options: { autoProcess?: boolean } = {}): Bulletin {
  const store = runtime(); const fileHash = createHash("sha256").update(buffer).digest("hex");
  const existing = store.bulletins.find((bulletin) => bulletin.fileHash === fileHash);
  if (existing) {
    store.files.set(existing.id, buffer);
    if (["failed", "needs_review"].includes(existing.status)) { existing.status = "queued"; existing.processingStage = "queued"; existing.error = null; persist(store); if (options.autoProcess !== false) setTimeout(() => { void processBulletin(existing.id); }, 10); }
    return existing;
  }
  const id = `bulletin-${fileHash.slice(0, 16)}`;
  const bulletin: Bulletin = { id, bulletinNumber: "?", bulletinType: "unknown", publicationDate: new Date().toISOString().slice(0, 10), fileName, fileHash, pageCount: 0, noticeCount: 0, uploadedAt: new Date().toISOString(), status: "queued", processingStage: "queued", error: null, sourceUrl: null };
  store.bulletins.unshift(bulletin); store.files.set(id, buffer); persist(store); if (options.autoProcess !== false) setTimeout(() => { void processBulletin(id); }, 10); return bulletin;
}

export function requestBulletinProcessing(id: string): Bulletin | null {
  const store = runtime();
  const bulletin = store.bulletins.find((item) => item.id === id);
  if (!bulletin) return null;
  bulletin.status = "queued";
  bulletin.processingStage = "queued";
  bulletin.error = null;
  persist(store);
  if (process.env.DATA_BACKEND !== "supabase") setTimeout(() => { void processBulletin(id); }, 10);
  return structuredClone(bulletin);
}

export async function processBulletin(id: string): Promise<void> {
  const store = runtime(); const bulletin = store.bulletins.find((item) => item.id === id); const buffer = store.files.get(id);
  if (!bulletin || !buffer || bulletin.status === "processing") return;
  bulletin.status = "processing"; bulletin.processingStage = "extracting";
  try {
    const parsed = await extractBulletin(buffer, id);
    Object.assign(bulletin, parsed.bulletin, { fileName: bulletin.fileName, fileHash: bulletin.fileHash, uploadedAt: bulletin.uploadedAt, sourceUrl: bulletin.sourceUrl, status: "processing", processingStage: "ranking", error: null });
    const records: TenderRecord[] = []; const active = activeCapability(store);
    const previousRecords = [...store.tenders.values()].filter((record) => record.tender.bulletinId === id);
    const previousByReference = new Map(previousRecords.map((record) => [referenceKey(record.tender.referenceNumber), record]));
    for (const record of previousRecords) store.tenders.delete(record.tender.id);
    for (const tender of parsed.notices) {
      const existing = findTenderByReference(store, tender) ?? previousByReference.get(referenceKey(tender.referenceNumber)) ?? null;
      const feedback = existing?.relevanceFeedback ?? null;
      const match = applyRelevanceFeedback(matchTender(tender, store.company, active), feedback);
      const previousStatus = existing?.workflowStatus ?? "new";
      const record: TenderRecord = { tender, bulletin, match, insights: createDeterministicInsights(tender, match), workflowStatus: previousStatus, deliveryPlan: generateDeliveryPlan(tender, active), relevanceFeedback: feedback };
      if (existing && existing.tender.id !== tender.id) store.tenders.delete(existing.tender.id);
      records.push(record); store.tenders.set(tender.id, record);
    }
    dedupeTenderRecords(store);
    bulletin.status = parsed.notices.length ? "completed" : "needs_review";
    bulletin.processingStage = parsed.notices.length ? "completed" : "needs_review";
    try { await addOptionalAiInsights(records); }
    catch (error) { console.warn("[bulletin-processing] optional AI pass failed", { bulletinId: id, error: error instanceof Error ? error.message : String(error) }); }
    persist(store);
  } catch (error) {
    bulletin.status = "failed"; bulletin.processingStage = "failed"; bulletin.error = error instanceof Error ? error.message : String(error); persist(store);
    console.error("[bulletin-processing] failed", { bulletinId: id, error: error instanceof Error ? error.stack : String(error) });
  }
}
