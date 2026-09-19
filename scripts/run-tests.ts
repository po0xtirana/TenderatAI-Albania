import assert from "node:assert/strict";
process.env.TENDERAT_AI_TEST_MODE = "1";
import { activateCapabilities, getCapabilities, getSnapshot, getTender, getTenderDeliveryPlan, recordFeedback, removeBulletin, updateCapabilitySection, updateTenderAction, updateTenderDecision, updateTenderWorkflow, updateTenderDeliveryAllocation } from "../lib/store";
import { matchTender } from "../lib/matcher";
import { normalize } from "../lib/normalize";
import { calculateReadiness, emptyCapabilityModel } from "../lib/capabilities";
import { suggestCpvSpecializations } from "../lib/cpv-catalog";
import { authorityId } from "../lib/authority-catalog";
import { generateDeliveryPlan } from "../lib/delivery-plan";
import { parseDate, parseFund, parseNotice, segmentContractNotices } from "../lib/parse-bulletin";
import { safeNextPath } from "../lib/access-gate";

assert.equal(safeNextPath("/capabilities?step=people"), "/capabilities?step=people");
assert.equal(safeNextPath("//malicious.example"), "/", "the access gate must reject protocol-relative redirects");
assert.equal(safeNextPath("/access?next=/"), "/", "the access gate must not redirect back to itself");

const snapshot = getSnapshot({ period: "all" });
assert.equal(snapshot.bulletins[0]?.bulletinNumber, "54");
assert.equal(snapshot.bulletins[0]?.pageCount, 985);
assert.equal(snapshot.tenders.length, 6);
assert.equal(snapshot.tenders[0]?.match.score >= snapshot.tenders[1]?.match.score, true);
assert.equal(snapshot.tenders.some((record) => record.match.decision === "blocked"), true);
assert.equal(snapshot.tenders.some((record) => record.tender.cpvCodes.includes("45232400-6")), true);
assert.equal(authorityId("Bashkia Vlore"), "bashkia-vlore");
assert.equal(authorityId("Drejtoria e Përgjithshme e Objekteve Publike, Bashkia Tiranë"), "bashkia-tirane");
assert.equal(getSnapshot({ authorities: ["bashkia-tirane"] }).tenders.every((record) => authorityId(record.tender.contractingAuthority) === "bashkia-tirane"), true);
assert.equal(normalize("Rikualifikimi i Infrastrukturës në Korçë"), "rikualifikimi i infrastruktures ne korce");
const facadeSuggestions = suggestCpvSpecializations("veshje fasade me gur ose panele");
assert.equal(facadeSuggestions.some((item) => item.code === "45443000"), true);
assert.equal(facadeSuggestions.some((item) => item.code === "45432210"), true);
assert.equal(facadeSuggestions.some((item) => item.code === "45451200"), true);
const roofSuggestions = suggestCpvSpecializations("rindërtim çatie me tjegulla dhe hidroizolim");
assert.equal(roofSuggestions.some((item) => item.code === "45261910"), true);
assert.equal(roofSuggestions.some((item) => item.code === "45261420"), true);

