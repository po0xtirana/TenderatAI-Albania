import { NextResponse } from "next/server";
import { readBulletinFile } from "@/lib/data";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const file = await readBulletinFile(id);
  if (!file) return NextResponse.json({ error: "PDF-ja nuk është e disponueshme në këtë sesion." }, { status: 404 });
  return new NextResponse(new Uint8Array(file.buffer), { headers: { "content-type": "application/pdf", "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(file.fileName)}`, "cache-control": "private, no-store" } });
}
