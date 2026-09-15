import { createBrowserClient, createServerClient } from "@supabase/ssr";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let cachedClient: SupabaseClient | null = null;
let cachedBrowserClient: SupabaseClient | null = null;

function config(): { url: string; anonKey: string } | null {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  return url && anonKey ? { url, anonKey } : null;
}

export function isSupabaseConfigured(): boolean { return Boolean(config()); }

export function getSupabaseClient(): SupabaseClient | null {
  const values = config();
  if (!values) return null;
  if (!cachedClient) cachedClient = createClient(values.url, values.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return cachedClient;
}

export function getSupabaseServiceClient(): SupabaseClient | null {
  const values = config();
  const serviceKey = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!values || !serviceKey) return null;
  return createClient(values.url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
}

export function getSupabaseBrowserClient(): SupabaseClient | null {
  const values = config();
  if (!values) return null;
  if (!cachedBrowserClient) cachedBrowserClient = createBrowserClient(values.url, values.anonKey);
  return cachedBrowserClient;
}
