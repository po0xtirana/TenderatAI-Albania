import { recalculateDeliverySummary, generateDeliveryPlan } from "./delivery-plan";
import { matchTender } from "./matcher";
import type { MatchCalibration } from "./matcher-v2";
import type { CompanyCapabilityModel, CompanyCapabilityProfile, TenderDeliveryPlan, TenderMatch, TenderNotice } from "./types";

export const ASSESSMENT_MODEL_VERSION = "tender-assessment-v1";

function mergeReviewedAllocations(generated: TenderDeliveryPlan, existing?: TenderDeliveryPlan): TenderDeliveryPlan {
  if (!existing) return generated;
  const currentPackageIds = new Set(generated.workPackages.map((item) => item.id));
  const reviewed = existing.allocations.filter((item) => item.status !== "suggested" && currentPackageIds.has(item.workPackageId));
  if (!reviewed.length) return generated;
  const reviewedPackages = new Set(reviewed.map((item) => item.workPackageId));
  return recalculateDeliverySummary({
    ...generated,
    allocations: [
      ...generated.allocations.filter((item) => !reviewedPackages.has(item.workPackageId)),
      ...reviewed,
    ],
  });
}

export function assessTender(input: {
  tender: TenderNotice;
  profile: CompanyCapabilityProfile;
  model: CompanyCapabilityModel;
  calibration?: MatchCalibration;
  existingPlan?: TenderDeliveryPlan;
}): { match: TenderMatch; deliveryPlan: TenderDeliveryPlan } {
  const generated = generateDeliveryPlan(input.tender, input.model);
  const deliveryPlan = mergeReviewedAllocations(generated, input.existingPlan);
  const match = matchTender(input.tender, input.profile, input.model, input.calibration, deliveryPlan);
  return { match, deliveryPlan };
}
