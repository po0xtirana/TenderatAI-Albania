import { createHash } from "node:crypto";
import { ensureCompanyWorkspaceId, getSupabaseServerClient } from "./supabase-server";
import {
  activateCapabilities, addCapabilityDocument, exportPersistedState, getCapabilities,
  getCapabilityVersions, getSnapshot, getTender, getTenderDeliveryPlan, importPersistedState,
  processBulletin, queueBulletin, recordFeedback, removeCapabilityDocument, updateCapabilitySection, enrichTenderInsights,
  removeBulletin, updateCompany, updateTenderDeliveryAllocation, updateTenderWorkflow
} from "./store";
import type { LocalPersistedState } from "./store";
import type { AppSnapshot, Bulletin, CapabilityDocument, CapabilityReadiness, CapabilitySectionKey, CapabilityVersion, CompanyCapabilityModel, CompanyCapabilityProfile, TenderRecord, TenderWorkflowStatus } from "./types";

type CloudStateRow = { state: LocalPersistedState };

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
  const { data, error } = await client.from("workspace_state_snapshots").select("state").eq("owner_user_id", user.id).maybeSingle() as { data: CloudStateRow | null; error: { message: string } | null };
  if (error) throw new Error(error.message);
  if (data?.state) importPersistedState(data.state);
  return { client, userId: user.id };
}

async function saveState(client: NonNullable<Awaited<ReturnType<typeof getSupabaseServerClient>>>, userId: string): Promise<LocalPersistedState> {
  const state = exportPersistedState();
  const { error } = await client.from("workspace_state_snapshots").upsert({ owner_user_id: userId, schema_version: 1, state, updated_at: new Date().toISOString() });
  if (error) throw new Error(error.message);
  return state;
}

export async function cloudSnapshot(options: Parameters<typeof getSnapshot>[0] = {}): Promise<AppSnapshot> {
  await loadState();
  return getSnapshot(options);
}

export async function cloudTender(id: string): Promise<TenderRecord | null> { await loadState(); return getTender(id); }
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
  const bulletin = queueBulletin(fileName, buffer, { autoProcess: false });
  await upsertCloudBulletin(client, userId, bulletin);
  await saveState(client, userId);
  await enqueueProcessingJob(client, userId, bulletin.id, bulletin.fileHash);
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