assert.equal(parseDate("31.02.2026"), null, "impossible calendar dates must be rejected");
assert.equal(parseFund("12,924,995.13 ALL"), 12_924_995.13, "fund parsing must preserve all grouped digits");
const sampleNotice = (authority: string, reference: string, object: string, cpv: string, fund: string) => `
1. Emri dhe adresa e Autoritetit Kontraktor
Emri: ${authority}
Adresa: Tiranë
2. Lloji i procedurës: Procedurë e hapur
3. Numri i referencës së procedurës: ${reference}
4. Objekti i kontratës: ${object}
5. Kodi sipas Fjalorit të Përbashkët të Prokurimit (FPP): ${cpv}
6. Fondi limit: ${fund} ALL pa TVSH
7. Kohëzgjatja e kontratës: 12 muaj
8. Afati i fundit për paraqitjen dhe hapjen e ofertave: 30.11.2026 ora 10:00
Informacion shtesë për dokumentet e procedurës dhe kërkesat e operatorëve ekonomikë.`;
const segmented = segmentContractNotices([{ page: 17, text: `NJOFTIME KONTRATE${sampleNotice("Bashkia Vlorë", "REF-96249", "Rikonstruksion godine", "45000000-7", "12,924,995.13")}${sampleNotice("Bashkia Tiranë", "REF‐96250", "Veshje fasade me gur", "45410000‐4", "4.500.000")}` }]);
assert.equal(segmented.length, 2, "multiple notices on one page must not overwrite each other");
const parsedFirst = parseNotice(segmented[0].text, { start: 17, end: 17 }, 0, "bulletin-test");
const parsedSecond = parseNotice(segmented[1].text, { start: 17, end: 17 }, 1, "bulletin-test");
assert.equal(parsedFirst.contractingAuthority, "Bashkia Vlorë");
assert.equal(parsedFirst.limitFundAll, 12_924_995.13);
assert.equal(parsedSecond.referenceNumber, "REF-96250");
assert.equal(parsedSecond.cpvCodes.includes("45410000-4"), true, "unicode dash CPV codes must be normalized");
const crossPageAuthorities = segmentContractNotices([
  { page: 18, text: `NJOFTIME KONTRATE${sampleNotice("Bashkia Vlorë", "REF-96260", "Rikonstruksion shkolle", "45454000-4", "20.000.000")}` },
  { page: 19, text: `Informacion shtesë për procedurën e mëparshme.\n19\nGJYKATA E RRETHIT GJYQËSOR TIRANË\n${sampleNotice("Gjykata e Rrethit Gjyqësor Tiranë", "REF-96261", "Mirëmbajtje godine", "45450000-6", "6.000.000")}` }
]);
assert.equal(crossPageAuthorities.length, 2, "a new authority on the next page must start a separate notice");
assert.equal(crossPageAuthorities[0].text.includes("GJYKATA E RRETHIT"), false, "the next authority banner must not contaminate the previous tender evidence");
const splitAcrossPages = segmentContractNotices([
  { page: 20, text: `NJOFTIME KONTRATE${sampleNotice("Bashkia Has", "REF-96316-08-15-2026", "Rehabilitim kanali", "44130000-0", "96,935,269.17")}\n1. Emri dhe adresa e Autoritetit Kontraktor:\nEmri: Shoqëria Rajonale Ujësjellës Kanalizime Vlorë sh.a` },
  { page: 21, text: `2. Lloji i procedurës: Procedurë e hapur\n3. Numri i referencës së procedurës: REF-96305-08-14-2026\n4. Objekti i kontratës: Impiant i trajtimit të ujërave\n5. Kodi sipas Fjalorit të Përbashkët të Prokurimit (FPP): 45247130-0\n6. Fondi limit: 1,129,210,978 ALL\n7. Kohëzgjatja e kontratës: 18 muaj\n8. Afati i fundit për paraqitjen dhe hapjen e ofertave: 30.11.2026 ora 10:00\nInformacion shtesë për kërkesat e operatorëve ekonomikë dhe zbatimin e kontratës.` }
]);
assert.equal(splitAcrossPages.length, 2, "a notice header at the end of one page must carry into the next page");
assert.equal(parseNotice(splitAcrossPages[1].text, { start: 20, end: 21 }, 1, "bulletin-test").contractingAuthority, "Shoqëria Rajonale Ujësjellës Kanalizime Vlorë sh.a");
const lotSegments = segmentContractNotices([
  { page: 30, text: "NJOFTIME KONTRATE\n1. Emri dhe adresa e Autoritetit Kontraktor:\nEmri: Operatori i Blerjeve të Përqendruara\n2. Lloji i procedurës: Procedurë e hapur\n3. Numri i referencës së procedurës/Lotit: REF-96791-08-20-2026\nLoti 1: REF-96793-08-20-2026" },
  { page: 31, text: "Loti 2: REF-96795-08-20-2026\nLoti 3: REF-96797-08-20-2026\n4. Objekti i kontratës: Shërbim kalibrimi laboratorik\n5. Kodi sipas Fjalorit të Përbashkët të Prokurimit (FPP): 50433000-9\n6. Fondi limit: 28,304,513.33 ALL\n7. Kohëzgjatja e kontratës: 24 muaj\n8. Afati i fundit për paraqitjen dhe hapjen e ofertave: 30.11.2026 ora 10:00\nInformacion shtesë për secilin lot dhe dokumentet e procedurës." }
]);
assert.equal(lotSegments.length, 1, "lot reference numbers must not split one procurement notice into separate tenders");
assert.equal(parseNotice(lotSegments[0].text, { start: 30, end: 31 }, 0, "bulletin-test").referenceNumber, "REF-96791-08-20-2026");
const cancelledNotice = parseNotice("REF-88956-06-05-2026\nb) Objekti i prokurimit të procedurës së anuluar të prokurimit: Blerje pajisje mirëmbajtjeje\nc) Fondi limit i procedurës së anuluar: 3,200,831 ALL\nInformacion shtesë për anulimin e procedurës dhe operatorët ekonomikë.", { start: 58, end: 58 }, 0, "bulletin-test");
assert.equal(cancelledNotice.lifecycleStatus, "cancelled", "cancelled procedures must not appear as active opportunities");
assert.equal(matchTender(cancelledNotice, snapshot.company).decision, "blocked", "cancelled procedures must never receive an opportunity recommendation");

