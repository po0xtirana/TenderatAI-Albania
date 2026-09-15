import { NextResponse } from "next/server";
import { updateTenderDecisionData } from "@/lib/data";
import type { TenderDecisionStatus } from "@/lib/types";

export const runtime = "nodejs";
const decisionStatuses = new Set<TenderDecisionStatus>(["continue", "conditional", "watch", "decline", "submitted"]);

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { status?: unknown; reason?: unknown; acceptedRisks?: unknown } | null;
  if (!body || typeof body.status !== "string" || !decisionStatuses.has(body.status as TenderDecisionStatus)) return NextResponse.json({ error: "Zgjidhni një vendim të vlefshëm." }, { status: 400 });
  if (body.reason !== undefined && typeof body.reason !== "string") return NextResponse.json({ error: "Arsyeja duhet të jetë tekst." }, { status: 400 });
  if (body.acceptedRisks !== undefined && (!Array.isArray(body.acceptedRisks) || body.acceptedRisks.some((item) => typeof item !== "string"))) return NextResponse.json({ error: "Rreziqet e pranuara nuk janë të vlefshme." }, { status: 400 });
  const record = await updateTenderDecisionData(id, body.status as TenderDecisionStatus, typeof body.reason === "string" ? body.reason : "", Array.isArray(body.acceptedRisks) ? body.acceptedRisks as string[] : []);
  return record?.decisionBrief ? NextResponse.json(record.decisionBrief) : NextResponse.json({ error: "Tenderi nuk u gjet." }, { status: 404 });
}
