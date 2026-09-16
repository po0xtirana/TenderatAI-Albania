import { cleanText } from "./normalize";
import type { TenderNotice } from "./types";
import { getData as getPdfWorkerData } from "pdf-parse/worker";
import { PDFParse } from "pdf-parse";

export type ParsedPage = { page: number; text: string };

function firstMatch(text: string, patterns: RegExp[]): string | null {
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match?.[1]) return cleanText(match[1]).replace(/\s*\n\s*/g, " ");
  }
  return null;
}

export function parseFund(value: string | null): number | null {
  if (!value) return null;
  const normalized = value.replace(/[^\d,.]/g, "").trim();
  if (!normalized) return null;
  const lastComma = normalized.lastIndexOf(",");
  const lastDot = normalized.lastIndexOf(".");
  const decimalSeparator = lastComma > lastDot ? (normalized.length - lastComma <= 3 ? "," : null) : (normalized.length - lastDot <= 3 ? "." : null);
  let numberText = normalized;
  if (decimalSeparator) {
    const decimal = decimalSeparator === "," ? normalized.lastIndexOf(",") : normalized.lastIndexOf(".");
    numberText = `${normalized.slice(0, decimal).replace(/[,.]/g, "")}.${normalized.slice(decimal + 1)}`;
  } else {
    numberText = normalized.replace(/[,.]/g, "");
  }
  const parsed = Number(numberText);
  return Number.isFinite(parsed) ? parsed : null;
}

export function parseDate(value: string | null): string | null {
  if (!value) return null;
  const match = value.match(/(\d{1,2})[./-](\d{1,2})[./-](\d{4})/);
  if (!match) return null;
  const [, day, month, year] = match;
  const dayNumber = Number(day); const monthNumber = Number(month); const yearNumber = Number(year);
  const calendarDate = new Date(Date.UTC(yearNumber, monthNumber - 1, dayNumber));
  if (calendarDate.getUTCFullYear() !== yearNumber || calendarDate.getUTCMonth() !== monthNumber - 1 || calendarDate.getUTCDate() !== dayNumber) return null;
  const iso = `${year}-${month.padStart(2, "0")}-${day.padStart(2, "0")}T12:00:00+02:00`;
  return Number.isNaN(Date.parse(iso)) ? null : new Date(iso).toISOString();
}

function findPagesContaining(pages: ParsedPage[], pattern: RegExp): number | null {
  return pages.find((page) => pattern.test(page.text))?.page ?? null;
}

function parseCpv(value: string | null): string[] {
  const normalized = value?.replace(/[\u2010-\u2015\u2212]/g, "-") ?? "";
  return [...new Set(normalized.match(/(?<!\d)\d{8}-\d(?!\d)/g) ?? [])];
}

function detectBulletinDetails(pages: ParsedPage[]): { number: string; type: "regular" | "special" | "unknown"; date: string } {
  const firstText = pages.slice(0, 8).map((page) => page.text).join(" ");
  const number = firstText.match(/Buletini(?:\s+i\s+Posaçëm)?\s+Nr\.\s*([0-9]+)/i)?.[1] ?? "?";
  const type = /Buletini\s+i\s+Posaçëm/i.test(firstText) ? "special" : /Buletini\s+Nr\./i.test(firstText) ? "regular" : "unknown";
  const dateMatch = firstText.match(/dat[ëe]\s+(\d{1,2})\s+(Janar|Shkurt|Mars|Prill|Maj|Qershor|Korrik|Gusht|Shtator|Tetor|Nëntor|Dhjetor)\s+(\d{4})/i);
  const months: Record<string, string> = { janar: "01", shkurt: "02", mars: "03", prill: "04", maj: "05", qershor: "06", korrik: "07", gusht: "08", shtator: "09", tetor: "10", nëntor: "11", dhjetor: "12" };
  const date = dateMatch ? `${dateMatch[3]}-${months[dateMatch[2].toLocaleLowerCase("sq-AL")] ?? "01"}-${dateMatch[1].padStart(2, "0")}` : new Date().toISOString().slice(0, 10);
  return { number, type, date };
}

