#!/usr/bin/env node
import { execFileSync, spawnSync } from "node:child_process";
import { readFileSync, existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../..");
const patterns = [
  ["private key", /-----BEGIN [A-Z ]*PRIVATE KEY-----/g],
  ["AWS access key", /AKIA[0-9A-Z]{16}/g],
  ["Slack token", /xox[baprs]-[0-9A-Za-z-]{10,}/g],
  ["GitHub token", /gh[pousr]_[0-9A-Za-z]{30,}|github_pat_[0-9A-Za-z_]{50,}/g],
  ["live payment key", /sk_live_[0-9A-Za-z]{16,}/g],
  ["email provider key", /re_[0-9A-Za-z]{20,}_[0-9A-Za-z]{10,}/g],
  ["private signing JWK", /"d"\s*:\s*"[A-Za-z0-9_-]{40,}"/g],
];

/** Return metadata only. Callers must never print matched source text. */
export function scanText(text, filename) {
  const results = [];
  for (const [kind, pattern] of patterns) {
    pattern.lastIndex = 0;
    for (const match of text.matchAll(pattern)) results.push({ file: filename, line: text.slice(0, match.index).split("\n").length, kind });
  }
  return results;
}

export function scanFiles(directory) {
  const files = execFileSync("git", ["ls-files", "-z", "--cached", "--others", "--exclude-standard"], { cwd: directory }).toString().split("\0").filter(Boolean);
  const findings = [];
  for (const filename of new Set(files)) {
    if (/(^|\/)(\.env(?:\..+)?|\.dev\.vars(?:\..+)?|.*\.(?:pem|key|p12|pfx)|id_rsa|id_ed25519)$/.test(filename) && !/\.(example|sample)$/.test(filename)) findings.push({ file: filename, line: 0, kind: "secret-like file" });
    const absolute = path.join(directory, filename);
    if (!existsSync(absolute) || filename === "security/scripts/security-check.mjs") continue;
    const content = readFileSync(absolute);
    if (!content.includes(0)) findings.push(...scanText(content.toString("utf8"), filename));
  }
  return findings;
}

function dependencyAudit(folder) {
  const args = ["audit", "--json", "--package-lock-only", "--audit-level=moderate", "--fetch-retries=0", "--fetch-timeout=30000"];
  const npmCli = path.join(path.dirname(process.execPath), "node_modules/npm/bin/npm-cli.js");
  const command = process.platform === "win32" ? process.execPath : "npm";
  const result = spawnSync(command, process.platform === "win32" ? [npmCli, ...args] : args, {
    cwd: path.join(root, folder), encoding: "utf8", timeout: 90_000, maxBuffer: 8 * 1024 * 1024,
  });
  let report;
  try { report = JSON.parse(result.stdout); } catch { /* Fail closed on network/tool errors. */ }
  const counts = report?.metadata?.vulnerabilities;
  if (result.error || report?.error || !counts || ![0, 1].includes(result.status)) {
    console.error(`FAIL ${folder}: dependency audit unavailable; check registry connectivity and rerun`);
    return false;
  }
  console.log(`${folder === "." ? "backend" : folder}: all dependency advisories: critical=${counts.critical}, high=${counts.high}, moderate=${counts.moderate}, low=${counts.low}`);
  return counts.moderate === 0 && counts.high === 0 && counts.critical === 0;
}

export function main(args = process.argv.slice(2)) {
  let passed = true;
  for (const finding of scanFiles(root)) {
    console.error(`FAIL ${finding.kind} at ${JSON.stringify(finding.file)}:${finding.line} (value redacted)`);
    passed = false;
  }
  if (args.includes("--history")) {
    const history = execFileSync("git", ["log", "--all", "-p", "--format=", "--no-ext-diff", "--no-textconv", "--", ".", ":(exclude)*package-lock.json"], {
      cwd: root, maxBuffer: 32 * 1024 * 1024,
    }).toString();
    for (const finding of scanText(history, "repository history")) {
      console.error(`FAIL ${finding.kind} in repository history (value redacted; investigate privately and rotate if real)`);
      passed = false;
    }
  }
  if (!args.includes("--secrets-only")) for (const folder of [".", "nfe"]) if (!dependencyAudit(folder)) passed = false;
  console.log(passed ? "Security check passed" : "Security check failed");
  return passed ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { process.exitCode = main(); }
  catch { console.error("Security scan unavailable; no source values were printed"); process.exitCode = 1; }
}
