import { rmSync } from "node:fs";
import { dirname, resolve } from "node:path";

const dataRoot = resolve(process.cwd(), "data");
const targets = [
  resolve(dataRoot, "state.json"),
  resolve(dataRoot, "uploads"),
  resolve(dataRoot, "capability-documents")
];

for (const target of targets) {
  if (dirname(target) !== dataRoot) throw new Error(`Refusing to clear unsafe local-data target: ${target}`);
  rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
}

console.log("Local demo data cleared. The next app start will use a blank workspace.");
