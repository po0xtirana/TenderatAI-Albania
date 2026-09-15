import { NextResponse } from "next/server";
import { readTender } from "@/lib/data";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const record = await readTender(id);
  return record?.decisionBrief
    ? NextResponse.json(record.decisionBrief)
    : NextResponse.json({ error: "Përmbledhja e vendimit nuk u gjet." }, { status: 404 });
}

/** Rebuild the deterministic brief from the current tender, capability version, and delivery plan. */
export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const record = await readTender(id);
  return record?.decisionBrief
    ? NextResponse.json(record.decisionBrief)
    : NextResponse.json({ error: "Tenderi nuk u gjet." }, { status: 404 });
}