function normalizeReference(value: string): string {
  const compact = value.replace(/[\u2010-\u2015\u2212]/g, "-").replace(/\s+/g, "").toUpperCase();
  return compact.startsWith("REF") ? compact.replace(/^REF-*/, "REF-") : compact;
}

export function parseNotice(segment: string, pages: { start: number; end: number }, index: number, bulletinId: string): TenderNotice {
  const reference = normalizeReference(segment.match(/\bREF[-\u2010-\u2015\u2212\s]*\d{3,}(?:[-\u2010-\u2015\u2212\s]\d{2}[-\u2010-\u2015\u2212\s]\d{2}[-\u2010-\u2015\u2212\s]\d{4})?/i)?.[0] ?? `UNKNOWN-${index + 1}`);
  const authority = firstMatch(segment, [
    /1\.\s*Emri[^\n:]*:\s*(?:[\r\n]+\s*)?Emri\s*:?\s*([^\n]+)/i,
    /^\s*Emri\s*:?\s*([^\n]+)/im,
    /^\s*((?:BASHKIA|SHOQËRIA|SHOQERIA|MINISTRIA|DREJTORIA|AGJENCIA|UNIVERSITETI|SPITALI|OPERATORI|ENTI|FONDI|INSTITUTI|QENDRA|NDËRMARRJA|NDERMARRJA)[^\n]{2,180})/im
  ]) ?? "Autoritet i paidentifikuar";
  const address = firstMatch(segment, [/^\s*Adresa\s*:?\s*([^\n]+)/im]);
  const contactEmail = segment.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] ?? null;
  const procedureType = firstMatch(segment, [/2\.\s*Lloji i procedurës[^:]*:\s*([\s\S]*?)(?=\n\s*3\.)/i]) ?? "Procedurë prokurimi";
  const contractObject = firstMatch(segment, [
    /4\.\s*Objekti i kontratës[^:]*:\s*([\s\S]*?)(?=\n\s*5\.)/i,
    /b\)\s*Objekti i prokurimit të procedurës së anuluar[^:]*:?\s*([\s\S]*?)(?=\n\s*c\))/i
  ]) ?? "Objekti nuk u ekstraktua";
  const cpvText = firstMatch(segment, [/Kodi sipas Fjalorit[^:]*:\s*([\s\S]*?)(?=\n\s*6\.)/i]);
  const fundText = firstMatch(segment, [/(?:Fondi limit|Fondi limit\/vlera e pritshme e kontratës)[^:]*:\s*([0-9]+(?:[\s.,][0-9]+)*)/i]);
  const durationText = firstMatch(segment, [/Kohëzgjatja e kontratës[^:]*:\s*([\s\S]*?)(?=\n\s*8\.)/i]);
  const deadlineText = firstMatch(segment, [/Afati i fundit për paraqitjen[^:]*:?\s*([^\n]+)/i]);
  const lotRefs = [...segment.matchAll(/LOTI?\s*(?:[IVX]+|\d+)\s*[:\-]?\s*(REF[-\u2010-\u2015\u2212\s]*\d{3,}(?:[-\u2010-\u2015\u2212\s]\d{2}[-\u2010-\u2015\u2212\s]\d{2}[-\u2010-\u2015\u2212\s]\d{4})?)/gi)].map((match) => normalizeReference(match[1]));
  const republished = /Procedurë e Rishpallur[\s\S]{0,80}Po\s*[xX]/i.test(segment);
  const extractionFields = [authority, contractObject, cpvText, fundText, durationText, deadlineText].filter(Boolean).length;
  const sourceText = cleanText(segment);
  const date = parseDate(deadlineText);
  const isCancellation = !/4\.\s*Objekti i kontratës/i.test(segment) && /Objekti i prokurimit të procedurës së anuluar/i.test(segment);
  const lifecycleStatus = isCancellation ? "cancelled" : date && Date.parse(date) < Date.now() ? "expired" : "active";
  return {
    id: `${bulletinId}-${reference}-${index}`,
    bulletinId,
    referenceNumber: reference,
    parentReferenceNumber: lotRefs.length ? reference : null,
    lotNumber: lotRefs.length ? lotRefs.join(", ") : null,
    contractingAuthority: authority,
    address,
    contactEmail,
    procedureType,
    contractObject,
    cpvCodes: parseCpv(cpvText ?? segment),
    limitFundAll: parseFund(fundText),
    vatStatus: /pa\s*tvsh|pa\s*TVSH/i.test(segment) ? "Pa TVSH" : null,
    financingText: firstMatch(segment, [/Financimi[^:]*:\s*([\s\S]*?)(?=\n\s*7\.)/i]),
    durationText,
    submissionDeadline: date,
    republished,
    sourcePages: pages,
    sourceText,
    extractionConfidence: Math.min(0.99, 0.42 + extractionFields * 0.09 + (reference.startsWith("REF-") ? 0.12 : 0)),
    lifecycleStatus,
    createdAt: new Date().toISOString()
  };
}

