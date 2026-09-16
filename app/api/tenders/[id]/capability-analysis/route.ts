import { NextResponse } from "next/server";
import { readTender } from "@/lib/data";

export const runtime = "nodejs";
export async function GET(_request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params; const record = await readTender(id);
  if (!record) return NextResponse.json({ error: "Tenderi nuk u gjet." }, { status: 404 });
  return NextResponse.json({
    tenderId: id,
    score: record.match.score,
    observedFitScore: record.match.observedFitScore,
    confidenceScore: record.match.confidenceScore,
    fitRange: { low: record.match.fitRangeLow, high: record.match.fitRangeHigh },
    decision: record.match.decision,
    recommendation: record.match.recommendation,
    recommendationReason: record.match.recommendationReason,
    eligibility: record.match.eligibility,
    capabilityVersion: record.match.capabilityVersion,
    scoringModelVersion: record.match.scoringModelVersion,
    calibrationVersion: record.match.calibrationVersion,
    components: record.match.components,
    criterionResults: record.match.criterionResults,
    blockers: record.match.blockers,
    criticalUnknowns: record.match.criticalUnknowns,
    confirmedCapabilities: record.match.confirmedCapabilities,
    capabilityGaps: record.match.capabilityGaps,
    staleInformation: record.match.staleInformation,
    missingInformation: record.match.missingInformation,
    requirementMatches: record.match.requirementMatches,
  });
}
