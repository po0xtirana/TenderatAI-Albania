import { NextResponse } from "next/server";
import { cloudProcessQueuedBulletin, cloudSnapshot } from "@/lib/cloud-store";

export const runtime = "nodejs";
export const maxDuration = 300;

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  if (!secret || request.headers.get("authorization") !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "E paautorizuar." }, { status: 401 });
  }
  const snapshot = await cloudSnapshot();
  const candidates = snapshot.bulletins
    .filter((item) => ["queued", "failed", "needs_review"].includes(item.status))
    .slice(0, 2);
  const processed: string[] = [];
  for (const bulletin of candidates) {
    if (await cloudProcessQueuedBulletin(bulletin.id)) processed.push(bulletin.id);
  }
  return NextResponse.json({ checked: candidates.length, processed });
}
