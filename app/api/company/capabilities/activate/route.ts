import { NextResponse } from "next/server";
import { activateCapabilityData } from "@/lib/data";

export const runtime = "nodejs";
export async function POST() {
  try { return NextResponse.json(await activateCapabilityData()); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Aktivizimi dështoi." }, { status: 409 }); }
}
