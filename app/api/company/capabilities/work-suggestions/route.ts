import { NextResponse } from "next/server";
import { getWorkCapabilitySuggestions } from "@/lib/work-capability-suggestions";

export async function POST(request: Request) {
  try {
    const body = await request.json() as { query?: unknown };
    const query = typeof body.query === "string" ? body.query.trim() : "";
    if (query.length < 3) return NextResponse.json({ error: "Shkruani të paktën 3 shkronja për specializimin." }, { status: 400 });
    if (query.length > 180) return NextResponse.json({ error: "Përshkrimi është shumë i gjatë." }, { status: 400 });
    const result = await getWorkCapabilitySuggestions(query);
    return NextResponse.json(result);
  } catch {
    return NextResponse.json({ error: "Sugjerimet nuk mund të gjeneroheshin tani." }, { status: 500 });
  }
}
