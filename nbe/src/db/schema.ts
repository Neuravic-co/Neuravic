import { bigint, customType, index, integer, pgTable, text, uniqueIndex, varchar } from "drizzle-orm/pg-core";

export const LEAD_STATUSES = ["new", "spam"] as const;
export const OUTBOX_STATES = ["pending", "sent", "dead"] as const;
export const OUTBOX_TOPICS = ["email", "slack"] as const;

const id = (name: string) => varchar(name, { length: 64 });
const epoch = (name: string) => bigint(name, { mode: "number" });

const jsonText = <T>() =>
  customType<{ data: T; driverData: string }>({
    dataType: () => "text",
    toDriver: (value) => JSON.stringify(value),
    fromDriver: (value) => JSON.parse(value) as T,
  });

export const leads = pgTable(
  "leads",
  {
    id: id("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    email: varchar("email", { length: 254 }).notNull(),
    company: varchar("company", { length: 255 }),
    message: text("message").notNull(),
    messageHash: varchar("message_hash", { length: 64 }).notNull(),
    serviceInterest: jsonText<string[]>()("service_interest").notNull(),
    budgetBand: varchar("budget_band", { length: 100 }),
    source: varchar("source", { length: 100 }).notNull().default("website"),
    status: varchar("status", { length: 16, enum: LEAD_STATUSES }).notNull().default("new"),
    spamScore: integer("spam_score").notNull().default(0),
    consentAt: epoch("consent_at").notNull(),
    ipHash: varchar("ip_hash", { length: 64 }),
    dedupeKey: varchar("dedupe_key", { length: 64 }).notNull(),
    createdAt: epoch("created_at").notNull(),
    updatedAt: epoch("updated_at").notNull(),
  },
  (t) => [
    index("leads_status_created").on(t.status, t.createdAt, t.id),
    index("leads_created").on(t.createdAt, t.id),
    uniqueIndex("leads_dedupe_key").on(t.dedupeKey),
  ],
);

export const outbox = pgTable(
  "outbox",
  {
    id: id("id").primaryKey(),
    topic: varchar("topic", { length: 16, enum: OUTBOX_TOPICS }).notNull(),
    payload: jsonText<Record<string, unknown>>()("payload").notNull(),
    state: varchar("state", { length: 16, enum: OUTBOX_STATES }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: epoch("next_attempt_at").notNull(),
    lastError: varchar("last_error", { length: 255 }),
    createdAt: epoch("created_at").notNull(),
    provider: varchar("provider", { length: 16 }),
    providerMessageId: varchar("provider_message_id", { length: 255 }),
    acceptedAt: epoch("accepted_at"),
    leadId: id("lead_id"),
    notificationKind: varchar("notification_kind", { length: 32 }),
  },
  (t) => [index("outbox_due").on(t.state, t.nextAttemptAt), index("outbox_lead").on(t.leadId)],
);

export const rateLimits = pgTable(
  "rate_limits",
  {
    key: varchar("key", { length: 255 }).primaryKey(),
    count: integer("count").notNull(),
    expiresAt: epoch("expires_at").notNull(),
  },
  (t) => [index("rate_limits_expires").on(t.expiresAt)],
);
