import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { scanText } from "../../security/scripts/security-check.mjs";

// Fake values are assembled at runtime so this file never contains a real-looking secret.
const fake = (...parts: string[]) => parts.join("");

describe("secret scanner", () => {
  const cases: Array<[string, string]> = [
    ["private key", fake("-----BEGIN RSA ", "PRIVATE KEY-----")],
    ["AWS access key", fake("AK", "IA", "ABCDEFGHIJKLMNOP")],
    ["GitHub token", fake("ghp", "_", "a".repeat(36))],
    ["Google API key", fake("AI", "za", "A".repeat(35))],
    ["npm token", fake("npm", "_", "b".repeat(36))],
    ["JSON web token", fake("ey", "J", "a".repeat(12), ".ey", "J", "b".repeat(12), ".", "c".repeat(12))],
    ["URL with embedded password", fake("postgres://app:", "Sup3rS3cretPw", "@db.prod-host.io/neuravic")],
  ];
  for (const [kind, text] of cases) {
    it(`detects a ${kind}`, () => {
      assert.deepEqual(scanText(`x = "${text}"`, "a.ts").map((f) => f.kind), [kind]);
    });
  }

  it("ignores placeholders and local development URLs", () => {
    const safe = [
      "smtps://you%40gmail.com:APP_PASSWORD@smtp.gmail.com:465",
      "postgres://postgres:test-only@127.0.0.1:5432/db",
      "postgres://user:${DB_PASSWORD}@host/db",
    ].join("\n");
    assert.deepEqual(scanText(safe, "a.md"), []);
  });

  it("never reports the secret value itself", () => {
    const [finding] = scanText(fake("ghp", "_", "a".repeat(36)), "a.ts");
    assert.deepEqual(Object.keys(finding!).sort(), ["file", "kind", "line"]);
  });
});
