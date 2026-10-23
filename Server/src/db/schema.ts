import { bigint, boolean, customType, index, int, mysqlTable, primaryKey, text, uniqueIndex, varchar } from "drizzle-orm/mysql-core";

/**
 * MySQL schema. The tables, triggers and the partial-index replacement are created by sql/001_init.sql,
 * which is what actually runs; the indexes below document it and keep the types in sync.
 * All timestamps are UTC epoch milliseconds. All ids are ULIDs (or sha256 hex for sessions and tokens).
 */

export const STAFF_ROLES = ["admin", "delivery", "sales"] as const;
export const ORG_ROLES = ["viewer", "member", "admin", "owner"] as const;
export const LEAD_STATUSES = ["new", "qualified", "won", "lost", "spam"] as const;
export const PROJECT_STATUSES = ["active", "paused", "completed"] as const;
export const REQUEST_TYPES = ["access", "change", "support", "other"] as const;
export const REQUEST_STATES = ["open", "approved", "rejected", "cancelled", "completed"] as const;
export const OUTBOX_STATES = ["pending", "sent", "dead"] as const;
export const CONTENT_KINDS = ["service", "project", "process", "team", "company"] as const;

const id = (name: string) => varchar(name, { length: 64 });
const epoch = (name: string) => bigint(name, { mode: "number" });

/** JSON kept in a text column, so equality comparisons behave like plain strings. */
const jsonText = <T>() =>
  customType<{ data: T; driverData: string }>({
    dataType: () => "mediumtext",
    toDriver: (value) => JSON.stringify(value),
    fromDriver: (value) => JSON.parse(value) as T,
  });