const company = { ...snapshot.company, excludedTerms: ["ujësjellës"] };
const blocked = matchTender(snapshot.tenders[1].tender, company);
assert.equal(blocked.decision, "blocked");
assert.equal(blocked.score > 0, true, "a commercial blocker must not erase technical suitability");

const workflowTender = snapshot.tenders[0];
assert.ok(workflowTender);
const feedbackOnce = recordFeedback(workflowTender.tender.id, true);
const feedbackTwice = recordFeedback(workflowTender.tender.id, true);
assert.equal(feedbackOnce?.match.score, feedbackTwice?.match.score, "repeated relevance feedback must be idempotent");
assert.equal(feedbackTwice?.relevanceFeedback, true);
assert.equal(updateTenderWorkflow(workflowTender.tender.id, "watching")?.workflowStatus, "watching");
assert.equal(getTender(workflowTender.tender.id)?.workflowStatus, "watching");

const capabilityBefore = getCapabilities();
assert.equal(capabilityBefore.readiness.overallScore >= 70, true);
assert.equal(capabilityBefore.readiness.readyForMatching, true);
assert.equal(capabilityBefore.model.crews.length >= 2, true);
assert.equal(capabilityBefore.model.keyPeople.length >= 2, true);
assert.equal(capabilityBefore.model.referenceProjects.length >= 2, true);
const invalidPeople = structuredClone(capabilityBefore.model);
invalidPeople.labourPools[0].headcount = 2;
invalidPeople.labourPools[0].availableHeadcount = 5;
assert.throws(() => updateCapabilitySection("people", { keyPeople: invalidPeople.keyPeople, labourPools: invalidPeople.labourPools }), /nuk mund të jenë më shumë/, "impossible capacity values must be rejected before they corrupt matching");
const initialPlan = getTenderDeliveryPlan(snapshot.tenders[0].tender.id);
assert.ok(initialPlan);
assert.equal(initialPlan.workPackages.length > 0, true);
assert.equal(initialPlan.workPackages.every((item) => item.evidenceText.length > 0), true);
assert.equal(initialPlan.workPackages.some((item) => item.verificationStatus === "extracted"), true, "work packages backed by bulletin CPV data must not be labelled merely provisional");
assert.equal(initialPlan.allocations.some((item) => item.source === "internal" || item.source === "partner" || item.source === "uncovered"), true);
const initialBrief = getTender(snapshot.tenders[0].tender.id)?.decisionBrief;
assert.ok(initialBrief, "every tender must expose a decision brief");
assert.equal(initialBrief.evidenceCoverage, snapshot.tenders[0].match.evidenceCoverage, "evidence coverage must remain independent from suitability");
assert.equal(initialBrief.recommendation, "do_not_proceed", "a low-fit tender must not be presented as a project to pursue");
assert.equal(initialBrief.actions.length >= initialBrief.issues.length, true, "open brief issues must produce actionable next steps");
assert.equal(initialBrief.strengths.some((item) => item.toLocaleLowerCase("sq-AL").includes("ka kaluar")), false, "an expired deadline must never be presented as a strength");
const firstAction = initialBrief.actions[0];
assert.ok(firstAction);
assert.equal(updateTenderAction(snapshot.tenders[0].tender.id, firstAction.id, { status: "completed", completionNote: "Kontrolluar nga ekipi." })?.decisionBrief?.actions.find((item) => item.id === firstAction.id)?.status, "completed", "completed decision actions must persist");
assert.equal(updateTenderDecision(snapshot.tenders[0].tender.id, "conditional", "Duhet konfirmim nga partneri.")?.decisionBrief?.decision?.status, "conditional", "company decisions must persist with the tender");
const partnerTender = structuredClone(snapshot.tenders[0].tender);
partnerTender.contractObject = "Instalime elektrike dhe ndriçim publik";
partnerTender.cpvCodes = ["45310000-0"];
partnerTender.sourceText += "\nInstalime elektrike dhe ndriçim publik.";
const partnerPlan = generateDeliveryPlan(partnerTender, capabilityBefore.model);
assert.equal(partnerPlan.allocations.some((item) => item.source === "partner" && item.partnerId === "partner-electrical"), true);
const pendingPartnerModel = structuredClone(capabilityBefore.model);
const electricalPartner = pendingPartnerModel.partners.find((item) => item.id === "partner-electrical");
assert.ok(electricalPartner);
electricalPartner.approvalStatus = "pending";
const pendingPartnerPlan = generateDeliveryPlan(partnerTender, pendingPartnerModel);
assert.equal(pendingPartnerPlan.allocations.some((item) => item.source === "partner" && item.partnerId === "partner-electrical"), false, "unapproved partners must not be allocated as confirmed capacity");
const unavailablePartnerModel = structuredClone(capabilityBefore.model);
const unavailableElectricalPartner = unavailablePartnerModel.partners.find((item) => item.id === "partner-electrical");
assert.ok(unavailableElectricalPartner);
const unavailableElectricalCapabilities = unavailableElectricalPartner.capabilities;
assert.ok(unavailableElectricalCapabilities?.length);
for (const capability of unavailableElectricalCapabilities) {
  capability.headcount = 0;
  capability.crewCount = 0;
}
const unavailablePartnerPlan = generateDeliveryPlan(partnerTender, unavailablePartnerModel);
assert.equal(unavailablePartnerPlan.allocations.some((item) => item.source === "partner" && item.partnerId === "partner-electrical"), false, "a partner category must not bypass unavailable detailed capacity");
const unavailableInternalModel = structuredClone(capabilityBefore.model);
for (const crew of unavailableInternalModel.crews) crew.availableCrewCount = 0;
for (const pool of unavailableInternalModel.labourPools) pool.availableHeadcount = 0;
const unavailableInternalPlan = generateDeliveryPlan(snapshot.tenders[0].tender, unavailableInternalModel);
assert.equal(unavailableInternalPlan.allocations.some((item) => item.source === "internal"), false, "a declared trade without an available crew or labour pool must not be presented as internally executable");
const portGateTender = structuredClone(snapshot.tenders[0].tender);
portGateTender.id = "port-gate-regression";
portGateTender.contractObject = "Zhvendosja e Portës 4 (Projektim+Zbatim)";
portGateTender.cpvCodes = ["45210000-2", "45311000-0", "45316200-7"];
portGateTender.sourceText = `${portGateTender.contractObject} ${portGateTender.cpvCodes.join(" ")}`;
const portGateModel = structuredClone(capabilityBefore.model);
portGateModel.crews = [];
portGateModel.workCapabilities = [{ ...portGateModel.workCapabilities[0], trade: "Ndertim", deliveryMethod: "both", cpvPrefixes: ["45210000"] }];
portGateModel.labourPools = [
  { ...portGateModel.labourPools[0], id: "murator-regression", role: "Murator", skills: [], headcount: 2, availableHeadcount: 2, active: true, availableFrom: null },
  { ...portGateModel.labourPools[0], id: "electrician-regression", role: "Elekritcist", skills: [], headcount: 2, availableHeadcount: 2, active: true, availableFrom: null },
];
const portGatePlan = generateDeliveryPlan(portGateTender, portGateModel);
assert.equal(portGatePlan.workPackages.some((item) => item.task === "Ndërtim ndërtesash"), true, "building CPV must create a building package");
assert.equal(portGatePlan.workPackages.some((item) => item.task === "Instalime elektrike"), true, "related electrical CPVs must create an electrical package");
assert.equal(portGatePlan.summary.internalPercent, 50, "a single murator must not be mistaken for the multiple distinct construction roles required for the building component");
assert.equal(portGatePlan.summary.internalConfirmedCount, 1, "only the electrical component has a confirmed matching workforce");
const portGateMatch = matchTender(portGateTender, snapshot.company, portGateModel);
assert.equal((portGateMatch.criterionResults?.find((item) => item.key === "delivery")?.score ?? 0) < 90, true, "delivery scoring must reflect the component that still needs workforce verification");
const firstAllocation = initialPlan.allocations.find((item) => item.source !== "rental");
assert.ok(firstAllocation);
assert.equal(updateTenderDeliveryAllocation(snapshot.tenders[0].tender.id, firstAllocation.id, { status: "confirmed" })?.deliveryPlan?.allocations.find((item) => item.id === firstAllocation.id)?.status, "confirmed");

