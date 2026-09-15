import { NextResponse } from "next/server";
import { queueBulletinData } from "@/lib/data";

export const runtime = "nodejs";
export const maxDuration = 300;
const MAX_UPLOAD_BYTES = 50 * 1024 * 1024;

export async function POST(request: Request) {
  const form = await request.formData();
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Zgjidhni një PDF të buletinit." }, { status: 400 });
  if (!file.name.toLowerCase().endsWith(".pdf") && file.type !== "application/pdf") return NextResponse.json({ error: "Lejohen vetëm skedarët PDF." }, { status: 400 });
  if (file.size === 0 || file.size > MAX_UPLOAD_BYTES) return NextResponse.json({ error: "PDF-ja duhet të jetë më e vogël se 50 MB." }, { status: 400 });
  const buffer = Buffer.from(await file.arrayBuffer());
  const pdfHeader = buffer.indexOf("%PDF-", 0, "ascii");
  if (pdfHeader < 0 || pdfHeader > 1024) return NextResponse.json({ error: "Skedari nuk ka një strukturë PDF të vlefshme." }, { status: 415 });
  const bulletin = await queueBulletinData(file.name, buffer);
  return NextResponse.json({ bulletin }, { status: 202 });
}
