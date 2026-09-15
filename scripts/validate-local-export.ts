import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const statePath = path.join(root, "data", "state.json");
if (!fs.existsSync(statePath)) throw new Error("data/state.json nuk u gjet.");
const state = JSON.parse(fs.readFileSync(statePath, "utf8")) as { bulletins?: unknown[]; tenders?: unknown[]; company?: { companyName?: string } };
const bulletin = (state.bulletins ?? [])[0] as { id?: string; fileHash?: string; fileName?: string } | undefined;
const pdfPath = bulletin ? path.join(root, "data", "uploads", `${bulletin.id}.pdf`) : "";
const pdf = pdfPath && fs.existsSync(pdfPath) ? fs.readFileSync(pdfPath) : null;
const hash = pdf ? createHash("sha256").update(pdf).digest("hex") : null;
if (bulletin && (!pdf || hash !== bulletin.fileHash)) throw new Error("Buletini dhe PDF-ja lokale nuk përputhen.");
console.log(JSON.stringify({ company: state.company?.companyName ?? "", bulletins: state.bulletins?.length ?? 0, tenders: state.tenders?.length ?? 0, bulletinFile: bulletin?.fileName ?? null, pdfBytes: pdf?.byteLength ?? 0, sha256: hash }, null, 2));
