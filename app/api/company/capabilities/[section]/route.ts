import { NextResponse } from "next/server";
import { updateCapabilityData } from "@/lib/data";
import type { CapabilitySectionKey } from "@/lib/types";

export const runtime = "nodejs";
const sections = new Set<CapabilitySectionKey>(["identity", "work", "geography", "compliance", "people", "crews", "equipment", "financial", "experience", "partners", "rules"]);

export async function PATCH(request: Request, context: { params: Promise<{ section: string }> }) {
  const { section } = await context.params;
  if (!sections.has(section as CapabilitySectionKey)) return NextResponse.json({ error: "Seksioni nuk ekziston." }, { status: 404 });
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object" || Array.isArray(body)) return NextResponse.json({ error: "Të dhëna të pavlefshme." }, { status: 400 });
  try { return NextResponse.json(await updateCapabilityData(section as CapabilitySectionKey, body as Record<string, unknown>)); }
  catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : "Ruajtja dështoi." }, { status: 400 }); }
}
