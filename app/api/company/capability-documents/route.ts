import { NextResponse } from "next/server";
import { addCapabilityDocumentData } from "@/lib/data";
import type { CapabilitySectionKey } from "@/lib/types";

export const runtime = "nodejs";
const sections = new Set<CapabilitySectionKey>(["identity", "work", "geography", "compliance", "people", "crews", "equipment", "financial", "experience", "partners", "rules"]);
const allowedTypes = new Set(["application/pdf", "image/png", "image/jpeg", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);

function hasValidSignature(mimeType: string, buffer: Buffer): boolean {
  if (mimeType === "application/pdf") { const index = buffer.indexOf("%PDF-", 0, "ascii"); return index >= 0 && index <= 1024; }
  if (mimeType === "image/png") return buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/jpeg") return buffer.length >= 3 && buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  if (mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return buffer.length >= 4 && buffer[0] === 0x50 && buffer[1] === 0x4b;
  return false;
}

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  const section = String(form.get("section") ?? "") as CapabilitySectionKey;
  const category = String(form.get("category") ?? "Dokument mbështetës").trim();
  const expiresAt = String(form.get("expiresAt") ?? "").trim() || null;
  if (!(file instanceof File) || !sections.has(section)) return NextResponse.json({ error: "Skedari ose seksioni nuk është i vlefshëm." }, { status: 400 });
  if (file.size === 0) return NextResponse.json({ error: "Skedari është bosh." }, { status: 400 });
  if (file.size > 15 * 1024 * 1024) return NextResponse.json({ error: "Skedari nuk mund të kalojë 15 MB." }, { status: 413 });
  if (!allowedTypes.has(file.type)) return NextResponse.json({ error: "Lejohen PDF, PNG, JPG dhe DOCX." }, { status: 415 });
  if (!category || category.length > 120) return NextResponse.json({ error: "Kategoria e dokumentit nuk është e vlefshme." }, { status: 400 });
  if (expiresAt && (!/^\d{4}-\d{2}-\d{2}$/.test(expiresAt) || Number.isNaN(Date.parse(`${expiresAt}T12:00:00Z`)))) return NextResponse.json({ error: "Data e skadimit nuk është e vlefshme." }, { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer());
  if (!hasValidSignature(file.type, buffer)) return NextResponse.json({ error: "Përmbajtja e skedarit nuk përputhet me formatin e deklaruar." }, { status: 415 });
  const document = await addCapabilityDocumentData(section, category, expiresAt, file.name, file.type, buffer);
  return NextResponse.json({ document }, { status: 201 });
}
