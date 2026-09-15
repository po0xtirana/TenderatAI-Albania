import { createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";

function values(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

/**
 * Production single-company mode uses the existing project secret only on the
 * Next.js server. Authenticated mode continues to use the cookie client for
 * development and future multi-user deployments.
 */
export async function getSupabaseServerClient(): Promise<SupabaseClient | null> {
  const config = values();
  if (!config) return null;
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (process.env.PASSWORDLESS_MODE === "1") {
    if (!secret) return null;
    return createClient(config.url, secret, { auth: { persistSession: false, autoRefreshToken: false } });
  }
  const cookieStore = await cookies();
  return createServerClient(config.url, config.anonKey, {
    cookies: {
      getAll() { return cookieStore.getAll(); },
      setAll(values) {
        try { for (const { name, value, options } of values) cookieStore.set(name, value, options); }
        catch { /* Server Components cannot always mutate cookies. */ }
      }
    }
  });
}

export function getCompanyWorkspaceId(): string | null {
  return process.env.COMPANY_WORKSPACE_ID || process.env.SUPABASE_IMPORT_USER_ID || null;
}
