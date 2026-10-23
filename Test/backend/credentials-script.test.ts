import { execFileSync } from "node:child_process";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const script = join(import.meta.dirname, "..", "..", "Security", "scripts", "generate-credentials.mjs");
const run = (...args: string[]) => execFileSync("node", [script, ...args]).toString();
const passwords = (output: string) => [...output.matchAll(/^Password: (.+)$/gm)].map((match) => match[1]!);

describe("credentials generator", () => {
  it("makes long, mixed, unique passwords and keeps the usernames given", () => {
    const output = run("Turso=a@example.com", "Resend=b@example.com", "Mailbox");
    const list = passwords(output);
    expect(list).toHaveLength(3);
    expect(new Set(list).size).toBe(3);
    for (const password of list) {
      expect(password).toHaveLength(24);
      expect(password).toMatch(/[a-z]/);
      expect(password).toMatch(/[A-Z]/);
      expect(password).toMatch(/[0-9]/);
      expect(password).toMatch(/[^A-Za-z0-9]/);
    }
    expect(output).toContain("Username: a@example.com");
    expect(output).toContain("Username: (choose one)");
  });

  it("gives a different password every run", () => {
    expect(passwords(run("X"))[0]).not.toBe(passwords(run("X"))[0]);
  });
});
