import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function GET(request: Request) {
  const url = new URL(request.url); const code = url.searchParams.get("code");
  if (code) { const client = await getSupabaseServerClient(); if (client) await client.auth.exchangeCodeForSession(code); }
  return NextResponse.redirect(new URL("/", request.url));
}
