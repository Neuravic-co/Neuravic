import { createRequire } from "node:module";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../../NFE/package.json", import.meta.url));
const entry = require.resolve("braces");
const version = require("braces/package.json").version;
const script = `
const braces = require(${JSON.stringify(entry)});
const result = { node: process.version, patternLength: 9999, benign: braces.expand('a/{b,c}/d').join(',') === 'a/b/d,a/c/d', exhaustion: [], otherErrors: [] };
// Bounded local input below the library's character limit; no network, disk input or credentials.
const pattern = '{'.repeat(4998) + 'a,b' + '}'.repeat(4998);
for (const method of ['compile', 'stringify', 'expand']) {
 try { braces[method](pattern); }
 catch (error) { if (error instanceof RangeError && /call stack/i.test(error.message)) result.exhaustion.push(method); else result.otherErrors.push({ method, name: error.name }); }
}
process.stdout.write(JSON.stringify(result));`;

export function verifyExposure() {
  const output = execFileSync(process.execPath, ["--max-old-space-size=64", "-e", script], { encoding: "utf8", timeout: 5000, maxBuffer: 4096, windowsHide: true });
  return { package: "braces", version, advisory: "GHSA-vfj7-8cjw-p6xm", ...JSON.parse(output) };
}
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const result = verifyExposure();
  console.log(JSON.stringify(result));
  // No local reproduction is evidence of absence: the advisory remains listed for this locked version.
  process.exitCode = version === "3.0.3" || !result.benign || result.exhaustion.length ? 1 : 0;
}
