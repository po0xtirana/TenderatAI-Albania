import { createClient } from "@supabase/supabase-js";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import type { LocalPersistedState } from "@/lib/store";
import { emptyCapabilityModel } from "@/lib/capabilities";

type Row = Record<string, unknown>;
const root = process.cwd();
const dryRun = !process.argv.includes("--execute");

function loadLocalEnv() {
  const envPath = path.join(root, ".env.local");
  if (!fs.existsSync(envPath)) return;
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/); if (!match) continue;
    const [, key, raw] = match; if (!process.env[key]) process.env[key] = raw.replace(/^['"]|['"]$/g, "");
  }
}

loadLocalEnv();
const statePath = path.join(root, "data", "state.json");
if (!fs.existsSync(statePath)) throw new Error("data/state.json nuk u gjet.");
const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as LocalPersistedState;
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const userId = process.env.SUPABASE_IMPORT_USER_ID;
if (!dryRun && (!url || !serviceKey || !userId)) throw new Error("Për --execute duhen NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY dhe SUPABASE_IMPORT_USER_ID.");

const bulletin = state.bulletins[0];
const pdfPath = bulletin ? path.join(root, "data", "uploads", `${bulletin.id}.pdf`) : "";
const pdf = bulletin && fs.existsSync(pdfPath) ? fs.readFileSync(pdfPath) : null;
if (bulletin && (!pdf || createHash("sha256").update(pdf).digest("hex") !== bulletin.fileHash)) throw new Error("PDF-ja lokale nuk përputhet me hash-in e buletinit.");

console.log(`${dryRun ? "DRY RUN" : "IMPORT"}: ${state.bulletins.length} bulletin(e), ${state.tenders.length} tendera, ${pdf?.byteLength ?? 0} bytes PDF.`);
if (dryRun) { console.log("Asnjë ndryshim nuk u bë në Supabase. Përdorni --execute vetëm pas verifikimit."); process.exit(0); }

const client = createClient(url!, serviceKey!, { auth: { persistSession: false, autoRefreshToken: false } });
async function upsert(table: string, row: Row, onConflict: string) {
  const { data, error } = await client.from(table).upsert(row, { onConflict, ignoreDuplicates: false }).select().single();
  if (error) throw new Error(`${table}: ${error.message}`); return data as Row;
}
async function insert(table: string, row: Row) {
  const { data, error } = await client.from(table).insert(row).select().single();
  if (error) throw new Error(`${table}: ${error.message}`); return data as Row;
}
async function replaceRows(table: string, rows: Row[]) {
  if (!rows.length) return;
  const { error } = await client.from(table).upsert(rows, { onConflict: "owner_user_id" });
  if (error) throw new Error(`${table}: ${error.message}`);
}

