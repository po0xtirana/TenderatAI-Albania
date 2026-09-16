export type ProcessingStatus = "queued" | "processing" | "completed" | "needs_review" | "failed";
export type TenderDecision = "high_fit" | "good_fit" | "review" | "low_fit" | "blocked";
/** Eligibility answers whether a confirmed tender requirement can be met. It is
 * deliberately separate from the commercial fit score. */
export type TenderEligibility = "eligible" | "eligibility_pending" | "not_eligible";
export type TenderWorkflowStatus = "new" | "watching" | "reviewing" | "bid" | "no_bid";

export type Evidence = { page: number; text: string; confidence: number };

export type Bulletin = {
  id: string; bulletinNumber: string; bulletinType: "regular" | "special" | "unknown";
  publicationDate: string; fileName: string; fileHash: string; pageCount: number; noticeCount: number;
  uploadedAt: string; status: ProcessingStatus; processingStage: string; error?: string | null; sourceUrl?: string | null;
};

export type TenderNotice = {
  id: string; bulletinId: string; referenceNumber: string; parentReferenceNumber?: string | null; lotNumber?: string | null;
  contractingAuthority: string; authorityId?: string | null; address?: string | null; contactEmail?: string | null; procedureType: string;
  contractObject: string; cpvCodes: string[]; limitFundAll: number | null; vatStatus: string | null;
  financingText?: string | null; durationText: string | null; submissionDeadline: string | null; republished: boolean;
  sourcePages: { start: number; end: number }; sourceText: string; extractionConfidence: number;
  lifecycleStatus: "active" | "expired" | "cancelled" | "correction"; createdAt: string;
};

/** Compatibility projection used by the existing dashboard and ingestion flow. */
export type CompanyCapabilityProfile = {
  companyName: string; trades: string[]; cpvPrefixes: string[]; serviceRegions: string[];
  minValueAll: number | null; maxValueAll: number | null; licences: string[]; preferredAuthorities: string[];
  excludedTerms: string[]; availableEmployees: number | null; availableEquipment: string[];
  maxConcurrentProjects: number | null; currentProjects: number;
};

export type CapabilitySectionKey = "identity" | "work" | "geography" | "compliance" | "people" | "crews" | "equipment" | "financial" | "experience" | "partners" | "rules";

export type CapabilityIdentity = {
  legalName: string; tradingName: string; nipt: string; entityType: string; registeredAddress: string;
  phone: string; email: string; website: string; yearFounded: number | null;
  procurementRegistered: boolean; description: string;
};

export type OperatingLocation = { id: string; name: string; address: string; city: string; region: string; isPrimary: boolean; active: boolean };

export type WorkCapability = {
  id: string; trade: string; cpvPrefixes: string[]; projectTypes: string[]; buildingTypes: string[];
  deliveryMethod: "self_performed" | "subcontracted" | "both"; minProjectValueAll: number | null;
  preferredProjectValueAll: number | null; maxProjectValueAll: number | null; excludedWork: string[]; active: boolean;
};

export type ServiceArea = {
  id: string; region: string; municipalities: string[]; travelRadiusKm: number | null; mobilizationDays: number | null;
  remoteLimitations: string; temporarySiteCapable: boolean; active: boolean;
};

export type ComplianceRecord = {
  id: string; recordType: "licence" | "certification" | "insurance" | "compliance"; name: string;
  category: string; subcategory: string; level: string; issuer: string; referenceNumber: string;
  issueDate: string | null; expiryDate: string | null; status: "valid" | "pending" | "expired";
  documentIds: string[]; active: boolean;
};

export type KeyPerson = {
  id: string; fullName: string; role: string; discipline: string; skills: string[]; yearsExperience: number | null;
  education: string; licences: string[]; certifications: string[]; availableFrom: string | null;
  availabilityPercent: number; documentIds: string[]; active: boolean;
};

export type LabourPool = {
  id: string; role: string; skills: string[]; skillLevel: "entry" | "qualified" | "specialist";
  headcount: number; availableHeadcount: number; availableFrom: string | null; updatedAt: string; active: boolean;
};

