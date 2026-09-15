import { NextResponse } from "next/server";
import { readSnapshot, requestBulletinProcessingData } from "@/lib/data";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const bulletin = (await readSnapshot()).bulletins.find((item) => item.id === id);
  if (!bulletin) return NextResponse.json({ error: "Buletini nuk u gjet." }, { status: 404 });
  const queued = await requestBulletinProcessingData(id);
  return NextResponse.json({ accepted: Boolean(queued), bulletin: queued ?? bulletin }, { status: 202 });
}
