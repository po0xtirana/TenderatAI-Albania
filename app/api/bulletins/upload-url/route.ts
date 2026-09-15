import { randomUUID } from "crypto";
import { NextResponse } from "next/server";
import { getSupabaseServerClient, ensureCompanyWorkspaceId } from "@/lib/supabase-server";

export const runtime = "nodejs";
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { fileName?: unknown; size?: unknown; contentType?: unknown } | null;
  const fileName = typeof body?.fileName === "string" ? body.fileName : "";
  const size = typeof body?.size === "number" ? body.size : 0;
  const contentType = body?.contentType === "application/pdf" ? "application/pdf" : "application/pdf";
  if (!fileName.toLowerCase().endsWith(".pdf")) return NextResponse.json({ error: "Lejohen vetëm skedarët PDF." }, { status: 400 });
  if (!Number.isFinite(size) || size <= 0 || size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "PDF-ja duhet të jetë më e vogël se 50 MB." }, { status: 400 });
  const client = await getSupabaseServerClient();
  if (!client) return NextResponse.json({ error: "Lidhja me ruajtjen cloud nuk është konfiguruar." }, { status: 503 });
  try {
    const ownerId = await ensureCompanyWorkspaceId(client);
    const path = `${ownerId}/incoming/${randomUUID()}.pdf`;
    const { data, error } = await client.storage.from("app-bulletins").createSignedUploadUrl(path);
    if (error || !data) throw new Error(error?.message ?? "Nuk u krijua lidhja e ngarkimit.");
    return NextResponse.json({ path, uploadUrl: data.signedUrl, token: data.token, contentType });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Nuk u krijua lidhja e ngarkimit." }, { status: 500 });
  }
}
