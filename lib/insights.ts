import { normalize } from "./normalize";
import type { TenderInsight, TenderMatch, TenderNotice } from "./types";

export function createDeterministicInsights(tender: TenderNotice, match: TenderMatch): TenderInsight[] {
  const evidence = [{ page: tender.sourcePages.start, text: tender.contractObject, confidence: tender.extractionConfidence }];
  const risks = [
    ...(tender.limitFundAll == null ? ["Fondi limit nuk është nxjerrë qartë; kontrollojeni në PDF."] : []),
    ...(tender.durationText == null ? ["Kohëzgjatja nuk është e qartë nga njoftimi i nxjerrë."] : []),
    ...(match.blockers.length ? match.blockers : []),
    ...(tender.republished ? ["Kjo procedurë është rishpallur; krahasoni referencën e mëparshme dhe arsyen."] : [])
  ];
  const work = match.matchedTerms.length ? `Fushat e mundshme të punës: ${match.matchedTerms.join(", ")}.` : "Fusha e punës duhet verifikuar nga objekti dhe kodi CPV.";
  const nextAction = match.decision === "blocked" ? "Mos e ndiqni pa zgjidhur bllokimin e identifikuar." : match.score >= 65 ? "Hapni PDF-në dhe kontrolloni dokumentet, kriteret e kualifikimit dhe afatin e ofertës." : "Verifikoni nëse objekti është brenda specializimit para se të investoni kohë.";
  const result: TenderInsight[] = [
    { id: `${tender.id}-summary`, tenderId: tender.id, type: "summary", textAl: `Objekti i tenderit: ${tender.contractObject}.`, evidence, factOrInference: "extracted_fact", confidence: tender.extractionConfidence },
    { id: `${tender.id}-work`, tenderId: tender.id, type: "work", textAl: work, evidence, factOrInference: "inference", confidence: Math.max(0.45, match.score / 100) },
    { id: `${tender.id}-next`, tenderId: tender.id, type: "next_action", textAl: nextAction, evidence: [{ page: tender.sourcePages.end, text: tender.sourceText.slice(-220), confidence: 0.65 }], factOrInference: "inference", confidence: 0.68 }
  ];
  if (risks.length) result.push({ id: `${tender.id}-risk`, tenderId: tender.id, type: "risk", textAl: risks.join(" "), evidence, factOrInference: "extracted_fact", confidence: 0.78 });
  if (!normalize(tender.sourceText).includes("licenc")) result.push({ id: `${tender.id}-requirements`, tenderId: tender.id, type: "requirement", textAl: "Kërkesat e plota për licenca, staf dhe dokumentacion duhet kontrolluar në paketën e tenderit.", evidence, factOrInference: "inference", confidence: 0.74 });
  return result;
}
