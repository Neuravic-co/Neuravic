// Runs every end-to-end test in turn. The frontend and the backend must already be running (see ../README.md).
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const tests = ["contact.e2e.mjs", "portal.e2e.mjs", "accessibility.e2e.mjs"];
let failed = 0;
for (const test of tests) {
  const result = spawnSync(process.execPath, [fileURLToPath(new URL(test, import.meta.url))], { stdio: "inherit" });
  if (result.status !== 0) failed += 1;
}
console.log(failed ? `\n${failed} of ${tests.length} end-to-end suites failed` : `\nAll ${tests.length} end-to-end suites passed`);
process.exit(failed ? 1 : 0);