const target = snapshot.tenders.find((record) => record.tender.contractObject.toLocaleLowerCase("sq-AL").includes("ujësjellësit"));
assert.ok(target);
const scoreBeforeDraft = getTender(target.tender.id)?.match.score;
updateCapabilitySection("rules", {
  bidPreferences: { ...capabilityBefore.model.bidPreferences, excludedProjectTypes: [...capabilityBefore.model.bidPreferences.excludedProjectTypes, "ujësjellësit"] },
  commitments: capabilityBefore.model.commitments
});
assert.equal(getTender(target.tender.id)?.match.capabilityVersion, capabilityBefore.model.activeVersion + 1, "a complete saved profile change must publish a new active matching version automatically");
assert.equal(getTender(target.tender.id)?.match.decision, "blocked", "automatic publication must re-rank with the new version");
const activated = activateCapabilities();
assert.equal(activated.version.version, capabilityBefore.model.activeVersion + 2, "manual activation remains available for an explicit immutable checkpoint");

const expiredModel = structuredClone(capabilityBefore.model);
expiredModel.complianceRecords[0].expiryDate = "2020-01-01";
const expiredReadiness = calculateReadiness(expiredModel);
assert.equal(expiredReadiness.expiredItems.length > 0, true);
assert.equal(expiredReadiness.readyForMatching, true, "an expired optional document must be visible without globally disabling matching");

