import { NextResponse } from "next/server";
import { readSnapshot, updateCompanyData } from "@/lib/data";

export const runtime = "nodejs";

export async function GET() { return NextResponse.json({ company: (await readSnapshot()).company }); }

export async function PATCH(request: Request) {
  const body = await request.json().catch(() => null);
  if (!body || typeof body !== "object") return NextResponse.json({ error: "Të dhëna të pavlefshme." }, { status: 400 });
  const company = await updateCompanyData(body as Record<string, unknown>);
  return NextResponse.json({ company });
}
