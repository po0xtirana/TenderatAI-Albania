import { NextResponse } from "next/server";
import { readTenderDeliveryPlan, updateTenderDelivery } from "@/lib/data";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const plan = await readTenderDeliveryPlan(id);
  return plan ? NextResponse.json(plan) : NextResponse.json({ error: "Plani i realizimit nuk u gjet." }, { status: 404 });
}

export async function PATCH(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const body = await request.json().catch(() => null) as { allocationId?: unknown; patch?: unknown } | null;
  if (!body || typeof body.allocationId !== "string" || !body.patch || typeof body.patch !== "object" || Array.isArray(body.patch)) return NextResponse.json({ error: "Përcaktoni allocationId dhe ndryshimin e vlefshëm." }, { status: 400 });
  const rawPatch = body.patch as Record<string, unknown>;
  const patch: Record<string, unknown> = {};
  const sources = new Set(["internal", "partner", "rental", "hybrid", "uncovered"]);
  const statuses = new Set(["suggested", "confirmed", "overridden"]);
  if (rawPatch.source !== undefined) { if (typeof rawPatch.source !== "string" || !sources.has(rawPatch.source)) return NextResponse.json({ error: "Burimi i punës nuk është i vlefshëm." }, { status: 400 }); patch.source = rawPatch.source; }
  if (rawPatch.status !== undefined) { if (typeof rawPatch.status !== "string" || !statuses.has(rawPatch.status)) return NextResponse.json({ error: "Statusi i ndarjes nuk është i vlefshëm." }, { status: 400 }); patch.status = rawPatch.status; }
  if (rawPatch.sharePercent !== undefined) { if (typeof rawPatch.sharePercent !== "number" || !Number.isFinite(rawPatch.sharePercent) || rawPatch.sharePercent < 0 || rawPatch.sharePercent > 100) return NextResponse.json({ error: "Përqindja duhet të jetë midis 0 dhe 100." }, { status: 400 }); patch.sharePercent = rawPatch.sharePercent; }
  if (!Object.keys(patch).length) return NextResponse.json({ error: "Ndryshimi nuk përmban fusha të lejuara." }, { status: 400 });
  try {
    const record = await updateTenderDelivery(id, body.allocationId, patch);
    return record?.deliveryPlan ? NextResponse.json(record.deliveryPlan) : NextResponse.json({ error: "Plani ose ndarja nuk u gjet." }, { status: 404 });
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Ndryshimi dështoi." }, { status: 400 }); }
}
