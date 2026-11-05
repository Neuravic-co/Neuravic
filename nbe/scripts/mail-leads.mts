import { createHash } from "node:crypto";
import { appendFileSync, readFileSync } from "node:fs";
import pg from "pg";
import { SmtpMailer } from "../src/modules/mail/smtp";

const LOG_FILE = ".mail-leads.log";
const DELAY_MS = 1500;
const FOOTER = "\n\n--\nYou are receiving this because you contacted Neuravic through our website. Reply \"stop\" and we will not email you again.";

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  return index === -1 ? undefined : process.argv[index + 1];
}

const send = process.argv.includes("--send");
const subject = argument("subject");
const bodyFile = argument("body-file");
const testTo = argument("test-to");

if (!subject || !bodyFile) {
  console.error('Usage: npm run mail:leads -- --subject "Subject" --body-file message.txt [--test-to you@example.com] [--send]');
  process.exit(1);
}

const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
const smtpUrl = process.env.SMTP_URL;
const from = process.env.EMAIL_FROM;
if (!databaseUrl || !from || (send && !smtpUrl)) {
  console.error("DATABASE_URL, EMAIL_FROM and (with --send) SMTP_URL must be set in .env");
  process.exit(1);
}

const template = readFileSync(bodyFile, "utf8").trim();
const campaign = createHash("sha256").update(`${subject}\n${template}`).digest("hex").slice(0, 16);
function readSentLog(): string {
  try {
    return readFileSync(LOG_FILE, "utf8");
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return "";
    throw error;
  }
}

const alreadySent = new Set(
  readSentLog().split(/\r?\n/).filter((line) => line.startsWith(`${campaign} `)).map((line) => line.slice(campaign.length + 1)),
);

const render = (name: string) => `${template.replaceAll("{name}", name.split(/\s+/)[0] || "there")}${FOOTER}`;

let recipients: { email: string; name: string }[];
if (testTo) {
  recipients = [{ email: testTo, name: "Test" }];
} else {
  const client = new pg.Client({ connectionString: databaseUrl });
  await client.connect();
  const result = await client.query<{ email: string; name: string }>(
    "SELECT DISTINCT ON (lower(email)) lower(email) AS email, name FROM leads WHERE status = 'new' ORDER BY lower(email), created_at",
  );
  await client.end();
  recipients = result.rows.filter((row) => !alreadySent.has(row.email));
}

console.log(`${send ? "SENDING" : "DRY RUN"}: ${recipients.length} recipient(s), subject "${subject}"`);
recipients.forEach((row) => console.log(`  - ${row.email}`));
if (recipients[0]) console.log(`\nFirst message:\n\n${render(recipients[0].name)}\n`);

if (!send) {
  console.log("Nothing was sent. Add --send to send for real.");
  process.exit(0);
}

const mailer = new SmtpMailer(smtpUrl!);
let sent = 0;
for (const row of recipients) {
  try {
    await mailer.send({ to: row.email, from, subject, text: render(row.name) }, { idempotencyKey: `${campaign}-${row.email}` });
    sent += 1;
    if (!testTo) appendFileSync(LOG_FILE, `${campaign} ${row.email}\n`);
    console.log(`sent ${sent}/${recipients.length}: ${row.email}`);
  } catch (error) {
    console.error(`failed for ${row.email}: ${(error as Error).message}. Stopping; run again to continue where it stopped.`);
    process.exit(1);
  }
  await new Promise((resolve) => setTimeout(resolve, DELAY_MS));
}
console.log(`Done. Sent ${sent} email(s).`);
