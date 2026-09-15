import { NextResponse } from "next/server";
import { getSupabaseClient, getSupabaseServiceClient } from "@/lib/supabase";

export const runtime = "nodejs";

export async function GET() {
  const client = process.env.PASSWORDLESS_MODE === "1" ? getSupabaseServiceClient() : getSupabaseClient();
  if (!client) return NextResponse.json({ application: "ok", supabase: "not_configured" }, { status: 503 });
  const { error } = await client.from("bulletins").select("id").limit(1);
  const reachable = !error || error.code === "42501" || error.code === "PGRST301";
  return NextResponse.json({ application: "ok", supabase: reachable ? "reachable" : "error", mode: process.env.PASSWORDLESS_MODE === "1" ? "passwordless" : "authenticated", detail: error?.message ?? null }, { status: reachable ? 200 : 503 });
}
