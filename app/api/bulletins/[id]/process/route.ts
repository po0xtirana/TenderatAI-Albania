import { after, NextResponse } from "next/server";
import { processBulletinData, readSnapshot, requestBulletinProcessingData } from "@/lib/data";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const bulletin = (await readSnapshot()).bulletins.find((item) => item.id === id);
  if (!bulletin) return NextResponse.json({ error: "Buletini nuk u gjet." }, { status: 404 });
  const queued = await requestBulletinProcessingData(id) ?? bulletin;
  after(async () => {
    try { await processBulletinData(id); }
    catch (processingError) { console.error("[bulletin-processing] background retry failed", processingError); }
  });
  return NextResponse.json({ accepted: true, bulletin: queued }, { status: 202 });
}