const requirementTender = structuredClone(snapshot.tenders[0].tender);
requirementTender.sourceText += "\nKapaciteti teknik: kërkohet eskavator dhe drejtues teknik.";
requirementTender.submissionDeadline = "2027-11-30T10:00:00.000Z";
const requirementMatch = matchTender(requirementTender, snapshot.company, capabilityBefore.model);
assert.equal(requirementMatch.requirementMatches.some((item) => item.requirementType === "equipment" && item.result === "confirmed"), true);
assert.equal(requirementMatch.requirementMatches.some((item) => item.requirementType === "personnel" && item.result === "confirmed"), true);
assert.equal(requirementMatch.capabilityVersion, capabilityBefore.model.activeVersion);
assert.equal(requirementMatch.eligibility, "eligible", "identified requirements covered by current company capacity should be eligible");
assert.equal(requirementMatch.evidenceCoverage > 0, true, "every match must expose measurable evidence coverage");
const noCriteriaTender = structuredClone(requirementTender);
noCriteriaTender.sourceText = "Objekti i kontratës: Rikonstruksion godine publike. Kodi CPV: 45454000-4.";
const pendingEligibility = matchTender(noCriteriaTender, snapshot.company, capabilityBefore.model);
assert.equal(pendingEligibility.eligibility, "eligibility_pending", "missing bulletin criteria must not be treated as company failure");
const unavailableEquipmentModel = structuredClone(capabilityBefore.model);
for (const equipment of unavailableEquipmentModel.equipment) equipment.availableQuantity = 0;
const unavailableEquipment = matchTender(requirementTender, snapshot.company, unavailableEquipmentModel);
assert.equal(unavailableEquipment.decision, "blocked", "a confidently extracted required machine must affect the recommendation when unavailable");
const insufficientGuaranteeTender = structuredClone(requirementTender);
insufficientGuaranteeTender.sourceText += "\nKërkohet garanci oferte 10%.";
insufficientGuaranteeTender.limitFundAll = 500_000_000;
const insufficientGuaranteeModel = structuredClone(capabilityBefore.model);
insufficientGuaranteeModel.financialCapacity.bidSecurityLimitAll = 1_000_000;
const insufficientGuarantee = matchTender(insufficientGuaranteeTender, snapshot.company, insufficientGuaranteeModel);
assert.equal(insufficientGuarantee.requirementMatches.some((item) => item.tenderRequirement.includes("garanci")), true, JSON.stringify(insufficientGuarantee));
assert.equal(insufficientGuarantee.decision, "blocked", "a known guarantee shortfall must not be hidden in a high fit score");

