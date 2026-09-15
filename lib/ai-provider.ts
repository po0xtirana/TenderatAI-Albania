import OpenAI from "openai";

let cachedClient: OpenAI | null | undefined;

export function hasAiProvider(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY);
}

export function getAiModel(): string {
  if (!process.env.OPENROUTER_API_KEY) return process.env.OPENAI_TENDER_MODEL || "gpt-5-mini";
  const configured = process.env.OPENROUTER_MODEL?.trim();
  // This preview slug was used by the first deployment but is no longer a
  // reliable text endpoint. Preserve existing installations by migrating it.
  if (!configured || configured === "deepseek/deepseek-v4-flash-0731") return "deepseek/deepseek-chat-v3.1";
  return configured;
}

export function isUsingOpenRouter(): boolean { return Boolean(process.env.OPENROUTER_API_KEY); }

export function getAiClient(): OpenAI | null {
  if (cachedClient !== undefined) return cachedClient;
  const apiKey = process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY;
  if (!apiKey) { cachedClient = null; return cachedClient; }
  const usingOpenRouter = Boolean(process.env.OPENROUTER_API_KEY);
  cachedClient = new OpenAI({
    apiKey,
    timeout: 30_000,
    maxRetries: 1,
    ...(usingOpenRouter ? {
      baseURL: "https://openrouter.ai/api/v1",
      defaultHeaders: {
        "HTTP-Referer": process.env.OPENROUTER_SITE_URL || "http://localhost:3012",
        "X-OpenRouter-Title": process.env.OPENROUTER_SITE_NAME || "Tenderat AI Albania"
      }
    } : {})
  });
  return cachedClient;
}

export function readAiResponseText(response: unknown): string {
  const candidate = response as { output_text?: unknown; output?: unknown };
  if (typeof candidate.output_text === "string" && candidate.output_text.trim()) return candidate.output_text;
  if (!Array.isArray(candidate.output)) return "";
  return candidate.output.flatMap((item) => {
    if (!item || typeof item !== "object") return [];
    const content = (item as { content?: unknown }).content;
    if (!Array.isArray(content)) return [];
    return content.flatMap((part) => part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? [(part as { text: string }).text] : []);
  }).join("\n");
}

export function parseAiJson<T>(text: string, fallback: T): T {
  const cleaned = text.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
  if (!cleaned) return fallback;
  try { return JSON.parse(cleaned) as T; }
  catch {
    const start = cleaned.indexOf("{");
    const end = cleaned.lastIndexOf("}");
    if (start >= 0 && end > start) {
      try { return JSON.parse(cleaned.slice(start, end + 1)) as T; }
      catch { return fallback; }
    }
    return fallback;
  }
}
