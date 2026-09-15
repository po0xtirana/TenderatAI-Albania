import OpenAI from "openai";

let cachedClient: OpenAI | null | undefined;

export function hasAiProvider(): boolean {
  return Boolean(process.env.OPENROUTER_API_KEY || process.env.OPENAI_API_KEY);
}

export function getAiModel(): string {
  return process.env.OPENROUTER_API_KEY
    ? process.env.OPENROUTER_MODEL || "deepseek/deepseek-v4-flash-0731"
    : process.env.OPENAI_TENDER_MODEL || "gpt-5-mini";
}

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
