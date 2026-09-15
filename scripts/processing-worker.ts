import { randomUUID } from "node:crypto";
import { cloudProcessBulletin } from "@/lib/cloud-store";
import { cloudSnapshot } from "@/lib/cloud-store";
import { getCompanyWorkspaceId } from "@/lib/supabase-server";
import { getSupabaseServiceClient } from "@/lib/supabase";

const pollMs = Math.max(2_000, Number.parseInt(process.env.WORKER_POLL_MS ?? "10000", 10) || 10_000);
const workerId = `tenderat-worker-${process.pid}-${randomUUID().slice(0, 8)}`;

function configuration() {
  const client = getSupabaseServiceClient();
  const ownerId = getCompanyWorkspaceId();
  if (!client || !ownerId) throw new Error("Worker-i kërkon Supabase URL, çelësin privat ekzistues dhe COMPANY_WORKSPACE_ID.");
  return { client, ownerId };
}

async function claimNext() {
  const { client, ownerId } = configuration();
  const { data: jobs, error } = await client.from("bulletin_processing_jobs")
    .select("id, bulletin_id, source_fingerprint, attempt_count")
    .eq("owner_user_id", ownerId)
    .in("status", ["queued", "retryable"])
    .lte("next_run_at", new Date().toISOString())
    .order("created_at", { ascending: true })
    .limit(1);
  if (error) throw new Error(`Worker queue read: ${error.message}`);
  const job = jobs?.[0] as { id: string; bulletin_id: string; source_fingerprint: string; attempt_count: number } | undefined;
  if (!job) return null;
  const { data: claimed, error: claimError } = await client.from("bulletin_processing_jobs")
    .update({ status: "running", stage: "extracting", attempt_count: job.attempt_count + 1, locked_at: new Date().toISOString(), locked_by: workerId, last_error: null, started_at: new Date().toISOString() })
    .eq("id", job.id)
    .eq("owner_user_id", ownerId)
    .in("status", ["queued", "retryable"])
    .select("id, bulletin_id, source_fingerprint, attempt_count")
    .maybeSingle();
  if (claimError) throw new Error(`Worker queue claim: ${claimError.message}`);
  return claimed as typeof job | null;
}

async function finish(jobId: string, status: "succeeded" | "retryable" | "failed", stage: string, errorMessage: string | null, resultMetadata: Record<string, unknown> = {}) {
  const { client, ownerId } = configuration();
  const attempt = Number((await client.from("bulletin_processing_jobs").select("attempt_count").eq("id", jobId).eq("owner_user_id", ownerId).maybeSingle()).data?.attempt_count ?? 1);
  const retry = status === "retryable";
  const nextRun = new Date(Date.now() + Math.min(60, 2 ** Math.max(0, attempt - 1)) * 60_000).toISOString();
  const { error } = await client.from("bulletin_processing_jobs").update({
    status, stage, last_error: errorMessage, result_metadata: resultMetadata,
    next_run_at: retry ? nextRun : new Date().toISOString(), locked_at: null, locked_by: null,
    completed_at: status === "succeeded" || status === "failed" ? new Date().toISOString() : null
  }).eq("id", jobId).eq("owner_user_id", ownerId);
  if (error) throw new Error(`Worker queue finish: ${error.message}`);
}

async function processOne() {
  const job = await claimNext();
  if (!job) return false;
  try {
    const snapshot = await cloudSnapshot();
    const localBulletin = snapshot.bulletins.find((item) => item.fileHash === job.source_fingerprint);
    if (!localBulletin) throw new Error("Buletini i kësaj pune nuk ekziston në workspace snapshot.");
    await cloudProcessBulletin(localBulletin.id);
    const refreshed = await cloudSnapshot();
    const bulletin = refreshed.bulletins.find((item) => item.id === localBulletin.id);
    if (bulletin?.status === "failed") {
      const attempts = Number(job.attempt_count);
      await finish(job.id, attempts >= 3 ? "failed" : "retryable", "failed", bulletin.error ?? "Procesimi i PDF-së dështoi.", { bulletinId: localBulletin.id });
    } else {
      await finish(job.id, "succeeded", bulletin?.processingStage ?? "completed", null, { bulletinId: localBulletin.id, tenderCount: refreshed.tenders.filter((item) => item.tender.bulletinId === localBulletin.id).length });
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const attempts = Number(job.attempt_count);
    await finish(job.id, attempts >= 3 ? "failed" : "retryable", "failed", message, { bulletinId: job.bulletin_id });
  }
  return true;
}

async function main() {
  const once = process.argv.includes("--once");
  console.log(`[processing-worker] started ${workerId}`);
  do {
    try {
      const didWork = await processOne();
      if (!once && !didWork) await new Promise((resolve) => setTimeout(resolve, pollMs));
    } catch (error) {
      console.error("[processing-worker] loop failed", error instanceof Error ? error.stack : String(error));
      if (!once) await new Promise((resolve) => setTimeout(resolve, pollMs));
    }
  } while (!once);
}

void main();
