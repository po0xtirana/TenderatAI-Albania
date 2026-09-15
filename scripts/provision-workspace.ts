import { randomBytes } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { createClient } from "@supabase/supabase-js";

const envPath = path.join(process.cwd(), ".env.local");
if (fs.existsSync(envPath)) {
  for (const line of fs.readFileSync(envPath, "utf8").split(/\r?\n/)) {
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)=(.*)$/);
    if (match && !process.env[match[1]]) process.env[match[1]] = match[2].replace(/^['"]|['"]$/g, "");
  }
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !key) throw new Error("Kërkohet çelësi privat ekzistues i Supabase në SUPABASE_SECRET_KEY ose SUPABASE_SERVICE_ROLE_KEY.");

const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
const marker = "tenderat-ai-albania-workspace";
async function main() {
const { data: users, error: listError } = await client.auth.admin.listUsers({ page: 1, perPage: 1000 });
if (listError) throw new Error(`Supabase Auth: ${listError.message}`);
const existing = users.users.find((user) => user.app_metadata?.tenderat_workspace === marker);
const internalEmail = `workspace-${new URL(url!).hostname.split(".")[0]}@tenderat-ai.internal`;
const password = randomBytes(32).toString("base64url");
let workspaceUser = existing;
if (!workspaceUser) {
  const result = await client.auth.admin.createUser({ email: internalEmail, password, email_confirm: true, app_metadata: { tenderat_workspace: marker } });
  if (result.error || !result.data.user) throw new Error(`Krijimi i workspace user dështoi: ${result.error?.message ?? "përdoruesi mungon"}`);
  workspaceUser = result.data.user;
}
console.log(JSON.stringify({ workspaceId: workspaceUser.id, created: !existing }, null, 2));
}

void main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
});