const sparseTender = structuredClone(requirementTender);
sparseTender.id = "sparse-bulletin-tender";
sparseTender.contractObject = "Rikonstruksion i godinës publike dhe veshje fasade";
sparseTender.cpvCodes = ["45454000-4"];
sparseTender.sourceText = "Objekti i kontratës: Rikonstruksion i godinës publike dhe veshje fasade. Kodi CPV: 45454000-4.";
sparseTender.limitFundAll = null;
sparseTender.address = null;
sparseTender.submissionDeadline = "2027-11-30T10:00:00.000Z";
sparseTender.lifecycleStatus = "active";
const sparseMatch = matchTender(sparseTender, snapshot.company, capabilityBefore.model);
assert.equal(sparseMatch.scoringModelVersion, "albania-evidence-adaptive-v2", "V2 must be the only production scorer");
assert.equal(sparseMatch.decision === "blocked" || sparseMatch.decision === "low_fit", false, "missing bulletin details must not create a false rejection");
assert.equal((sparseMatch.confidenceScore ?? 100) < 80, true, "sparse bulletin data must lower confidence rather than suitability");
assert.equal((sparseMatch.fitRangeHigh ?? 0) >= sparseMatch.score, true);
assert.equal(sparseMatch.criterionResults?.some((item) => item.key === "financial" && item.applicability === "unknown"), true);
assert.equal(sparseMatch.eligibility, "eligibility_pending");