export type CrewRole = { id: string; role: string; skill: string; headcount: number };
export type CrewCapability = {
  id: string; name: string; workCategory: string; roles: CrewRole[]; availableCrewCount: number;
  currentAssignment: string; availableFrom: string | null; maxShiftHours: number | null;
  maxConcurrentProjects: number; productionCapacity: string; active: boolean;
};

export type EquipmentResource = {
  id: string; resourceType: "equipment" | "vehicle"; name: string; category: string;
  ownership: "owned" | "leased" | "rentable"; model: string; quantity: number; availableQuantity: number;
  capacity: string; location: string; availableFrom: string | null;
  condition: "excellent" | "good" | "service_due" | "unavailable"; inspectionExpiry: string | null;
  limitations: string; rentalFallback: boolean; updatedAt: string; active: boolean;
};

export type TurnoverYear = { id: string; year: number; amountAll: number };
export type FinancialCapacity = {
  turnoverHistory: TurnoverYear[]; workingCapitalAll: number | null; creditFacilitiesAll: number | null;
  availableProjectFinancingAll: number | null; maxContractValueAll: number | null; currentBacklogAll: number | null;
  maxConcurrentCommitmentAll: number | null; bidSecurityLimitAll: number | null;
  performanceGuaranteeLimitAll: number | null; insuranceLimitAll: number | null; bondingLimitAll: number | null; updatedAt: string;
};

export type ReferenceProject = {
  id: string; title: string; client: string; authority: string; cpvCodes: string[]; workTypes: string[];
  valueAll: number | null; region: string; startDate: string | null; endDate: string | null;
  role: "main_contractor" | "joint_venture" | "subcontractor"; status: "completed" | "in_progress";
  outcome: string; referenceContact: string; documentIds: string[]; active: boolean;
};

export type CapabilityPartner = {
  id: string; name: string; partnerType: "subcontractor" | "strategic_partner" | "joint_venture" | "equipment_rental";
  categories: string[]; licences: string[]; regions: string[]; availability: string;
  dependencyRisk: "low" | "medium" | "high"; jointVentureReady: boolean; active: boolean;
  nipt?: string; contactName?: string; phone?: string; email?: string; approvalStatus?: "approved" | "pending" | "blocked";
  workTypes?: string[]; cpvCodes?: string[]; excludedWork?: string[]; leadTimeDays?: number | null;
  maxContractValueAll?: number | null; maxConcurrentProjects?: number | null; notes?: string;
  capabilities?: PartnerWorkCapability[]; resources?: PartnerResource[]; rates?: PartnerRate[]; performance?: PartnerPerformance;
};

export type PartnerWorkCapability = {
  id: string; name: string; category: string; cpvCodes: string[]; tasks: string[]; deliveryMode: "execution" | "specialist" | "licence_support";
  headcount: number; crewCount: number; availableFrom: string | null; capacityNotes: string; active: boolean;
};

export type PartnerResource = {
  id: string; resourceType: "equipment" | "vehicle" | "crew"; name: string; model: string; category: string;
  quantity: number; availableQuantity: number; capacity: string; location: string; availableFrom: string | null;
  operatorIncluded: boolean; fuelIncluded: boolean; transportIncluded: boolean; rentalMinimumDays: number | null;
  condition: "excellent" | "good" | "service_due" | "unavailable"; inspectionExpiry: string | null; active: boolean;
};

export type PartnerRate = {
  id: string; scope: string; resourceId?: string; unit: "hour" | "day" | "month" | "unit" | "lump_sum";
  amountAll: number; vatIncluded: boolean; minimumCommitment: number | null; validFrom: string | null; validUntil: string | null; notes: string;
};

export type PartnerPerformance = { completedProjects: number; onTimeRate: number | null; qualityRating: number | null; lastUsedAt: string | null; notes: string };

export type ActiveCommitment = {
  id: string; projectName: string; workType: string; startDate: string | null; endDate: string | null;
  committedPeople: number; committedCrews: number; committedEquipment: string[]; active: boolean;
};

