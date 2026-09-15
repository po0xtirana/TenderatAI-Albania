import { NextResponse } from "next/server";
import { recordTenderFeedback } from "@/lib/data";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { tenderId?: string; relevant?: boolean } | null;
  if (!body?.tenderId || typeof body.relevant !== "boolean") return NextResponse.json({ error: "Feedback i pavlefshëm." }, { status: 400 });
  const record = await recordTenderFeedback(body.tenderId, body.relevant);
  return record ? NextResponse.json({ match: record.match }) : NextResponse.json({ error: "Tenderi nuk u gjet." }, { status: 404 });
}