const blankProfile = { ...snapshot.company, trades: [], cpvPrefixes: [], serviceRegions: [], licences: [], preferredAuthorities: [], excludedTerms: [], availableEmployees: null, availableEquipment: [], maxValueAll: null };
const noScopeMatch = matchTender(sparseTender, blankProfile, emptyCapabilityModel(blankProfile));
assert.equal(noScopeMatch.score <= 50, true, "deadline and geography must not manufacture suitability without a company scope signal");
assert.equal(noScopeMatch.recommendation, "promising_verify", "an empty company profile must remain clearly preliminary rather than receiving a fabricated positive fit");

const noComplianceModel = structuredClone(capabilityBefore.model);
noComplianceModel.complianceRecords = [];
const noComplianceReadiness = calculateReadiness(noComplianceModel);
assert.equal(noComplianceReadiness.blockingItems.some((item) => item.section === "compliance"), false, "licences are not a universal Albania tender prerequisite");
assert.equal(noComplianceReadiness.readyForMatching, true, "a company may be match-ready before a specific tender asks for a licence");
const sparseWithoutLicences = matchTender(sparseTender, snapshot.company, noComplianceModel);
assert.equal(sparseWithoutLicences.score, sparseMatch.score, "licences must not affect suitability when the tender does not require one");
assert.equal(sparseWithoutLicences.decision, sparseMatch.decision);

const mentionedLicenceTender = structuredClone(sparseTender);
mentionedLicenceTender.id = "mentioned-licence-tender";
mentionedLicenceTender.sourceText += " Informacion orientues: licenca NP-99.";
const mentionedLicence = matchTender(mentionedLicenceTender, snapshot.company, noComplianceModel);
assert.notEqual(mentionedLicence.decision, "blocked", "a licence mention without mandatory language must remain unverified");
assert.equal(mentionedLicence.requirementMatches.some((item) => item.tenderRequirement.replace(/\W/g, "") === "NP99" && item.result === "unknown"), true);

const mandatoryLicenceTender = structuredClone(sparseTender);
mandatoryLicenceTender.id = "mandatory-licence-tender";
mandatoryLicenceTender.sourceText += " Kriteret e veçanta: kërkohet detyrimisht licenca NP-99.";
const mandatoryLicence = matchTender(mandatoryLicenceTender, snapshot.company, noComplianceModel);
assert.equal(mandatoryLicence.decision, "blocked", "only an explicit, high-confidence mandatory licence may block participation");

const electricalPartnerMatch = matchTender(partnerTender, snapshot.company, capabilityBefore.model);
const partnerScope = electricalPartnerMatch.criterionResults?.find((item) => item.key === "scope");
const partnerDelivery = electricalPartnerMatch.criterionResults?.find((item) => item.key === "delivery");
assert.equal((partnerScope?.score ?? 0) < 85, true, "a partner must not be presented as the company’s own scope capability");
assert.equal((partnerDelivery?.score ?? 0) >= 75, true, "an approved available partner must receive delivery coverage credit");
assert.equal(electricalPartnerMatch.confirmedCapabilities.some((item) => item.toLocaleLowerCase("sq-AL").includes("partner")), true);

const calibratedUp = matchTender(sparseTender, snapshot.company, capabilityBefore.model, { adjustment: 5, evidenceCount: 5, version: "feedback-beta-v1" });
assert.equal(calibratedUp.score, sparseMatch.score, "relevance feedback must not alter technical suitability");
assert.equal(calibratedUp.calibrationVersion, "feedback-beta-v1");

const removedBulletin = removeBulletin(snapshot.bulletins[0].id);
assert.equal(removedBulletin?.id, snapshot.bulletins[0].id, "bulletin deletion must return the removed bulletin");
assert.equal(getSnapshot({ period: "all" }).bulletins.length, 0, "bulletin deletion must remove the bulletin from the workspace");
assert.equal(getSnapshot({ period: "all" }).tenders.length, 0, "bulletin deletion must remove its extracted tenders");

console.log("Tenderat AI Albania tests passed", JSON.stringify({ bulletins: snapshot.bulletins.length, tenders: snapshot.tenders.length, topScore: snapshot.tenders[0]?.match.score }));
