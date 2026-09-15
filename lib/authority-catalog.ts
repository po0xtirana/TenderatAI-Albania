import { normalize } from "./normalize";
import type { AuthorityFacet, TenderNotice } from "./types";

type AuthorityDefinition = { id: string; name: string; abbreviation: string | null; aliases: string[]; parentId?: string | null };

export const AUTHORITY_CATALOG: AuthorityDefinition[] = [
  { id: "ost", name: "Operatori i Sistemit të Transmetimit", abbreviation: "OST", aliases: ["ost", "operatori i sistemit te transmetimit", "operatori i sistemit të transmetimit", "ost sh.a."] },
  { id: "ukt", name: "Ujësjellës Kanalizime Tiranë", abbreviation: "UKT", aliases: ["ukt", "ujesjelles kanalizime tirane", "ujësjellës kanalizime tiranë", "shoqeria rajonale ujesjelles kanalizime tirane", "shoqëria rajonale ujësjellës kanalizime tiranë" ] },
  { id: "bashkia-tirane", name: "Bashkia Tiranë", abbreviation: null, aliases: ["bashkia tirane", "bashkia e tiranes", "bashkia e tiranës"] },
  { id: "oshee", name: "OSHEE Group", abbreviation: "OSHEE", aliases: ["oshee", "oshee group", "operatori i shperndarjes se energjise elektrike"] },
  { id: "fshzh", name: "Fondi Shqiptar i Zhvillimit", abbreviation: "FSHZH", aliases: ["fondi shqiptar i zhvillimit", "fshzh"] },
  { id: "app", name: "Agjencia e Prokurimit Publik", abbreviation: "APP", aliases: ["agjencia e prokurimit publik", "app"] },
  { id: "bashkia-durres", name: "Bashkia Durrës", abbreviation: null, aliases: ["bashkia durres", "bashkia durrës", "bashkia e durresit", "bashkia e durrësit"] },
  { id: "bashkia-vlore", name: "Bashkia Vlorë", abbreviation: null, aliases: ["bashkia vlore", "bashkia vlorë", "bashkia e vlores", "bashkia e vlorës"] },
  { id: "bashkia-korce", name: "Bashkia Korçë", abbreviation: null, aliases: ["bashkia korce", "bashkia korçë", "bashkia e korces", "bashkia e korçës"] },
  { id: "bashkia-elbasan", name: "Bashkia Elbasan", abbreviation: null, aliases: ["bashkia elbasan", "bashkia e elbasanit"] },
  { id: "bashkia-berat", name: "Bashkia Berat", abbreviation: null, aliases: ["bashkia berat", "bashkia e beratit"] }
];

const definitionsById = new Map(AUTHORITY_CATALOG.map((definition) => [definition.id, definition]));
const aliasEntries = AUTHORITY_CATALOG.flatMap((definition) => definition.aliases.map((alias) => ({ definition, alias: normalize(alias) }))).sort((a, b) => b.alias.length - a.alias.length);

function dynamicAuthority(raw: string): AuthorityDefinition {
  const value = raw.trim() || "Autoritet i paidentifikuar";
  const normalized = normalize(value);
  return { id: `raw-${normalized.replace(/\s+/g, "-") || "unknown"}`, name: value, abbreviation: null, aliases: [value] };
}

export function resolveAuthority(raw: string | null | undefined): AuthorityDefinition {
  const value = raw?.trim() ?? "";
  const normalized = normalize(value);
  if (!normalized || normalized === "autoritet i paidentifikuar") return { id: "unknown", name: "Autoritet i paidentifikuar", abbreviation: null, aliases: [] };
  const found = aliasEntries.find(({ alias }) => normalized === alias || normalized.includes(alias) || alias.includes(normalized));
  return found?.definition ?? dynamicAuthority(value);
}

export function authorityId(raw: string | null | undefined): string { return resolveAuthority(raw).id; }

export function authorityFacets(tenders: TenderNotice[]): AuthorityFacet[] {
  const grouped = new Map<string, AuthorityFacet>();
  for (const tender of tenders) {
    const resolved = resolveAuthority(tender.contractingAuthority);
    const existing = grouped.get(resolved.id);
    if (existing) { existing.count += 1; if (!existing.aliases.includes(tender.contractingAuthority)) existing.aliases.push(tender.contractingAuthority); continue; }
    grouped.set(resolved.id, { id: resolved.id, name: resolved.name, abbreviation: resolved.abbreviation, parentId: resolved.parentId ?? null, aliases: tender.contractingAuthority ? [tender.contractingAuthority] : [], count: 1 });
  }
  for (const definition of AUTHORITY_CATALOG) if (!grouped.has(definition.id)) grouped.set(definition.id, { id: definition.id, name: definition.name, abbreviation: definition.abbreviation, parentId: definition.parentId ?? null, aliases: [], count: 0 });
  return [...grouped.values()].sort((a, b) => b.count - a.count || a.name.localeCompare(b.name, "sq"));
}

export function authorityMatches(tender: TenderNotice, selected: string[]): boolean {
  if (!selected.length) return true;
  return selected.includes(authorityId(tender.contractingAuthority));
}

export function authorityDefinition(id: string): AuthorityDefinition | null { return definitionsById.get(id) ?? null; }