export type BidRule = { id: string; name: string; condition: string; severity: "blocker" | "warning" | "preference"; active: boolean };
export type BidPreferences = {
  preferredAuthorities: string[]; excludedAuthorities: string[]; preferredProjectTypes: string[];
  excludedProjectTypes: string[]; minimumLeadDays: number | null; maxContractMonths: number | null;
  maxConcurrentProjects: number | null; acceptedPaymentDays: number | null; requiresAdvancePayment: boolean;
  maxLiquidatedDamagesPercent: number | null; jointVentureAllowed: boolean; rules: BidRule[];
};

export type CapabilityDocument = {
  id: string; section: CapabilitySectionKey; name: string; mimeType: string; fileSize: number;
  category: string; uploadedAt: string; expiresAt: string | null;
};

export type CapabilitySnapshot = {
  identity: CapabilityIdentity; operatingLocations: OperatingLocation[]; workCapabilities: WorkCapability[];
  serviceAreas: ServiceArea[]; complianceRecords: ComplianceRecord[]; keyPeople: KeyPerson[];
  labourPools: LabourPool[]; crews: CrewCapability[]; equipment: EquipmentResource[];
  financialCapacity: FinancialCapacity; referenceProjects: ReferenceProject[]; partners: CapabilityPartner[];
  commitments: ActiveCommitment[]; bidPreferences: BidPreferences;
};

export type CapabilityVersion = { id: string; version: number; activatedAt: string; readinessScore: number; snapshot: CapabilitySnapshot };
export type CompanyCapabilityModel = CapabilitySnapshot & {
  status: "draft" | "active"; activeVersion: number; draftUpdatedAt: string; documents: CapabilityDocument[];
};

export type ReadinessItem = { section: CapabilitySectionKey; code: string; message: string; action: string };
export type CapabilityReadiness = {
  overallScore: number; sectionScores: Record<CapabilitySectionKey, number>; blockingItems: ReadinessItem[];
  warningItems: ReadinessItem[]; expiredItems: ReadinessItem[]; staleItems: ReadinessItem[];
  readyForMatching: boolean; lastCalculatedAt: string;
};

export type RequirementMatchResult = "confirmed" | "partial" | "missing" | "expired" | "unavailable" | "unknown";
export type CapabilityRequirementMatch = {
  requirementType: string; tenderRequirement: string; companyCapability: string | null; result: RequirementMatchResult;
  tenderEvidence: Evidence[]; companyEvidence: string[]; confidence: number; explanation: string;
};

export type MatchComponents = {
  scope: number; compliance: number; experience: number; people: number; equipment: number;
  financial: number; geography: number; schedule: number; preference: number;
};

export type ScoringCriterionApplicability = "applicable" | "not_applicable" | "unknown";
export type ScoringCriterionKey = "scope" | "delivery" | "experience" | "financial" | "geography" | "schedule" | "preference";
export type ScoringCriterionResult = {
  key: ScoringCriterionKey;
  label: string;
  weight: number;
  applicability: ScoringCriterionApplicability;
  result: "confirmed" | "partial" | "contradicted" | "missing" | "unknown";
  score: number | null;
  evidenceQuality: number;
  contribution: number;
  lowerBound: number;
  upperBound: number;
  tenderEvidence: Evidence[];
  companyEvidence: string[];
  explanation: string;
};

export type MatchRecommendation = "strong" | "good" | "promising_verify" | "review" | "low" | "blocked";

export type TenderMatch = {
  tenderId: string; score: number; decision: TenderDecision; components: MatchComponents; blockers: string[];
  reasons: string[]; matchedTerms: string[]; missingInformation: string[]; confirmedCapabilities: string[];
  capabilityGaps: string[]; staleInformation: string[]; requirementMatches: CapabilityRequirementMatch[];
  /** A fit score can be high while eligibility is pending when the bulletin does not publish the full criteria. */
  eligibility: TenderEligibility;
  eligibilityReason: string;
  evidenceCoverage: number;
  observedFitScore?: number;
  confidenceScore?: number;
  fitRangeLow?: number;
  fitRangeHigh?: number;
  criterionResults?: ScoringCriterionResult[];
  recommendation?: MatchRecommendation;
  recommendationReason?: string;
  criticalUnknowns?: string[];
  scoringModelVersion?: string;
  calibrationVersion?: string;
  capabilityVersion: number; updatedAt: string;
};

