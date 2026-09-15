import { CONSTRUCTION_CPV_CATALOG, findCpvByIds, suggestCpvSpecializations, type CpvSuggestion } from "./cpv-catalog";
import { getAiClient, getAiModel, readAiResponseText } from "./ai-provider";

type AiSelection = { ids?: string[] };

export async function getWorkCapabilitySuggestions(query: string): Promise<{ suggestions: CpvSuggestion[]; source: "catalog" | "catalog+ai" }> {
  const local = suggestCpvSpecializations(query, 10);
  const client = getAiClient();
  if (!client || local.length >= 5) return { suggestions: local, source: "catalog" };

  try {
    const response = await client.responses.create({
      model: getAiModel(),
      temperature: 0,
      input: [
        { role: "developer", content: "Zgjidh vetëm ID nga katalogu i dhënë që përfaqësojnë realisht punën e shkruar në shqip. Mos shpik kode dhe mos shto punë ndihmëse që përdoruesi nuk i ka përmendur. Kthe maksimumi 6 ID." },
        { role: "user", content: `PUNA: ${query}\n\nKATALOGU:\n${CONSTRUCTION_CPV_CATALOG.map((item) => `${item.id}: ${item.labelAl} (${item.code}) — ${item.descriptionAl}`).join("\n")}` }
      ],
      text: {
        format: {
          type: "json_schema", name: "cpv_selection", strict: true,
          schema: { type: "object", additionalProperties: false, properties: { ids: { type: "array", maxItems: 6, items: { type: "string", enum: CONSTRUCTION_CPV_CATALOG.map((item) => item.id) } } }, required: ["ids"] }
        }
      }
    });
    const parsed = JSON.parse(readAiResponseText(response) || "{\"ids\":[]}") as AiSelection;
    const aiItems = findCpvByIds(parsed.ids ?? []).map((item) => ({ ...item, score: 65, reason: "Sugjeruar nga analiza semantike; kërkon konfirmim" }));
    const merged = [...local, ...aiItems].filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index).sort((a, b) => b.score - a.score).slice(0, 10);
    return { suggestions: merged, source: "catalog+ai" };
  } catch {
    return { suggestions: local, source: "catalog" };
  }
}
