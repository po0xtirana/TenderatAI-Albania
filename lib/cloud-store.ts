import { createHash, randomUUID } from "node:crypto";
import { ensureCompanyWorkspaceId, getSupabaseServerClient } from "./supabase-server";
import {
  activateCapabilities, addCapabilityDocument, exportPersistedState, getCapabilities,
  getCapabilityVersions, getSnapshot, getTender, getTenderDeliveryPlan, importPersistedState,
  processBulletin, queueBulletin, recordFeedback, removeCapabilityDocument, updateCapabilitySection, enrichTenderInsights,
  removeBulletin, updateCompany, updateTenderAction, updateTenderDecision, updateTenderDeliveryAllocation, updateTenderWorkflow
} from "./store";
import type { LocalPersistedState } from "./store";
import type { AppSnapshot, Bulletin, CapabilityDocument, CapabilityReadiness, CapabilitySectionKey, CapabilityVersion, CompanyCapabilityModel, CompanyCapabilityProfile, TenderActionStatus, TenderDecisionStatus, TenderRecord, TenderWorkflowStatus } from "./types";

type CloudStateRow = { state: LocalPersistedState; revision?: number; updated_at?: string };
const loadedRevision = new WeakMap<object, number | null>();
const loadedUpdatedAt = new WeakMap<object, string | null>();
const revisionGuardAvailable = new WeakMap<object, boolean>();

export class WorkspaceConflictError extends Error {
  constructor() { super("Të dhënat u ndryshuan nga një proces tjetër. Rifreskoni faqen dhe provoni përsëri."); this.name = "WorkspaceConflictError"; }
}

async function clientAndUser() {
  const client = await getSupabaseServerClient();
  if (!client) throw new Error(process.env.PASSWORDLESS_MODE === "1" ? "Mungon çelësi privat ekzistues i Supabase në konfigurimin e serverit." : "Supabase nuk është konfiguruar.");
  if (process.env.PASSWORDLESS_MODE === "1") {
    const userId = await ensureCompanyWorkspaceId(client);
    return { client, user: { id: userId } };
  }
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) throw new Error("Duhet të identifikoheni për të përdorur hapësirën e kompanisë.");
  return { client, user: data.user };
}

async function loadState(): Promise<{ client: NonNullable<Awaited<ReturnType<typeof getSupabaseServerClient>>>; userId: string }> {
  const { client, user } = await clientAndUser();
  let result = await client.from("workspace_state_snapshots").select("state, revision").eq("owner_user_id", user.id).maybeSingle() as { data: CloudStateRow | null; error: { message: string; code?: string } | null };
  if (result.error && /revision|column/i.test(result.error.message)) {
    result = await client.from("workspace_state_snapshots").select("state, updated_at").eq("owner_user_id", user.id).maybeSingle() as { data: CloudStateRow | null; error: { message: string; code?: string } | null };
    revisionGuardAvailable.set(client, false);
  } else revisionGuardAvailable.set(client, true);
  const { data, error } = result;
  if (error) throw new Error(error.message);
  if (data?.state) importPersistedState(data.state);
  loadedRevision.set(client, data?.revision ?? null);
  loadedUpdatedAt.set(client, data?.updated_at ?? null);
  return { client, userId: user.id };
}

async function saveState(client: NonNullable<Awaited<ReturnType<typeof getSupabaseServerClient>>>, userId: string): Promise<LocalPersistedState> {
  const state = exportPersistedState();
  if (revisionGuardAvailable.get(client) === false) {
    const expectedUpdatedAt = loadedUpdatedAt.get(client) ?? null;
    const nextUpdatedAt = new Date().toISOString();
    const mutation = expectedUpdatedAt
      ? client.from("workspace_state_snapshots").update({ schema_version: 1, state, updated_at: nextUpdatedAt }).eq("owner_user_id", userId).eq("updated_at", expectedUpdatedAt).select("updated_at")
      : client.from("workspace_state_snapshots").insert({ owner_user_id: userId, schema_version: 1, state, updated_at: nextUpdatedAt }).select("updated_at");
    const { data, error } = await mutation as { data: Array<{ updated_at: string }> | null; error: { message: string; code?: string } | null };
    if (error) throw new Error(error.message);
    if (!data?.length) throw new WorkspaceConflictError();
    loadedUpdatedAt.set(client, data[0].updated_at);
    return state;
  }
  const expectedRevision = loadedRevision.get(client) ?? null;
  const { data, error } = await client.rpc("save_workspace_state_if_current", {
    p_owner_user_id: userId,
    p_expected_revision: expectedRevision,
    p_schema_version: 1,
    p_state: state,
  }) as { data: Array<{ revision: number; updated_at: string }> | null; error: { message: string } | null };
  if (error) throw new Error(error.message);
  if (!data?.length) throw new WorkspaceConflictError();
  loadedRevision.set(client, data[0].revision);
  return state;
}

