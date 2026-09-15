import { NextResponse } from "next/server";
import { updateWorkflowData } from "@/lib/data";
import type { TenderWorkflowStatus } from "@/lib/types";

export const runtime = "nodejs";

const statuses = new Set<TenderWorkflowStatus>(["new", "watching", "reviewing", "bid", "no_bid"]);

export async function POST(request: Request) {
  const body = await request.json().catch(() => null) as { tenderId?: string; status?: TenderWorkflowStatus } | null;
  if (!body?.tenderId || !body.status || !statuses.has(body.status)) return NextResponse.json({ error: "Gjendje e pavlefshme." }, { status: 400 });
  const record = await updateWorkflowData(body.tenderId, body.status);
  return record ? NextResponse.json({ workflowStatus: record.workflowStatus }) : NextResponse.json({ error: "Tenderi nuk u gjet." }, { status: 404 });
}
