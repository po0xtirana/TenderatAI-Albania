import { NextResponse } from "next/server";
import { readTender } from "@/lib/data";

export const runtime = "nodejs";

export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params;
  const tender = await readTender(id);
  return tender ? NextResponse.json(tender) : NextResponse.json({ error: "Tenderi nuk u gjet." }, { status: 404 });
}
