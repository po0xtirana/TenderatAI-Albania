import { NextResponse } from "next/server";
import { readCapabilities } from "@/lib/data";

export const runtime = "nodejs";
export async function GET() { return NextResponse.json((await readCapabilities()).readiness); }