export const users = mysqlTable(
  "users",
  {
    id: id("id").primaryKey(),
    email: varchar("email", { length: 254 }).notNull(),
    name: varchar("name", { length: 255 }),
    status: varchar("status", { length: 16, enum: ["invited", "active", "disabled"] }).notNull().default("invited"),
    staffRole: varchar("staff_role", { length: 16, enum: STAFF_ROLES }),
    createdAt: epoch("created_at").notNull(),
    lastLoginAt: epoch("last_login_at"),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const orgs = mysqlTable(
  "orgs",
  {
    id: id("id").primaryKey(),
    name: varchar("name", { length: 255 }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    createdAt: epoch("created_at").notNull(),
  },
  (t) => [uniqueIndex("orgs_slug_unique").on(t.slug)],
);

export const memberships = mysqlTable(
  "memberships",
  {
    userId: id("user_id").notNull().references(() => users.id),
    orgId: id("org_id").notNull().references(() => orgs.id),
    role: varchar("role", { length: 16, enum: ORG_ROLES }).notNull(),
    createdAt: epoch("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.orgId] }), index("memberships_org").on(t.orgId), index("memberships_org_page").on(t.orgId, t.createdAt, t.userId)],
);

export const sessions = mysqlTable(
  "sessions",
  {
    /** sha256 of the cookie token. The raw token is never stored. */
    id: id("id").primaryKey(),
    userId: id("user_id").notNull().references(() => users.id),
    expiresAt: epoch("expires_at").notNull(),
    absoluteExpiresAt: epoch("absolute_expires_at").notNull(),
    ipHash: varchar("ip_hash", { length: 64 }),
    userAgentHash: varchar("ua_hash", { length: 64 }),
    mfaVerifiedAt: epoch("mfa_verified_at"),
    createdAt: epoch("created_at").notNull(),
  },
  (t) => [index("sessions_user").on(t.userId), index("sessions_expires").on(t.expiresAt), index("sessions_absolute_expires").on(t.absoluteExpiresAt)],
);

/** Staff factors are encrypted separately from the database; recovery codes are one-way hashes. */
export const staffMfa = mysqlTable("staff_mfa", {
  userId: id("user_id").primaryKey().references(() => users.id),
  encryptedSecret: varchar("encrypted_secret", { length: 512 }).notNull(),
  enabledAt: epoch("enabled_at"),
  createdAt: epoch("created_at").notNull(),
  lastUsedStep: epoch("last_used_step").notNull().default(-1),
  recoveryHashes: jsonText<string[]>()("recovery_hashes").notNull(),
});

/** Request tracking only. Fulfillment must follow the approved identity/retention review. */
export const privacyRequests = mysqlTable(
  "privacy_requests",
  {
    id: id("id").primaryKey(),
    userId: id("user_id").notNull().references(() => users.id),
    kind: varchar("kind", { length: 16, enum: ["export", "erasure"] }).notNull(),
    state: varchar("state", { length: 16, enum: ["pending", "in_review", "fulfilled", "declined"] }).notNull().default("pending"),
    createdAt: epoch("created_at").notNull(),
    updatedAt: epoch("updated_at").notNull(),
    reviewedBy: id("reviewed_by").references(() => users.id),
    reviewReference: varchar("review_reference", { length: 100 }),
  },
  (t) => [index("privacy_requests_user").on(t.userId, t.createdAt, t.id), index("privacy_requests_created").on(t.createdAt, t.id)],
);

export const authTokens = mysqlTable(
  "auth_tokens",
  {
    /** sha256 of the emailed token. */
    id: id("id").primaryKey(),
    email: varchar("email", { length: 254 }).notNull(),
    purpose: varchar("purpose", { length: 16, enum: ["login", "invite"] }).notNull(),
    expiresAt: epoch("expires_at").notNull(),
    usedAt: epoch("used_at"),
    createdAt: epoch("created_at").notNull(),
    /** Hash of the session created by this token claim; makes claim + login one atomic batch. */
    claimedSessionId: id("claimed_session_id"),
  },
  (t) => [index("auth_tokens_email").on(t.email), index("auth_tokens_expires").on(t.expiresAt)],
);

export const leads = mysqlTable(
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
    spamScore: int("spam_score").notNull().default(0),
    consentAt: epoch("consent_at").notNull(),
    ipHash: varchar("ip_hash", { length: 64 }),
    createdAt: epoch("created_at").notNull(),
    updatedAt: epoch("updated_at").notNull(),
  },
  (t) => [
    index("leads_status_created").on(t.status, t.createdAt, t.id),
    index("leads_created").on(t.createdAt, t.id),
    index("leads_email_hash").on(t.email, t.messageHash),
  ],
);

export const leadNotes = mysqlTable(
  "lead_notes",
  {
    id: id("id").primaryKey(),
    leadId: id("lead_id").notNull().references(() => leads.id),
    authorId: id("author_id").notNull().references(() => users.id),
    body: text("body").notNull(),
    createdAt: epoch("created_at").notNull(),
  },
  (t) => [index("lead_notes_lead").on(t.leadId)],
);

export const projects = mysqlTable(
  "projects",
  {
    id: id("id").primaryKey(),
    orgId: id("org_id").notNull().references(() => orgs.id),
    name: varchar("name", { length: 255 }).notNull(),
    description: text("description"),
    status: varchar("status", { length: 16, enum: PROJECT_STATUSES }).notNull().default("active"),
    createdBy: id("created_by").notNull().references(() => users.id),
    createdAt: epoch("created_at").notNull(),
  },
  (t) => [index("projects_org").on(t.orgId, t.createdAt, t.id)],
);

export const requests = mysqlTable(
  "requests",
  {
    id: id("id").primaryKey(),
    projectId: id("project_id").notNull().references(() => projects.id),
    orgId: id("org_id").notNull().references(() => orgs.id),
    type: varchar("type", { length: 16, enum: REQUEST_TYPES }).notNull(),
    title: varchar("title", { length: 255 }).notNull(),
    body: text("body").notNull(),
    state: varchar("state", { length: 16, enum: REQUEST_STATES }).notNull().default("open"),
    requiredApprovals: int("required_approvals").notNull().default(1),
    requestedBy: id("requested_by").notNull().references(() => users.id),
    createdAt: epoch("created_at").notNull(),
    updatedAt: epoch("updated_at").notNull(),
  },
  (t) => [
    index("requests_project").on(t.projectId, t.createdAt, t.id),
    index("requests_org_state_created").on(t.orgId, t.state, t.createdAt, t.id),
    index("requests_org_created").on(t.orgId, t.createdAt, t.id),
  ],
);

export const approvals = mysqlTable(
  "approvals",
  {
    id: id("id").primaryKey(),
    requestId: id("request_id").notNull().references(() => requests.id),
    approverId: id("approver_id").notNull().references(() => users.id),
    decision: varchar("decision", { length: 16, enum: ["approved", "rejected"] }).notNull(),
    comment: text("comment"),
    decidedAt: epoch("decided_at").notNull(),
  },
  (t) => [uniqueIndex("approvals_unique").on(t.requestId, t.approverId)],
);

export const comments = mysqlTable(
  "comments",
  {
    id: id("id").primaryKey(),
    requestId: id("request_id").notNull().references(() => requests.id),
    authorId: id("author_id").notNull().references(() => users.id),
    body: text("body").notNull(),
    createdAt: epoch("created_at").notNull(),
  },
  (t) => [index("comments_request").on(t.requestId, t.createdAt), index("comments_request_page").on(t.requestId, t.createdAt, t.id)],
);

export const files = mysqlTable(
  "files",
  {
    id: id("id").primaryKey(),
    orgId: id("org_id").notNull().references(() => orgs.id),
    requestId: id("request_id").notNull().references(() => requests.id),
    storageKey: varchar("storage_key", { length: 255 }).notNull(),
    name: varchar("name", { length: 255 }).notNull(),
    size: int("size").notNull(),
    mime: varchar("mime", { length: 150 }).notNull(),
    sha256: varchar("sha256", { length: 64 }).notNull(),
    scanState: varchar("scan_state", { length: 16, enum: ["pending", "clean", "infected"] }).notNull().default("pending"),
    scanAttempts: int("scan_attempts").notNull().default(0),
    nextScanAt: epoch("next_scan_at").notNull().default(0),
    uploadedBy: id("uploaded_by").notNull().references(() => users.id),
    createdAt: epoch("created_at").notNull(),
  },
  (t) => [index("files_request").on(t.requestId, t.createdAt), index("files_scan_due").on(t.scanState, t.nextScanAt)],
);

export const contentItems = mysqlTable(
  "content_items",
  {
    id: id("id").primaryKey(),
    kind: varchar("kind", { length: 16, enum: CONTENT_KINDS }).notNull(),
    slug: varchar("slug", { length: 120 }).notNull(),
    position: int("position").notNull().default(0),
    data: jsonText<Record<string, unknown>>()("data").notNull(),
    published: boolean("published").notNull().default(true),
    updatedAt: epoch("updated_at").notNull(),
  },
  (t) => [uniqueIndex("content_kind_slug").on(t.kind, t.slug)],
);

export const outbox = mysqlTable(
  "outbox",
  {
    id: id("id").primaryKey(),
    topic: varchar("topic", { length: 16, enum: ["email", "slack"] }).notNull(),
    payload: jsonText<Record<string, unknown>>()("payload").notNull(),
    state: varchar("state", { length: 16, enum: OUTBOX_STATES }).notNull().default("pending"),
    attempts: int("attempts").notNull().default(0),
    nextAttemptAt: epoch("next_attempt_at").notNull(),
    lastError: varchar("last_error", { length: 255 }),
    createdAt: epoch("created_at").notNull(),
  },
  (t) => [index("outbox_due").on(t.state, t.nextAttemptAt)],
);

export const auditLog = mysqlTable(
  "audit_log",
  {
    id: id("id").primaryKey(),
    at: epoch("at").notNull(),
    actorId: id("actor_id"),
    orgId: id("org_id"),
    action: varchar("action", { length: 100 }).notNull(),
    targetType: varchar("target_type", { length: 64 }),
    targetId: varchar("target_id", { length: 255 }),
    ipHash: varchar("ip_hash", { length: 64 }),
    meta: jsonText<Record<string, unknown>>()("meta"),
  },
  (t) => [index("audit_at").on(t.at, t.id), index("audit_org").on(t.orgId, t.at, t.id), index("audit_action").on(t.action, t.at, t.id)],
);

/** Fixed-window counters for rate limiting. One row per key and window; old rows are removed by maintenance. */
export const rateLimits = mysqlTable(
  "rate_limits",
  {
    key: varchar("key", { length: 255 }).primaryKey(),
    count: int("count").notNull(),
    expiresAt: epoch("expires_at").notNull(),
  },
  (t) => [index("rate_limits_expires").on(t.expiresAt)],
);

export const userPasswords = mysqlTable("user_passwords", {
  userId: id("user_id").primaryKey().references(() => users.id),
  /** scrypt$N$r$p$salt$hash (base64url). Never returned by any endpoint. */
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  updatedAt: epoch("updated_at").notNull(),
});
