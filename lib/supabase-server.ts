import { randomBytes } from "node:crypto";
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

const workspaceMarker = "tenderat-ai-albania-workspace";
let workspacePromise: Promise<string> | null = null;

/**
 * Passwordless company mode still needs one owner UUID because all persisted
 * Supabase rows are owner-scoped. Create that non-interactive technical user
 * on first use so Vercel does not require a separate provisioning command.
 */
export async function ensureCompanyWorkspaceId(client: SupabaseClient): Promise<string> {
  const configuredId = getCompanyWorkspaceId();
  if (configuredId) return configuredId;
  if (workspacePromise) return workspacePromise;

  workspacePromise = (async () => {
    const { data: listed, error: listError } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
    if (listError) throw new Error(`Nuk u lexuan përdoruesit teknikë të workspace-it: ${listError.message}`);

    const existing = listed.users.find((user) => user.app_metadata?.tenderat_workspace === workspaceMarker);
    if (existing) return existing.id;

    const config = values();
    if (!config) throw new Error("Supabase nuk është konfiguruar.");
    const projectReference = new URL(config.url).hostname.split(".")[0];
    const internalEmail = `workspace-${projectReference}@tenderat-ai.internal`;
    const { data: created, error: createError } = await client.auth.admin.createUser({
      email: internalEmail,
      password: randomBytes(32).toString("base64url"),
      email_confirm: true,
      app_metadata: { tenderat_workspace: workspaceMarker }
    });
    if (created.user) return created.user.id;

    // A concurrent first visit may create the same internal user first.
    const { data: retried, error: retryError } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
    const recovered = retried?.users.find((user) => user.app_metadata?.tenderat_workspace === workspaceMarker);
    if (recovered) return recovered.id;
    throw new Error(`Krijimi i workspace-it teknik dështoi: ${createError?.message ?? retryError?.message ?? "përdoruesi mungon"}`);
  })();

  try {
    return await workspacePromise;
  } catch (error) {
    workspacePromise = null;
    throw error;
  }
}