export async function cloudSnapshot(options: Parameters<typeof getSnapshot>[0] = {}): Promise<AppSnapshot> {
  await loadState();
  return getSnapshot(options);
}

export async function cloudTender(id: string): Promise<TenderRecord | null> {
  const { client, userId } = await loadState();
  const before = getSnapshot({ period: "all" }).tenders.find((item) => item.tender.id === id)?.deliveryPlan;
  const value = getTender(id);
  if (value?.deliveryPlan && (before?.plannerVersion !== value.deliveryPlan.plannerVersion || before?.capabilityUpdatedAt !== value.deliveryPlan.capabilityUpdatedAt)) await saveState(client, userId);
  return value;
}
export async function cloudCapabilities(): Promise<{ model: CompanyCapabilityModel; readiness: CapabilityReadiness }> { await loadState(); return getCapabilities(); }
export async function cloudCapabilityVersions(): Promise<CapabilityVersion[]> { await loadState(); return getCapabilityVersions(); }
export async function cloudReadiness(): Promise<CapabilityReadiness> { return (await cloudCapabilities()).readiness; }

export async function cloudUpdateCompany(next: Partial<CompanyCapabilityProfile>): Promise<CompanyCapabilityProfile> {
  const { client, userId } = await loadState(); const value = updateCompany(next); await saveState(client, userId); return value;
}

export async function cloudUpdateCapabilitySection(section: CapabilitySectionKey, payload: Record<string, unknown>) {
  const { client, userId } = await loadState(); const value = updateCapabilitySection(section, payload); await saveState(client, userId); return value;
}

export async function cloudActivateCapabilities() {
  const { client, userId } = await loadState(); const value = activateCapabilities(); await saveState(client, userId); return value;
}

export async function cloudFeedback(tenderId: string, relevant: boolean) {
  const { client, userId } = await loadState(); const value = recordFeedback(tenderId, relevant); if (value) await saveState(client, userId); return value;
}

export async function cloudWorkflow(tenderId: string, status: TenderWorkflowStatus) {
  const { client, userId } = await loadState(); const value = updateTenderWorkflow(tenderId, status); if (value) await saveState(client, userId); return value;
}

export async function cloudDeliveryPlan(tenderId: string) { await loadState(); return getTenderDeliveryPlan(tenderId); }

export async function cloudUpdateDelivery(tenderId: string, allocationId: string, patch: Record<string, unknown>) {
  const { client, userId } = await loadState(); const value = updateTenderDeliveryAllocation(tenderId, allocationId, patch); if (value) await saveState(client, userId); return value;
}

export async function cloudUpdateTenderAction(tenderId: string, actionId: string, patch: { status?: TenderActionStatus; completionNote?: string; dueDate?: string | null }) {
  const { client, userId } = await loadState(); const value = updateTenderAction(tenderId, actionId, patch); if (value) await saveState(client, userId); return value;
}

export async function cloudUpdateTenderDecision(tenderId: string, status: TenderDecisionStatus, reason: string, acceptedRisks: string[]) {
  const { client, userId } = await loadState(); const value = updateTenderDecision(tenderId, status, reason, acceptedRisks); if (value) await saveState(client, userId); return value;
}

export async function cloudEnrichTenderInsights(tenderId: string) {
  const { client, userId } = await loadState();
  const value = await enrichTenderInsights(tenderId);
  if (value) await saveState(client, userId);
  return value;
}

function bulletinPath(userId: string, bulletinId: string): string { return `${userId}/${bulletinId}.pdf`; }
function capabilityPath(userId: string, document: Pick<CapabilityDocument, "id" | "name">): string {
  const safeName = document.name.replace(/[^a-zA-Z0-9._-]+/g, "-").slice(0, 100);
  return `${userId}/capabilities/${document.id}-${safeName}`;
}

