import { after, NextResponse } from "next/server";
import { processQueuedBulletinData, readSnapshot, requestBulletinProcessingData } from "@/lib/data";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const bulletin = (await readSnapshot()).bulletins.find((item) => item.id === id);
  if (!bulletin) return NextResponse.json({ error: "Buletini nuk u gjet." }, { status: 404 });
  if (!["failed", "needs_review"].includes(bulletin.status)) {
    return NextResponse.json({ error: ["queued", "processing"].includes(bulletin.status) ? "Buletini është tashmë në procesim." : "Buletini është përpunuar; riprovimi nuk është i nevojshëm." }, { status: 409 });
  }
  const queued = await requestBulletinProcessingData(id) ?? bulletin;
  after(async () => {
    try { await processQueuedBulletinData(id); }
    catch (processingError) { console.error("[bulletin-processing] background retry failed", processingError); }
  });
  return NextResponse.json({ accepted: true, bulletin: queued }, { status: 202 });
}
