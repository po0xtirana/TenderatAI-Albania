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
  // OneDrive and antivirus can briefly recreate or hold generated Next files.
  // This remains constrained to the two explicit cache directories above, but
  // waits long enough to avoid a flaky production build on Windows.
  rmSync(target, { recursive: true, force: true, maxRetries: 12, retryDelay: 300 });
}
