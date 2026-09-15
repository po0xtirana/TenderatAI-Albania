import { NextResponse } from "next/server";
import { updateTenderActionData } from "@/lib/data";
import type { TenderActionStatus } from "@/lib/types";

export const runtime = "nodejs";
const actionStatuses = new Set<TenderActionStatus>(["todo", "in_progress", "waiting", "completed", "not_applicable"]);

export async function PATCH(request: Request, context: { params: Promise<{ id: string; actionId: string }> }) {
  const { id, actionId } = await context.params;
  const body = await request.json().catch(() => null) as { status?: unknown; completionNote?: unknown; dueDate?: unknown } | null;
  if (!body) return NextResponse.json({ error: "Ndryshimi mungon." }, { status: 400 });
  const patch: { status?: TenderActionStatus; completionNote?: string; dueDate?: string | null } = {};
  if (body.status !== undefined) {
    if (typeof body.status !== "string" || !actionStatuses.has(body.status as TenderActionStatus)) return NextResponse.json({ error: "Statusi i veprimit nuk është i vlefshëm." }, { status: 400 });
    patch.status = body.status as TenderActionStatus;
  }
  if (body.completionNote !== undefined) {
    if (typeof body.completionNote !== "string") return NextResponse.json({ error: "Shënimi duhet të jetë tekst." }, { status: 400 });
    patch.completionNote = body.completionNote;
  }
  if (body.dueDate !== undefined) {
    if (body.dueDate !== null && (typeof body.dueDate !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(body.dueDate))) return NextResponse.json({ error: "Data nuk është e vlefshme." }, { status: 400 });
    patch.dueDate = body.dueDate as string | null;
  }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Nuk u gjet ndryshim i vlefshëm." }, { status: 400 });
  const record = await updateTenderActionData(id, actionId, patch);
  return record?.decisionBrief ? NextResponse.json(record.decisionBrief) : NextResponse.json({ error: "Veprimi nuk u gjet." }, { status: 404 });
}
