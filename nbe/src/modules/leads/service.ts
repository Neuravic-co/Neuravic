import type { Config } from "../../config";
import { hmacHex, sha256Hex } from "../../core/crypto";
import { ulid } from "../../core/ids";
import type { Logger } from "../../core/logger";
import type { Db } from "../../db/client";
import type { OutboxRepository, NewJob } from "../outbox/repository";
import type { LeadRepository } from "./repository";
import type { CreateLeadInput } from "./schema";
import { SPAM_THRESHOLD, spamScore } from "./spam";

const DAY_MS = 24 * 3_600_000;
const oneLine = (value: string) => value.replace(/[\x00-\x1f\x7f]+/g, " ").trim();

export interface LeadReceipt {
  id: string;
  status: "received";
}

export interface LeadServiceDeps {
  db: Db;
  leads: LeadRepository;
  outbox: OutboxRepository;
  config: Config;
  log: Logger;
  now: () => number;
  afterCommit: (task: () => Promise<unknown>) => void;
  deliverQueued: () => Promise<unknown>;
}

export class LeadService {
  constructor(private readonly deps: LeadServiceDeps) {}

  async create(input: CreateLeadInput, ip: string): Promise<LeadReceipt> {
    const { db, leads, outbox, config, log, now: clock } = this.deps;
    const now = clock();
    const id = ulid(now);
    if (input.website) return { id, status: "received" };

    const messageHash = sha256Hex(input.message.toLowerCase());
    const dedupeKey = hmacHex(config.hashSecret, "lead-intake", JSON.stringify([input.email, messageHash, Math.floor(now / DAY_MS)]));
    const score = spamScore(input);
    const isSpam = score >= SPAM_THRESHOLD;

    const created = await db.transaction(async (tx) => {
      const inserted = await leads.insertIfNew(tx, {
        id,
        name: input.name,
        email: input.email,
        company: input.company ?? null,
        message: input.message,
        messageHash,
        serviceInterest: input.serviceInterest,
        status: isSpam ? "spam" : "new",
        spamScore: score,
        consentAt: now,
        ipHash: hmacHex(config.hashSecret, "audit-ip", ip).slice(0, 32),
        dedupeKey,
        createdAt: now,
        updatedAt: now,
      });
      if (inserted && !isSpam) await outbox.enqueue(tx, this.notifications(id, input), now);
      return inserted;
    });

    if (!created) return { id: (await leads.idByDedupeKey(dedupeKey)) ?? id, status: "received" };

    log.info("lead_created", { leadId: id, spamScore: score, spam: isSpam });
    if (!isSpam) this.deps.afterCommit(() => this.deps.deliverQueued());
    return { id, status: "received" };
  }

  private notifications(id: string, input: CreateLeadInput): NewJob[] {
    const { config } = this.deps;
    const name = oneLine(input.name);
    return [
      {
        topic: "email",
        leadId: id,
        kind: "team",
        message: {
          to: config.notifyTo,
          from: config.emailFrom,
          subject: `New enquiry: ${name}`,
          text: [
            `Enquiry: ${id}`,
            `Name: ${name}`,
            `Email: ${input.email}`,
            `Company: ${oneLine(input.company ?? "-")}`,
            `Services: ${input.serviceInterest.join(", ") || "not specified"}`,
            "",
            input.message,
          ].join("\n"),
        },
      },
      {
        topic: "email",
        leadId: id,
        kind: "acknowledgement",
        message: {
          to: input.email,
          from: config.emailFrom,
          subject: "We received your message - Neuravic",
          text: `Hi ${name},\n\nThanks for reaching out. We received your message and will reply shortly.\n\nNeuravic\nDubai / Cairo`,
        },
      },
      { topic: "slack", text: `New enquiry from ${name} (${input.email})` },
    ];
  }
}
