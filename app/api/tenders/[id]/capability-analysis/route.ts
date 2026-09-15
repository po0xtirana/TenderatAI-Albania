import { NextResponse } from "next/server";
import { readTender } from "@/lib/data";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; const record = await readTender(id);
  if (!record) return NextResponse.json({ error: "Tenderi nuk u gjet." }, { status: 404 });
  return NextResponse.json({ tenderId: id, score: record.match.score, decision: record.match.decision, capabilityVersion: record.match.capabilityVersion, components: record.match.components, blockers: record.match.blockers, confirmedCapabilities: record.match.confirmedCapabilities, capabilityGaps: record.match.capabilityGaps, staleInformation: record.match.staleInformation, missingInformation: record.match.missingInformation, requirementMatches: record.match.requirementMatches });
}
