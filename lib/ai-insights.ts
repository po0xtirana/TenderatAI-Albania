import type { TenderInsight, TenderNotice } from "./types";
import { getAiClient, getAiModel, isUsingOpenRouter, readAiResponseText } from "./ai-provider";

type AiInsight = { type: TenderInsight["type"]; textAl: string; page: number; evidence: string; confidence: number; factOrInference: TenderInsight["factOrInference"] };

export async function generateAiInsights(tender: TenderNotice): Promise<TenderInsight[]> {
  const client = getAiClient();
  if (!client) return [];
  const systemPrompt = "Je analist i prokurimeve publike në Shqipëri. Përmblidh vetëm informacionin e dhënë në njoftim. Mos shpik licenca, sasi, afate ose kërkesa. Shkruaj në shqip. Çdo pikë duhet të ketë tekst prove të kopjuar saktësisht nga njoftimi dhe numrin e faqes. Ndaji faktet e nxjerra nga përfundimet e arsyetuara.";
  const sourceText = tender.sourceText.slice(0, 30_000);
  const schema = {
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
  } as const;
  let responseText = "";
  if (isUsingOpenRouter()) {
    const response = await client.chat.completions.create({
      model: getAiModel(),
      temperature: 0.1,
      max_tokens: 900,
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: `${systemPrompt}\nKthe vetëm JSON të vlefshëm sipas kësaj skeme: ${JSON.stringify(schema)}` },
        { role: "user", content: `FAQET ${tender.sourcePages.start}-${tender.sourcePages.end}\nNJOFTIMI:\n${sourceText}` }
      ]
    });
    responseText = response.choices[0]?.message?.content ?? "";
  } else {
    const response = await client.responses.create({
      model: getAiModel(), temperature: 0.1,
      input: [{ role: "developer", content: systemPrompt }, { role: "user", content: `NJOFTIMI:\n${sourceText}` }],
      text: { format: { type: "json_schema", name: "tender_insights", strict: true, schema } }
    });
    responseText = readAiResponseText(response);
  }
  const parsed = JSON.parse(responseText || "{\"insights\":[]}") as { insights?: AiInsight[] };
  const normalizedSource = tender.sourceText.toLocaleLowerCase("sq-AL").replace(/\s+/g, " ").trim();
  return (parsed.insights ?? []).filter((insight) => {
    const pageInRange = insight.page >= tender.sourcePages.start && insight.page <= tender.sourcePages.end;
    const normalizedEvidence = insight.evidence.trim().toLocaleLowerCase("sq-AL").replace(/\s+/g, " ");
    const evidenceIsPresent = normalizedEvidence.length >= 8 && normalizedSource.includes(normalizedEvidence);
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
