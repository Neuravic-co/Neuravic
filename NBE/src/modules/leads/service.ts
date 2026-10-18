import { and, eq, gte } from "drizzle-orm";
import { runBatch, schema } from "../../db";
import type { Deps } from "../../deps";
import { sha256Hex } from "../../lib/crypto";
import { ulid } from "../../lib/ids";
import { auditInsert, hashIdentifier } from "../audit/audit";
import { drainOutbox, emailJob, slackJob } from "../notifications/outbox";
import type { CreateLeadInput } from "./schemas";
import { SPAM_THRESHOLD, spamScore } from "./spam";

const DEDUPE_WINDOW_MS = 24 * 3_600_000;
const oneLine = (value: string) => value.replace(/[\r\n]+/g, " ").trim();

export interface CreatedLead {
  id: string;
  status: "received";
}

/**
 * Stores an enquiry and queues the team notification, the sender
 * acknowledgement and a chat alert in one atomic write.
 */
export async function createLead(deps: Deps, input: CreateLeadInput, ip: string): Promise<CreatedLead> {
  const { db, config } = deps;
  const now = deps.now();

  // Honeypot filled: pretend success, store nothing.
  if (input.website) return { id: ulid(now), status: "received" };

  const messageHash = await sha256Hex(input.message.toLowerCase());
  const [duplicate] = await db
    .select({ id: schema.leads.id })
    .from(schema.leads)
    .where(
      and(
        eq(schema.leads.email, input.email),
        eq(schema.leads.messageHash, messageHash),
        gte(schema.leads.createdAt, now - DEDUPE_WINDOW_MS),
      ),
    )
    .limit(1);
  if (duplicate) return { id: duplicate.id, status: "received" };

  const ipHash = await hashIdentifier(ip);
  const score = spamScore(input);
  const isSpam = score >= SPAM_THRESHOLD;
  const id = ulid(now);

  const writes: unknown[] = [
    db.insert(schema.leads).values({
      id,
      name: input.name,
      email: input.email,
      company: input.company ?? null,
      message: input.message,
      messageHash,
      serviceInterest: input.serviceInterest,
      budgetBand: input.budgetBand ?? null,
      source: input.source,
      status: isSpam ? "spam" : "new",
      spamScore: score,
      consentAt: now,
      ipHash,
      createdAt: now,
      updatedAt: now,
    }),
    auditInsert(db, { action: "lead.created", targetType: "lead", targetId: id, meta: { spamScore: score } }, now, ipHash),
  ];

  if (!isSpam) {
    const services = input.serviceInterest.length ? input.serviceInterest.join(", ") : "not specified";
    writes.push(
      emailJob(db, now, {
        to: config.notifyTo,
        subject: `New enquiry: ${oneLine(input.name)}`,
        text: [
          `Name: ${oneLine(input.name)}`,
          `Email: ${input.email}`,
          `Company: ${oneLine(input.company ?? "-")}`,
          `Services: ${services}`,
          `Budget: ${oneLine(input.budgetBand ?? "-")}`,
          "",
          input.message,
        ].join("\n"),
      }),
      emailJob(db, now, {
        to: input.email,
        subject: "We received your message - Neuravic",
        text: `Hi ${oneLine(input.name)},\n\nThanks for reaching out. We received your message and will reply shortly.\n\nNeuravic\nDubai / Cairo`,
      }),
      slackJob(db, now, `New enquiry from ${oneLine(input.name)} (${input.email})`),
    );
  }

  await runBatch(db, writes);
  if (!isSpam) await deps.runInBackground(() => drainOutbox(deps));
  return { id, status: "received" };
}