async function runImport() {
const owner = userId!;
const model = state.capability ?? emptyCapabilityModel(state.company);
await upsert("company_capability_profiles", {
  owner_user_id: owner, company_name: state.company.companyName, trades: state.company.trades, cpv_prefixes: state.company.cpvPrefixes,
  service_regions: state.company.serviceRegions, min_value_all: state.company.minValueAll, max_value_all: state.company.maxValueAll,
  licences: state.company.licences, preferred_authorities: state.company.preferredAuthorities, excluded_terms: state.company.excludedTerms,
  available_employees: state.company.availableEmployees, available_equipment: state.company.availableEquipment,
  max_concurrent_projects: state.company.maxConcurrentProjects, current_projects: state.company.currentProjects,
  legal_name: model.identity.legalName, trading_name: model.identity.tradingName, nipt: model.identity.nipt, entity_type: model.identity.entityType,
  registered_address: model.identity.registeredAddress, phone: model.identity.phone, contact_email: model.identity.email, website: model.identity.website,
  year_founded: model.identity.yearFounded, procurement_registered: model.identity.procurementRegistered, company_description: model.identity.description,
  profile_status: model.status, readiness_score: 0, active_version: model.activeVersion, draft_updated_at: model.draftUpdatedAt
}, "owner_user_id");

const bulletinIds = new Map<string, string>();
for (const item of state.bulletins) {
  const stored = await upsert("bulletins", {
    owner_user_id: owner, bulletin_number: item.bulletinNumber, bulletin_type: item.bulletinType, publication_date: item.publicationDate,
    file_name: item.fileName, file_hash: item.fileHash, storage_path: `${owner}/${item.id}.pdf`, page_count: item.pageCount, notice_count: item.noticeCount,
    status: item.status, processing_stage: item.processingStage, last_error: item.error ?? null, source_url: item.sourceUrl ?? null, uploaded_at: item.uploadedAt,
    source_fingerprint: item.fileHash
  }, "owner_user_id,file_hash");
  bulletinIds.set(item.id, String(stored.id));
  const localFile = path.join(root, "data", "uploads", `${item.id}.pdf`);
  if (fs.existsSync(localFile)) {
    const contents = fs.readFileSync(localFile);
    const { error } = await client.storage.from("app-bulletins").upload(`${owner}/${item.id}.pdf`, contents, { upsert: true, contentType: "application/pdf" });
    if (error) throw new Error(`Storage app-bulletins: ${error.message}`);
  }
}

const tenderIds = new Map<string, string>();
for (const record of state.tenders) {
  const tender = record.tender; const bulletinId = bulletinIds.get(tender.bulletinId); if (!bulletinId) throw new Error(`Buletini mungon për ${tender.referenceNumber}.`);
  const stored = await upsert("tender_notices", {
    owner_user_id: owner, bulletin_id: bulletinId, reference_number: tender.referenceNumber, parent_reference_number: tender.parentReferenceNumber,
    lot_number: tender.lotNumber, contracting_authority: tender.contractingAuthority, address: tender.address, contact_email: tender.contactEmail,
    procedure_type: tender.procedureType, contract_object: tender.contractObject, cpv_codes: tender.cpvCodes, limit_fund_all: tender.limitFundAll,
    vat_status: tender.vatStatus, financing_text: tender.financingText, duration_text: tender.durationText, submission_deadline: tender.submissionDeadline,
    republished: tender.republished, source_page_start: tender.sourcePages.start, source_page_end: tender.sourcePages.end, source_text: tender.sourceText,
    extraction_confidence: tender.extractionConfidence, lifecycle_status: tender.lifecycleStatus, source_key: "app_bulletin"
  }, "owner_user_id,reference_number,bulletin_id");
  const tenderId = String(stored.id); tenderIds.set(tender.id, tenderId);
  await upsert("tender_matches", {
    owner_user_id: owner, tender_notice_id: tenderId, score: record.match.score, decision: record.match.decision,
    components: record.match.components, blockers: record.match.blockers, reasons: record.match.reasons, matched_terms: record.match.matchedTerms,
    missing_information: record.match.missingInformation, capability_version: record.match.capabilityVersion,
    ranking_version: record.match.scoringModelVersion ?? "albania-evidence-adaptive-v2",
    observed_fit_score: record.match.observedFitScore ?? record.match.score,
    confidence_score: record.match.confidenceScore ?? record.match.evidenceCoverage,
    fit_range_low: record.match.fitRangeLow ?? record.match.score,
    fit_range_high: record.match.fitRangeHigh ?? record.match.score,
    criterion_results: record.match.criterionResults ?? [],
    recommendation: record.match.recommendation ?? "review",
    recommendation_reason: record.match.recommendationReason ?? "Kërkon rishikim.",
    critical_unknowns: record.match.criticalUnknowns ?? [],
    calibration_version: record.match.calibrationVersion ?? "feedback-beta-v1",
    workflow_status: record.workflowStatus, relevance_feedback: record.relevanceFeedback ?? null, feedback_at: null
  }, "owner_user_id,tender_notice_id");
  await client.from("tender_insights").delete().eq("owner_user_id", owner).eq("tender_notice_id", tenderId);
  if (record.insights.length) await client.from("tender_insights").insert(record.insights.map((insight) => ({ owner_user_id: owner, tender_notice_id: tenderId, insight_type: insight.type, text_al: insight.textAl, evidence: insight.evidence, fact_or_inference: insight.factOrInference, confidence: insight.confidence })));
  if (record.deliveryPlan) {
    await client.from("tender_work_packages").delete().eq("owner_user_id", owner).eq("tender_notice_id", tenderId);
    const packages = [] as Row[]; const packageIds = new Map<string, string>();
    for (const work of record.deliveryPlan.workPackages) { const row = await insert("tender_work_packages", { owner_user_id: owner, tender_notice_id: tenderId, phase: work.phase, task: work.task, quantity: work.quantity, unit: work.unit, requirements: work.requirements, source: work.source, source_page: work.sourcePage, evidence_text: work.evidenceText, confidence: work.confidence, verification_status: work.verificationStatus }); packages.push(row); packageIds.set(work.id, String(row.id)); }
    if (record.deliveryPlan.allocations.length) await client.from("tender_work_allocations").insert(record.deliveryPlan.allocations.flatMap((allocation) => { const workPackageId = packageIds.get(allocation.workPackageId); return workPackageId ? [{ owner_user_id: owner, work_package_id: workPackageId, allocation_source: allocation.source, share_percent: allocation.sharePercent, partner_id: null, resource_id: null, company_capability: allocation.companyCapability, estimated_amount_all: allocation.estimatedAmountAll, status: allocation.status, rationale: allocation.rationale, dependency_risk: allocation.dependencyRisk, confidence: allocation.confidence }] : []; }));
  }
}

const capabilityVersions = state.capabilityVersions ?? [];
if (capabilityVersions.length) {
  await client.from("company_capability_versions").delete().eq("owner_user_id", owner);
  await client.from("company_capability_versions").insert(capabilityVersions.map((version) => ({ owner_user_id: owner, version: version.version, readiness_score: version.readinessScore, snapshot: version.snapshot, activated_at: version.activatedAt })));
}
await upsert("workspace_state_snapshots", { owner_user_id: owner, schema_version: 1, state, updated_at: new Date().toISOString() }, "owner_user_id");
console.log(JSON.stringify({ imported: { bulletins: state.bulletins.length, tenders: state.tenders.length, pdfBytes: pdf?.byteLength ?? 0 }, owner }, null, 2));
}

void runImport().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
