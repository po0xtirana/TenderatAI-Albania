import { NextResponse } from "next/server";
import { readCapabilityDocument, removeCapabilityDocumentData } from "@/lib/data";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; const document = await readCapabilityDocument(id);
  if (!document) return NextResponse.json({ error: "Dokumenti nuk u gjet." }, { status: 404 });
  return new NextResponse(new Uint8Array(document.buffer), { headers: { "content-type": document.metadata.mimeType, "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(document.metadata.name)}`, "cache-control": "private, no-store" } });
}
export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  return (await removeCapabilityDocumentData(id)) ? NextResponse.json({ removed: true }) : NextResponse.json({ error: "Dokumenti nuk u gjet." }, { status: 404 });
}