export async function cloudQueueBulletin(fileName: string, buffer: Buffer): Promise<Bulletin> {
  const { client, userId } = await loadState();
  const fileHash = createHash("sha256").update(buffer).digest("hex");
  const existing = getSnapshot().bulletins.find((item) => item.fileHash === fileHash);
  const bulletinId = existing?.id ?? `bulletin-${fileHash.slice(0, 16)}`;
  const path = bulletinPath(userId, bulletinId);
  const { error: uploadError } = await client.storage.from("app-bulletins").upload(path, buffer, { upsert: true, contentType: "application/pdf", cacheControl: "3600" });
  if (uploadError) throw new Error(`PDF-ja nuk u ruajt në cloud: ${uploadError.message}`);
  const shouldProcess = !existing || ["failed", "needs_review"].includes(existing.status);
  const bulletin = queueBulletin(fileName, buffer, { autoProcess: false });
  await upsertCloudBulletin(client, userId, bulletin);
  await saveState(client, userId);
  if (shouldProcess) await enqueueProcessingJob(client, userId, bulletin.id, bulletin.fileHash);
  return bulletin;
}

async function upsertCloudBulletin(client: NonNullable<Awaited<ReturnType<typeof getSupabaseServerClient>>>, userId: string, bulletin: Bulletin) {
  const { error } = await client.from("bulletins").upsert({
    owner_user_id: userId,
    bulletin_number: bulletin.bulletinNumber,
    bulletin_type: bulletin.bulletinType,
    publication_date: bulletin.publicationDate,
    file_name: bulletin.fileName,
    file_hash: bulletin.fileHash,
    storage_path: bulletinPath(userId, bulletin.id),
    page_count: bulletin.pageCount,
    notice_count: bulletin.noticeCount,
    status: bulletin.status,
    processing_stage: bulletin.processingStage,
    last_error: bulletin.error ?? null,
    source_url: bulletin.sourceUrl ?? null,
    uploaded_at: bulletin.uploadedAt,
    source_fingerprint: bulletin.fileHash,
    processing_updated_at: new Date().toISOString()
  }, { onConflict: "owner_user_id,file_hash" });
  if (error) throw new Error(`Buletini nuk u regjistrua në cloud: ${error.message}`);
}

async function enqueueProcessingJob(client: NonNullable<Awaited<ReturnType<typeof getSupabaseServerClient>>>, userId: string, bulletinId: string, fingerprint: string): Promise<void> {
  const { data: storedBulletin } = await client.from("bulletins").select("id").eq("owner_user_id", userId).eq("file_hash", fingerprint).maybeSingle();
  const cloudBulletinId = storedBulletin?.id;
  if (!cloudBulletinId) return;
  const { error } = await client.from("bulletin_processing_jobs").upsert({
    owner_user_id: userId,
    bulletin_id: cloudBulletinId,
    status: "queued",
    stage: "queued",
    attempt_count: 0,
    source_fingerprint: fingerprint,
    last_error: null,
    next_run_at: new Date().toISOString(),
    locked_at: null,
    locked_by: null,
    completed_at: null
  }, { onConflict: "owner_user_id,bulletin_id,source_fingerprint" });
  if (error) throw new Error(`Puna e procesimit nuk u vendos në radhë: ${error.message}`);
}

export async function cloudRequestBulletinProcessing(id: string): Promise<Bulletin | null> {
  const { client, userId } = await loadState();
  const bulletin = getSnapshot().bulletins.find((item) => item.id === id);
  if (!bulletin) return null;
  if (!["failed", "needs_review"].includes(bulletin.status)) {
    throw new Error(bulletin.status === "processing" || bulletin.status === "queued"
      ? "Ky buletin është tashmë në procesim."
      : "Ky buletin është përpunuar. Riprovimi përdoret vetëm pas një dështimi ose kontrolli manual.");
  }
  bulletin.status = "queued";
  bulletin.processingStage = "queued";
  bulletin.error = null;
  await saveState(client, userId);
  await client.from("bulletins").update({ status: "queued", processing_stage: "queued", last_error: null, processing_updated_at: new Date().toISOString() }).eq("owner_user_id", userId).eq("file_hash", bulletin.fileHash);
  await enqueueProcessingJob(client, userId, id, bulletin.fileHash);
  return bulletin;
}

