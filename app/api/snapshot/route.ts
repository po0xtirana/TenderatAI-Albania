import { NextRequest, NextResponse } from "next/server";
import { readSnapshot } from "@/lib/data";

export const runtime = "nodejs";

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const period = url.searchParams.get("period");
  const decision = url.searchParams.get("decision") ?? undefined;
  const query = url.searchParams.get("q") ?? undefined;
  const authorities = [...new Set(url.searchParams.getAll("authority").flatMap((value) => value.split(",").map((item) => item.trim()).filter(Boolean)))];
  const snapshot = await readSnapshot({ period: period === "30d" || period === "90d" ? period : "all", decision, query, authorities });
  // The dashboard only needs list metadata. Full extracted text stays on the detail endpoint,
  // keeping the initial response small enough for quick rendering after large bulletin uploads.
  const payload = {
    ...snapshot,
    tenders: snapshot.tenders.map((record) => ({ ...record, insights: [], tender: { ...record.tender, sourceText: "" } }))
  };
  const body = JSON.stringify(payload);
  return new NextResponse(body, {
    headers: {
      "cache-control": "no-store",
      "content-type": "application/json; charset=utf-8",
      "content-length": String(Buffer.byteLength(body))
    }
  });
}
