import { NextResponse } from "next/server";
import { readCapabilityVersions } from "@/lib/data";

export const runtime = "nodejs";
export async function GET() { return NextResponse.json({ versions: await readCapabilityVersions() }); }