export async function cloudRemoveBulletin(id: string): Promise<Bulletin | null> {
  const { client, userId } = await loadState();
  const bulletin = getSnapshot().bulletins.find((item) => item.id === id);
  if (!bulletin) return null;
  if (["queued", "processing"].includes(bulletin.status)) throw new Error("Prisni që analizimi të përfundojë para se ta hiqni buletinin.");

  // Supabase Storage objects must be removed through the Storage API; deleting
  // only database metadata would leave the PDF orphaned in the private bucket.
  const { error: storageError } = await client.storage.from("app-bulletins").remove([bulletinPath(userId, id)]);
  if (storageError) throw new Error(`PDF-ja nuk u hoq nga cloud: ${storageError.message}`);

  const { error: databaseError } = await client.from("bulletins").delete()
    .eq("owner_user_id", userId).eq("file_hash", bulletin.fileHash);
  if (databaseError) throw new Error(`Buletini nuk u hoq nga databaza: ${databaseError.message}`);

  const removed = removeBulletin(id);
  if (removed) await saveState(client, userId);
  return removed;
}

export async function cloudProcessBulletin(id: string): Promise<void> {
  const { client, userId } = await loadState();
  const { data, error } = await client.storage.from("app-bulletins").download(bulletinPath(userId, id));
  if (error || !data) throw new Error(error?.message ?? "PDF-ja nuk u gjet në cloud.");
  importPersistedState(exportPersistedState(), new Map([[id, Buffer.from(await data.arrayBuffer())]]));
  const persistExtractedResults = async () => {
    const extracted = getSnapshot().bulletins.find((item) => item.id === id);
    await saveState(client, userId);
    if (extracted) await upsertCloudBulletin(client, userId, extracted);
  };
  await processBulletin(id, {
    // Keep the synchronous Vercel request short. AI enrichment is useful, but the
    // deterministic extraction and capability ranking are the source of truth.
    aiLimit: process.env.VERCEL ? 3 : undefined,
    afterDeterministic: persistExtractedResults
  });
  const refreshed = getSnapshot().bulletins.find((item) => item.id === id);
  await saveState(client, userId);
  if (refreshed) {
    const { error: updateError } = await client.from("bulletins").update({
      status: refreshed.status,
      processing_stage: refreshed.processingStage,
      page_count: refreshed.pageCount,
      notice_count: refreshed.noticeCount,
      last_error: refreshed.error ?? null,
      processing_updated_at: new Date().toISOString()
    }).eq("owner_user_id", userId).eq("file_hash", refreshed.fileHash);
    if (updateError) throw new Error(`Statusi i buletinit nuk u përditësua: ${updateError.message}`);

    // Immediate Vercel processing and the durable worker share the same queue.
    // Close only queued jobs here; a worker-owned `running` job remains under
    // the worker's claim and is completed by processing-worker.ts.
    const jobStatus = refreshed.status === "failed" ? "retryable" : "succeeded";
    const { error: jobError } = await client.from("bulletin_processing_jobs").update({
      status: jobStatus,
      stage: refreshed.status === "failed" ? "failed" : refreshed.processingStage,
      last_error: refreshed.error ?? null,
      completed_at: jobStatus === "succeeded" ? new Date().toISOString() : null,
      next_run_at: jobStatus === "retryable" ? new Date(Date.now() + 5 * 60_000).toISOString() : new Date().toISOString(),
      result_metadata: { bulletinId: refreshed.id, tenderCount: refreshed.noticeCount }
    }).eq("owner_user_id", userId).eq("source_fingerprint", refreshed.fileHash).eq("status", "queued");
    if (jobError) throw new Error(`Radha e procesimit nuk u përditësua: ${jobError.message}`);
  }
}

/**
 * Claims the durable queue row before Vercel's `after()` starts processing.
 * The standalone worker uses the same conditional claim, so exactly one of
 * them can process a bulletin and duplicate AI calls cannot race each other.
 */