function continuationBeforeNoticeHeader(value: string): string {
  const lines = value.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  while (lines.length) {
    const last = lines[lines.length - 1];
    const normalized = last.normalize("NFKD").replace(/[\u0300-\u036f]/g, "");
    const letters = normalized.match(/[A-Za-z]/g) ?? [];
    const uppercase = normalized.match(/[A-Z]/g) ?? [];
    const looksLikePageNoise = /^\d{1,4}$/.test(last) || /^(?:Buletini|Agjencia e Prokurimit Publik|APP)\b/i.test(last);
    const looksLikeNextAuthority = /^(?:BASHKIA|SHOQERIA|SHOQËRIA|MINISTRIA|DREJTORIA|AGJENCIA|UNIVERSITETI|SPITALI|OPERATORI|ENTI|FONDI|INSTITUTI|QENDRA|NDERMARRJA|NDËRMARRJA)\b/i.test(last)
      || (last.length >= 12 && last.length <= 180 && last.split(/\s+/).length >= 2 && letters.length > 0 && uppercase.length / letters.length >= 0.8);
    if (!looksLikePageNoise && !looksLikeNextAuthority) break;
    lines.pop();
  }
  return lines.join("\n");
}

export function segmentContractNotices(pages: ParsedPage[]): Array<{ text: string; start: number; end: number }> {
  const startIndex = pages.findIndex((page) => /NJOFTIM(?:E|I)?\s+KONTRAT|PROCEDURA\s+TË\s+HAPURA\s+PUNË/i.test(page.text));
  const endIndex = startIndex >= 0 ? pages.findIndex((page, index) => index > startIndex && /NJOFTIME\s+FITUESI/i.test(page.text)) : -1;
  const relevant = pages.slice(startIndex >= 0 ? startIndex : 0, endIndex > 0 ? endIndex : pages.length);
  const segments: Array<{ text: string; start: number; end: number }> = [];
  let current: { text: string; start: number; end: number } | null = null;
  for (const page of relevant) {
    const structured = [...page.text.matchAll(/3\.\s*Numri i referenc[ëe]s[\s\S]{0,220}?(REF[-\u2010-\u2015\u2212\s]*\d{3,}(?:[-\u2010-\u2015\u2212\s]\d{2}[-\u2010-\u2015\u2212\s]\d{2}[-\u2010-\u2015\u2212\s]\d{4})?)/gi)].map((match) => ({ index: (match.index ?? 0) + match[0].lastIndexOf(match[1]) }));
    const fallback = [...page.text.matchAll(/\bREF[-\u2010-\u2015\u2212\s]*\d{3,}(?:[-\u2010-\u2015\u2212\s]\d{2}[-\u2010-\u2015\u2212\s]\d{2}[-\u2010-\u2015\u2212\s]\d{4})?/gi)]
      .filter((match) => !/LOTI?\s*(?:[IVX]+|\d+)\s*[:\-]?\s*$/i.test(page.text.slice(Math.max(0, (match.index ?? 0) - 60), match.index ?? 0)))
      .map((match) => ({ index: match.index ?? 0 }));
    const references = structured.length ? structured : fallback;
    const headers = [...page.text.matchAll(/(?:^|\n)\s*1\.\s*Emri\s+dhe\s+adresa[^\n]*/gi)].map((match) => match.index ?? 0);
    if (headers.length) {
      if (current) {
        const continuation = continuationBeforeNoticeHeader(page.text.slice(0, headers[0]));
        if (continuation) current.text += `\n${continuation}`;
        current.end = page.page;
        segments.push(current);
      }
      current = null;
      for (const [headerIndex, start] of headers.entries()) {
        if (current) segments.push(current);
        current = { text: page.text.slice(start, headers[headerIndex + 1] ?? page.text.length), start: page.page, end: page.page };
      }
      continue;
    }
    if (!references.length) {
      if (current) { current.text += `\n${page.text}`; current.end = page.page; }
      continue;
    }
    const currentHasReference = current ? /\bREF[-\u2010-\u2015\u2212\s]*\d{3,}/i.test(current.text) : false;
    if (current && !currentHasReference) {
      current.text += `\n${page.text}`; current.end = page.page;
      continue;
    }
    if (current) {
      const continuation = page.text.slice(0, references[0].index).trim();
      if (continuation) current.text += `\n${continuation}`;
      current.end = page.page;
      segments.push(current);
      current = null;
    }
    for (const [referenceIndex, reference] of references.entries()) {
      if (current) segments.push(current);
      current = { text: page.text.slice(reference.index, references[referenceIndex + 1]?.index ?? page.text.length), start: page.page, end: page.page };
    }
  }
  if (current) segments.push(current);
  return segments.filter((segment) => segment.text.length > 160 && /(?:Objekti i kontratës|Fondi limit|Kodi sipas)/i.test(segment.text));
}