export type TenderInsight = {
  id: string; tenderId: string; type: "summary" | "work" | "risk" | "next_action" | "requirement";
  textAl: string; evidence: Evidence[]; factOrInference: "extracted_fact" | "inference"; confidence: number;
};

export type WorkPackageSource = "bulletin" | "document" | "inference" | "manual";
export type WorkPackageVerification = "provisional" | "extracted" | "confirmed";
export type AllocationSource = "internal" | "partner" | "rental" | "hybrid" | "uncovered";

export type TenderWorkPackage = {
  id: string; phase: string; task: string; quantity: number | null; unit: string | null; requirements: string[];
  source: WorkPackageSource; sourcePage: number; evidenceText: string; confidence: number; verificationStatus: WorkPackageVerification;
};

export type TenderWorkAllocation = {
  id: string; workPackageId: string; source: AllocationSource; sharePercent: number; partnerId: string | null;
  resourceId: string | null; companyCapability: string | null; estimatedAmountAll: number | null;
  partnerName?: string; resourceName?: string; status: "suggested" | "confirmed" | "overridden"; rationale: string; dependencyRisk: "low" | "medium" | "high"; confidence: number;
};

export type TenderDeliveryPlan = {
  tenderId: string; workPackages: TenderWorkPackage[]; allocations: TenderWorkAllocation[]; generatedAt: string;
  capabilityVersion: number; summary: { internalPercent: number; partnerPercent: number; rentalCount: number; uncoveredCount: number; provisionalCount: number };
};

export type TenderRecommendation = "proceed" | "conditional" | "partner_required" | "high_risk" | "do_not_proceed";
export type TenderSuitability = "strong_fit" | "good_fit" | "review_required" | "weak_fit" | "unsuitable";
export type EvidenceCompleteness = "complete" | "substantial" | "partial" | "limited";
export type TenderIssueType = "blocker" | "risk" | "unknown";
export type TenderIssueSeverity = "critical" | "high" | "medium" | "low";
export type TenderActionStatus = "todo" | "in_progress" | "waiting" | "completed" | "not_applicable";
export type TenderDecisionStatus = "continue" | "conditional" | "watch" | "decline" | "submitted";

export type TenderDecisionIssue = {
  id: string; type: TenderIssueType; severity: TenderIssueSeverity; title: string; description: string;
  tenderEvidence: Evidence[]; companyEvidence: string[]; resolution: string; status: "open" | "resolved";
};

export type TenderAction = {
  id: string; title: string; description: string; priority: "urgent" | "high" | "normal";
  status: TenderActionStatus; relatedIssueId: string | null; dueDate: string | null; completionNote: string;
};

export type TenderCompanyDecision = {
  status: TenderDecisionStatus; reason: string; decidedAt: string; acceptedRisks: string[];
};

export type TenderDecisionBrief = {
  tenderId: string; capabilityVersion: number; recommendation: TenderRecommendation; recommendationReason: string;
  suitability: TenderSuitability; eligibility: TenderEligibility; evidenceCompleteness: EvidenceCompleteness;
  evidenceCoverage: number; strengths: string[]; issues: TenderDecisionIssue[]; actions: TenderAction[];
  generatedAt: string; decision: TenderCompanyDecision | null;
};

export type AuthorityFacet = { id: string; name: string; abbreviation: string | null; parentId: string | null; aliases: string[]; count: number };
export type TenderRecord = { tender: TenderNotice; bulletin: Bulletin; match: TenderMatch; insights: TenderInsight[]; workflowStatus: TenderWorkflowStatus; deliveryPlan?: TenderDeliveryPlan; decisionBrief?: TenderDecisionBrief; relevanceFeedback?: boolean | null };
export type AppSnapshot = { company: CompanyCapabilityProfile; readiness?: CapabilityReadiness; bulletins: Bulletin[]; tenders: TenderRecord[]; authorityFacets?: AuthorityFacet[] };
