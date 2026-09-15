import { createClient } from "@supabase/supabase-js";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const readEnv = (name: string) => {
  if (process.env[name]) return process.env[name];
  const file = path.join(root, ".env.local"); if (!fs.existsSync(file)) return undefined;
  const line = fs.readFileSync(file, "utf8").split(/\r?\n/).find((item) => item.startsWith(`${name}=`));
  return line?.slice(name.length + 1).replace(/^['"]|['"]$/g, "");
};
const url = readEnv("NEXT_PUBLIC_SUPABASE_URL"); const key = readEnv("SUPABASE_SECRET_KEY") ?? readEnv("SUPABASE_SERVICE_ROLE_KEY"); const owner = readEnv("COMPANY_WORKSPACE_ID") ?? readEnv("SUPABASE_IMPORT_USER_ID");
if (!url || !key || !owner) throw new Error("Duhen URL-ja e Supabase, çelësi privat ekzistues dhe workspace ID.");
const local = JSON.parse(fs.readFileSync(path.join(root, "data", "state.json"), "utf8")) as { bulletins: unknown[]; tenders: unknown[] };
const client = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
async function count(table: string) { const { count: value, error } = await client.from(table).select("*", { count: "exact", head: true }).eq("owner_user_id", owner); if (error) throw new Error(`${table}: ${error.message}`); return value ?? 0; }
async function main() {
  const result = { local: { bulletins: local.bulletins.length, tenders: local.tenders.length }, cloud: { bulletins: await count("bulletins"), tenders: await count("tender_notices"), matches: await count("tender_matches"), insights: await count("tender_insights") } };
  console.log(JSON.stringify(result, null, 2));
  if (result.cloud.bulletins !== result.local.bulletins || result.cloud.tenders !== result.local.tenders || result.cloud.matches !== result.local.tenders) throw new Error("Numrat lokalë dhe cloud nuk përputhen.");
}
void main().catch((error) => { console.error(error instanceof Error ? error.message : String(error)); process.exitCode = 1; });