export async function extractBulletin(buffer: Buffer, bulletinId: string): Promise<{ bulletin: Omit<import("./types").Bulletin, "fileName" | "fileHash" | "uploadedAt">; notices: TenderNotice[] }> {
  // Embed the worker instead of resolving a physical pdf.worker.mjs file.
  // Vercel functions relocate Next.js chunks under /var/task, where pdf.js's
  // default relative worker path does not exist.
  PDFParse.setWorker(getPdfWorkerData());
  const parser = new PDFParse({ data: buffer });
  try {
    const result = await parser.getText({ parsePageInfo: true });
    const pages: ParsedPage[] = (result.pages ?? []).map((page: { num?: number; text?: string }, index: number) => ({ page: Number(page.num ?? index + 1), text: cleanText(page.text) })).filter((page) => page.text.length > 0);
    const details = detectBulletinDetails(pages);
    const segments = segmentContractNotices(pages);
    const notices = segments.map((segment, index) => parseNotice(segment.text, { start: segment.start, end: segment.end }, index, bulletinId));
    return {
      bulletin: { id: bulletinId, bulletinNumber: details.number, bulletinType: details.type, publicationDate: details.date, pageCount: Number(result.total ?? pages.length), noticeCount: notices.length, status: notices.length ? "completed" : "needs_review", processingStage: notices.length ? "completed" : "needs_review", error: notices.length ? null : "Nuk u gjet asnjë njoftim kontrate i matshëm në PDF." },
      notices
    };
  } finally {
    await parser.destroy();
  }
}
