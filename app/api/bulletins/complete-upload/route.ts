import { after, NextResponse } from "next/server";
import { processBulletinData, queueBulletinData } from "@/lib/data";
import { getSupabaseServerClient, ensureCompanyWorkspaceId } from "@/lib/supabase-server";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { fileName?: unknown; path?: unknown } | null;
  const fileName = typeof body?.fileName === "string" ? body.fileName : "";
  const path = typeof body?.path === "string" ? body.path : "";
  if (!fileName.toLowerCase().endsWith(".pdf") || !path) return NextResponse.json({ error: "Ngarkimi i PDF-së nuk është i vlefshëm." }, { status: 400 });
  const client = await getSupabaseServerClient();
  if (!client) return NextResponse.json({ error: "Lidhja me ruajtjen cloud nuk është konfiguruar." }, { status: 503 });
  let cleanupPath = "";
  try {
    const ownerId = await ensureCompanyWorkspaceId(client);
    if (!path.startsWith(`${ownerId}/incoming/`) || !path.endsWith(".pdf")) return NextResponse.json({ error: "Rruga e ngarkimit nuk pranohet." }, { status: 400 });
    cleanupPath = path;
    const { data, error } = await client.storage.from("app-bulletins").download(path);
    if (error || !data) throw new Error(error?.message ?? "PDF-ja e ngarkuar nuk u gjet.");
    const buffer = Buffer.from(await data.arrayBuffer());
    const pdfHeader = buffer.indexOf("%PDF-", 0, "ascii");
    if (pdfHeader < 0 || pdfHeader > 1024) throw new Error("Skedari nuk ka një strukturë PDF të vlefshme.");
    const bulletin = await queueBulletinData(fileName, buffer);
    const { error: cleanupError } = await client.storage.from("app-bulletins").remove([path]);
    if (cleanupError) console.warn("[bulletin-upload] incoming file cleanup failed", cleanupError.message);
    else cleanupPath = "";
    after(async () => {
      try { await processBulletinData(bulletin.id); }
      catch (processingError) { console.error("[bulletin-processing] background processing failed", processingError); }
    });
    return NextResponse.json({ bulletin }, { status: 202 });
  } catch (error) {
    if (cleanupPath) {
      const { error: cleanupError } = await client.storage.from("app-bulletins").remove([cleanupPath]);
      if (cleanupError) console.warn("[bulletin-upload] failed upload cleanup failed", cleanupError.message);
    }
    return NextResponse.json({ error: error instanceof Error ? error.message : "Procesimi i PDF-së dështoi." }, { status: 500 });
  }
}