export async function cloudProcessQueuedBulletin(id: string): Promise<boolean> {
  const { client, userId } = await loadState();
  const bulletin = getSnapshot().bulletins.find((item) => item.id === id);
  if (!bulletin) return false;
  const { data: jobs, error: readError } = await client.from("bulletin_processing_jobs")
    .select("id, attempt_count")
    .eq("owner_user_id", userId)
    .eq("source_fingerprint", bulletin.fileHash)
    .in("status", ["queued", "retryable"])
    .lte("next_run_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(1);
  if (readError) throw new Error(`Radha e procesimit nuk u lexua: ${readError.message}`);
  const job = jobs?.[0] as { id: string; attempt_count: number } | undefined;
  if (!job) return false;
  const lockId = `vercel-after-${randomUUID().slice(0, 8)}`;
  const { data: claimed, error: claimError } = await client.from("bulletin_processing_jobs")
    .update({
      status: "running", stage: "extracting", attempt_count: Number(job.attempt_count) + 1,
      locked_at: new Date().toISOString(), locked_by: lockId, last_error: null, started_at: new Date().toISOString()
    })
    .eq("id", job.id)
    .eq("owner_user_id", userId)
    .in("status", ["queued", "retryable"])
    .select("id, attempt_count")
    .maybeSingle();
  if (claimError) throw new Error(`Radha e procesimit nuk u rezervua: ${claimError.message}`);
  if (!claimed) return false;
  try {
    await cloudProcessBulletin(id);
    const refreshed = (await cloudSnapshot()).bulletins.find((item) => item.id === id);
    const failed = refreshed?.status === "failed";
    const attempts = Number(claimed.attempt_count ?? 1);
    const finalStatus = failed ? (attempts >= 3 ? "failed" : "retryable") : "succeeded";
    const { error: finishError } = await client.from("bulletin_processing_jobs").update({
      status: finalStatus,
      stage: failed ? "failed" : refreshed?.processingStage ?? "completed",
      last_error: failed ? refreshed?.error ?? "Procesimi i PDF-së dështoi." : null,
      next_run_at: finalStatus === "retryable" ? new Date(Date.now() + Math.min(60, 2 ** Math.max(0, attempts - 1)) * 60_000).toISOString() : new Date().toISOString(),
      locked_at: null, locked_by: null,
      completed_at: finalStatus === "succeeded" || finalStatus === "failed" ? new Date().toISOString() : null,
      result_metadata: { bulletinId: id, tenderCount: refreshed?.noticeCount ?? 0 }
    }).eq("id", job.id).eq("owner_user_id", userId).eq("locked_by", lockId);
    if (finishError) throw new Error(`Radha e procesimit nuk u mbyll: ${finishError.message}`);
    return true;
  } catch (error) {
    const attempts = Number(claimed.attempt_count ?? 1);
    const finalStatus = attempts >= 3 ? "failed" : "retryable";
    await client.from("bulletin_processing_jobs").update({
      status: finalStatus, stage: "failed", last_error: error instanceof Error ? error.message : String(error),
      next_run_at: finalStatus === "retryable" ? new Date(Date.now() + Math.min(60, 2 ** Math.max(0, attempts - 1)) * 60_000).toISOString() : new Date().toISOString(),
      locked_at: null, locked_by: null, completed_at: finalStatus === "failed" ? new Date().toISOString() : null
    }).eq("id", job.id).eq("owner_user_id", userId).eq("locked_by", lockId);
    throw error;
  }
}

export async function cloudBulletinFile(id: string): Promise<{ buffer: Buffer; fileName: string } | null> {
  const { client, userId } = await loadState();
  const bulletin = getSnapshot().bulletins.find((item) => item.id === id); if (!bulletin) return null;
  const { data, error } = await client.storage.from("app-bulletins").download(bulletinPath(userId, id));
  if (error || !data) return null;
  return { buffer: Buffer.from(await data.arrayBuffer()), fileName: bulletin.fileName };
}

export async function cloudAddCapabilityDocument(section: CapabilitySectionKey, category: string, expiresAt: string | null, name: string, mimeType: string, buffer: Buffer): Promise<CapabilityDocument> {
  const { client, userId } = await loadState();
  const value = addCapabilityDocument(section, category, expiresAt, name, mimeType, buffer);
  const { error } = await client.storage.from("capability-documents").upload(capabilityPath(userId, value), buffer, { upsert: false, contentType: mimeType });
  if (error) throw new Error(`Dokumenti nuk u ruajt në cloud: ${error.message}`);
  await saveState(client, userId); return value;
}

export async function cloudCapabilityDocument(id: string): Promise<{ metadata: CapabilityDocument; buffer: Buffer } | null> {
  const { client, userId } = await loadState();
  const metadata = getCapabilities().model.documents.find((item) => item.id === id); if (!metadata) return null;
  const { data, error } = await client.storage.from("capability-documents").download(capabilityPath(userId, metadata));
  if (error || !data) return null; return { metadata, buffer: Buffer.from(await data.arrayBuffer()) };
}

export async function cloudRemoveCapabilityDocument(id: string): Promise<boolean> {
  const { client, userId } = await loadState(); const metadata = getCapabilities().model.documents.find((item) => item.id === id); if (!metadata) return false;
  const { error } = await client.storage.from("capability-documents").remove([capabilityPath(userId, metadata)]);
  if (error) throw new Error(error.message);
  const removed = removeCapabilityDocument(id); if (removed) await saveState(client, userId); return removed;
}
