import { NextResponse } from "next/server";
import { enrichTenderInsightsData } from "@/lib/data";

export const runtime = "nodejs";

export async function POST(_request: Request, context: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await context.params;
    const record = await enrichTenderInsightsData(id);
    return record ? NextResponse.json(record) : NextResponse.json({ error: "Tenderi nuk u gjet." }, { status: 404 });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Analiza AI dështoi." }, { status: 500 });
  }
}
