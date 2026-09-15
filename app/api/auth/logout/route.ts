import { NextResponse } from "next/server";
import { getSupabaseServerClient } from "@/lib/supabase-server";

export async function POST() {
  const client = await getSupabaseServerClient();
  if (client) await client.auth.signOut();
  return NextResponse.json({ signedOut: true });
}
