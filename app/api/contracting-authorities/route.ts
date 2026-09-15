import { NextResponse } from "next/server";
import { readSnapshot } from "@/lib/data";

export const runtime = "nodejs";

export async function GET(request: Request) {
  const query = new URL(request.url).searchParams.get("q")?.trim().toLocaleLowerCase("sq-AL") ?? "";
  const facets = ((await readSnapshot()).authorityFacets ?? []).filter((item) => !query || [item.name, item.abbreviation, ...item.aliases].filter(Boolean).join(" ").toLocaleLowerCase("sq-AL").includes(query));
  return NextResponse.json(facets);
}
