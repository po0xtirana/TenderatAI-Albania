import type { TenderInsight, TenderNotice } from "./types";
import { getAiClient, getAiModel, readAiResponseText } from "./ai-provider";

type AiInsight = { type: TenderInsight["type"]; textAl: string; page: number; evidence: string; confidence: number; factOrInference: TenderInsight["factOrInference"] };

export async function generateAiInsights(tender: TenderNotice): Promise<TenderInsight[]> {
  const client = getAiClient();
  if (!client) return [];
  const response = await client.responses.create({
    model: getAiModel(),
    temperature: 0.1,
    input: [
      {
        role: "developer",
        content: "Je analist i prokurimeve publike në Shqipëri. Përmblidh vetëm informacionin e dhënë në njoftim. Mos shpik licenca, sasi, afate ose kërkesa. Shkruaj në shqip. Çdo pikë duhet të ketë tekst prove dhe faqe nga segmenti i dhënë. Ndaji faktet e nxjerra nga përfundimet e arsyetuara."
      },
      {
        role: "user",
        content: `NJOFTIMI:\n${tender.sourceText}`
      }
    ],
    text: {
      format: {
        type: "json_schema",
        name: "tender_insights",
        strict: true,
        schema: {
          type: "object",
          additionalProperties: false,
          properties: {
            insights: {
              type: "array",
              items: {
                type: "object",
                additionalProperties: false,
                properties: {
                  type: { type: "string", enum: ["summary", "work", "risk", "next_action", "requirement"] },
                  textAl: { type: "string" },
                  page: { type: "integer" },
                  evidence: { type: "string" },
                  confidence: { type: "number" },
                  factOrInference: { type: "string", enum: ["extracted_fact", "inference"] }
                },
                required: ["type", "textAl", "page", "evidence", "confidence", "factOrInference"]
              }
            }
          },
          required: ["insights"]
        }
      }
    }
  });
  const parsed = JSON.parse(readAiResponseText(response) || "{\"insights\":[]}") as { insights?: AiInsight[] };
  return (parsed.insights ?? []).filter((insight) => {
    const pageInRange = insight.page >= tender.sourcePages.start && insight.page <= tender.sourcePages.end;
    const evidenceIsPresent = insight.evidence.trim().length >= 8 && tender.sourceText.toLocaleLowerCase("sq-AL").includes(insight.evidence.trim().toLocaleLowerCase("sq-AL"));
    return pageInRange && evidenceIsPresent && insight.textAl.trim().length > 0;
  }).slice(0, 8).map((insight, index) => ({
    id: `${tender.id}-ai-${index}`,
    tenderId: tender.id,
    type: insight.type,
    textAl: insight.textAl.trim(),
    evidence: [{ page: insight.page, text: insight.evidence.trim(), confidence: Math.max(0, Math.min(1, insight.confidence)) }],
    factOrInference: insight.factOrInference,
    confidence: Math.max(0, Math.min(1, insight.confidence))
  }));
}
