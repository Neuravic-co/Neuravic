import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, relative, resolve, sep } from "node:path";
import { execFileSync } from "node:child_process";
import { describe, expect, it } from "vitest";
import { scanFiles, scanText } from "../../Security/scripts/security-check.mjs";

describe("secret scan redaction", () => {
  it("reports a credential category and location without returning the value", () => {
    const value = ["ghp", "_", "x".repeat(36)].join("");
    const findings = scanText(`first line\ncredential=${value}`, "example.ts");
    expect(findings).toEqual([{ file: "example.ts", line: 2, kind: "GitHub token" }]);
    expect(JSON.stringify(findings)).not.toContain(value);
  });

  it("scans new files before staging while honoring ignored local secrets", () => {
    const tempRoot = resolve(tmpdir());
    const directory = mkdtempSync(join(tempRoot, "neuravic-secret-scan-"));
    try {
      execFileSync("git", ["init", "--quiet"], { cwd: directory });
      writeFileSync(join(directory, ".gitignore"), ".env.local\n");
      writeFileSync(join(directory, ".env.local"), "local-ignored-value");
      writeFileSync(join(directory, "example.ts"), ["ghp", "_", "x".repeat(36)].join(""));
      const findings = scanFiles(directory);
      expect(findings).toHaveLength(1);
      expect(findings[0]?.file).toBe("example.ts");
    } finally {
      const target = relative(tempRoot, resolve(directory));
      if (!target.startsWith("neuravic-secret-scan-") || target.includes(sep)) throw new Error("Refusing cleanup outside the test directory");
      rmSync(directory, { recursive: true, force: true });
    }
  });
});
