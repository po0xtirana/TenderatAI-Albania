import { rmSync } from "node:fs";
import { basename, dirname, resolve } from "node:path";

const projectRoot = resolve(process.cwd());
const allowedNames = new Set([".next-build", ".next-dev"]);
const requestedNames = process.argv.slice(2);

if (!requestedNames.length) throw new Error("Specify an allowed Next.js cache directory.");

for (const name of requestedNames) {
  const target = resolve(projectRoot, name);
  if (!allowedNames.has(name) || dirname(target) !== projectRoot || basename(target) !== name) {
    throw new Error(`Refusing to remove unsafe cache target: ${name}`);
  }
  rmSync(target, { recursive: true, force: true, maxRetries: 3, retryDelay: 150 });
}
