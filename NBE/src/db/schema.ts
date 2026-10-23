import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from "drizzle-orm/sqlite-core";
import { sql } from "drizzle-orm";

/** All timestamps are UTC epoch milliseconds. All ids are ULIDs. */

export const STAFF_ROLES = ["admin", "delivery", "sales"] as const;
export const ORG_ROLES = ["viewer", "member", "admin", "owner"] as const;
export const LEAD_STATUSES = ["new", "qualified", "won", "lost", "spam"] as const;
export const PROJECT_STATUSES = ["active", "paused", "completed"] as const;
export const REQUEST_TYPES = ["access", "change", "support", "other"] as const;
export const REQUEST_STATES = ["open", "approved", "rejected", "cancelled", "completed"] as const;
export const OUTBOX_STATES = ["pending", "sent", "dead"] as const;
export const CONTENT_KINDS = ["service", "project", "process", "team", "company"] as const;

export const users = sqliteTable(
  "users",
  {
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    name: text("name"),
    status: text("status", { enum: ["invited", "active", "disabled"] }).notNull().default("invited"),
    staffRole: text("staff_role", { enum: STAFF_ROLES }),
    createdAt: integer("created_at").notNull(),
    lastLoginAt: integer("last_login_at"),
  },
  (t) => [uniqueIndex("users_email_unique").on(t.email)],
);

export const orgs = sqliteTable(
  "orgs",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    slug: text("slug").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [uniqueIndex("orgs_slug_unique").on(t.slug)],
);

export const memberships = sqliteTable(
  "memberships",
  {
    userId: text("user_id").notNull().references(() => users.id),
    orgId: text("org_id").notNull().references(() => orgs.id),
    role: text("role", { enum: ORG_ROLES }).notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [primaryKey({ columns: [t.userId, t.orgId] }), index("memberships_org").on(t.orgId), index("memberships_org_page").on(t.orgId, t.createdAt, t.userId)],
);

export const sessions = sqliteTable(
  "sessions",
  {
    /** sha256 of the cookie token. The raw token is never stored. */
    id: text("id").primaryKey(),
    userId: text("user_id").notNull().references(() => users.id),
    expiresAt: integer("expires_at").notNull(),
    absoluteExpiresAt: integer("absolute_expires_at").notNull(),
    ipHash: text("ip_hash"),
    userAgentHash: text("ua_hash"),
    mfaVerifiedAt: integer("mfa_verified_at"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [
    index("sessions_user").on(t.userId),
    // The cleanup job deletes expired rows every few minutes; without these it reads the whole table.
    index("sessions_expires").on(t.expiresAt),
    index("sessions_absolute_expires").on(t.absoluteExpiresAt),
  ],
);

/** Staff factors are encrypted separately from the database; recovery codes are one-way hashes. */
export const staffMfa = sqliteTable("staff_mfa", {
  userId: text("user_id").primaryKey().references(() => users.id),
  encryptedSecret: text("encrypted_secret").notNull(),
  enabledAt: integer("enabled_at"),
  createdAt: integer("created_at").notNull(),
  lastUsedStep: integer("last_used_step").notNull().default(-1),
  recoveryHashes: text("recovery_hashes", { mode: "json" }).$type<string[]>().notNull().default([]),
});

/** Request tracking only. Fulfillment must follow the approved identity/retention review. */
export const privacyRequests = sqliteTable("privacy_requests", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id),
  kind: text("kind", { enum: ["export", "erasure"] }).notNull(),
  state: text("state", { enum: ["pending", "in_review", "fulfilled", "declined"] }).notNull().default("pending"),
  createdAt: integer("created_at").notNull(),
  updatedAt: integer("updated_at").notNull(),
  reviewedBy: text("reviewed_by").references(() => users.id),
  reviewReference: text("review_reference"),
}, (t) => [index("privacy_requests_user").on(t.userId, t.createdAt, t.id), index("privacy_requests_created").on(t.createdAt, t.id),
  uniqueIndex("privacy_requests_open").on(t.userId, t.kind).where(sql`state in ('pending', 'in_review')`)]);

export const authTokens = sqliteTable(
  "auth_tokens",
  {
    /** sha256 of the emailed token. */
    id: text("id").primaryKey(),
    email: text("email").notNull(),
    purpose: text("purpose", { enum: ["login", "invite"] }).notNull(),
    expiresAt: integer("expires_at").notNull(),
    usedAt: integer("used_at"),
    createdAt: integer("created_at").notNull(),
    /** Hash of the session created by this token claim; makes claim + login one atomic batch. */
    claimedSessionId: text("claimed_session_id"),
  },
  (t) => [index("auth_tokens_email").on(t.email), index("auth_tokens_expires").on(t.expiresAt)],
);

export const leads = sqliteTable(
  "leads",
  {
    id: text("id").primaryKey(),
    name: text("name").notNull(),
    email: text("email").notNull(),
    company: text("company"),
    message: text("message").notNull(),
    messageHash: text("message_hash").notNull(),
    serviceInterest: text("service_interest", { mode: "json" }).$type<string[]>().notNull(),
    budgetBand: text("budget_band"),
    source: text("source").notNull().default("website"),
    status: text("status", { enum: LEAD_STATUSES }).notNull().default("new"),
    spamScore: integer("spam_score").notNull().default(0),
    consentAt: integer("consent_at").notNull(),
    ipHash: text("ip_hash"),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    // Inbox lists are ordered by (created_at, id) descending, with or without a status filter.
    index("leads_status_created").on(t.status, t.createdAt, t.id),
    index("leads_created").on(t.createdAt, t.id),
    index("leads_email_hash").on(t.email, t.messageHash),
  ],
);

export const leadNotes = sqliteTable(
  "lead_notes",
  {
    id: text("id").primaryKey(),
    leadId: text("lead_id").notNull().references(() => leads.id),
    authorId: text("author_id").notNull().references(() => users.id),
    body: text("body").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("lead_notes_lead").on(t.leadId)],
);

export const projects = sqliteTable(
  "projects",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().references(() => orgs.id),
    name: text("name").notNull(),
    description: text("description"),
    status: text("status", { enum: PROJECT_STATUSES }).notNull().default("active"),
    createdBy: text("created_by").notNull().references(() => users.id),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("projects_org").on(t.orgId, t.createdAt, t.id)],
);

export const requests = sqliteTable(
  "requests",
  {
    id: text("id").primaryKey(),
    projectId: text("project_id").notNull().references(() => projects.id),
    orgId: text("org_id").notNull().references(() => orgs.id),
    type: text("type", { enum: REQUEST_TYPES }).notNull(),
    title: text("title").notNull(),
    body: text("body").notNull(),
    state: text("state", { enum: REQUEST_STATES }).notNull().default("open"),
    requiredApprovals: integer("required_approvals").notNull().default(1),
    requestedBy: text("requested_by").notNull().references(() => users.id),
    createdAt: integer("created_at").notNull(),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [
    index("requests_project").on(t.projectId, t.createdAt, t.id),
    // The approver queue filters by state and shows newest first.
    index("requests_org_state_created").on(t.orgId, t.state, t.createdAt, t.id),
    index("requests_org_created").on(t.orgId, t.createdAt, t.id),
  ],
);

export const approvals = sqliteTable(
  "approvals",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull().references(() => requests.id),
    approverId: text("approver_id").notNull().references(() => users.id),
    decision: text("decision", { enum: ["approved", "rejected"] }).notNull(),
    comment: text("comment"),
    decidedAt: integer("decided_at").notNull(),
  },
  (t) => [uniqueIndex("approvals_unique").on(t.requestId, t.approverId)],
);

export const comments = sqliteTable(
  "comments",
  {
    id: text("id").primaryKey(),
    requestId: text("request_id").notNull().references(() => requests.id),
    authorId: text("author_id").notNull().references(() => users.id),
    body: text("body").notNull(),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("comments_request").on(t.requestId, t.createdAt), index("comments_request_page").on(t.requestId, t.createdAt, t.id)],
);

export const files = sqliteTable(
  "files",
  {
    id: text("id").primaryKey(),
    orgId: text("org_id").notNull().references(() => orgs.id),
    requestId: text("request_id").notNull().references(() => requests.id),
    storageKey: text("storage_key").notNull(),
    name: text("name").notNull(),
    size: integer("size").notNull(),
    mime: text("mime").notNull(),
    sha256: text("sha256").notNull(),
    scanState: text("scan_state", { enum: ["pending", "clean", "infected"] }).notNull().default("pending"),
    scanAttempts: integer("scan_attempts").notNull().default(0),
    nextScanAt: integer("next_scan_at").notNull().default(0),
    uploadedBy: text("uploaded_by").notNull().references(() => users.id),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("files_request").on(t.requestId, t.createdAt), index("files_scan_due").on(t.scanState, t.nextScanAt)],
);

export const contentItems = sqliteTable(
  "content_items",
  {
    id: text("id").primaryKey(),
    kind: text("kind", { enum: CONTENT_KINDS }).notNull(),
    slug: text("slug").notNull(),
    position: integer("position").notNull().default(0),
    data: text("data", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    published: integer("published", { mode: "boolean" }).notNull().default(true),
    updatedAt: integer("updated_at").notNull(),
  },
  (t) => [uniqueIndex("content_kind_slug").on(t.kind, t.slug)],
);

export const outbox = sqliteTable(
  "outbox",
  {
    id: text("id").primaryKey(),
    topic: text("topic", { enum: ["email", "slack"] }).notNull(),
    payload: text("payload", { mode: "json" }).$type<Record<string, unknown>>().notNull(),
    state: text("state", { enum: OUTBOX_STATES }).notNull().default("pending"),
    attempts: integer("attempts").notNull().default(0),
    nextAttemptAt: integer("next_attempt_at").notNull(),
    lastError: text("last_error"),
    createdAt: integer("created_at").notNull(),
  },
  (t) => [index("outbox_due").on(t.state, t.nextAttemptAt)],
);

export const auditLog = sqliteTable(
  "audit_log",
  {
    id: text("id").primaryKey(),
    at: integer("at").notNull(),
    actorId: text("actor_id"),
    orgId: text("org_id"),
    action: text("action").notNull(),
    targetType: text("target_type"),
    targetId: text("target_id"),
    ipHash: text("ip_hash"),
    meta: text("meta", { mode: "json" }).$type<Record<string, unknown>>(),
  },
  (t) => [
    index("audit_at").on(t.at, t.id),
    index("audit_org").on(t.orgId, t.at, t.id),
    index("audit_action").on(t.action, t.at, t.id),
  ],
);

/** Fixed-window counters for rate limiting. One row per key and window; old rows are removed by the cron job. */
export const rateLimits = sqliteTable(
  "rate_limits",
  {
    key: text("key").primaryKey(),
    count: integer("count").notNull(),
    expiresAt: integer("expires_at").notNull(),
  },
  (t) => [index("rate_limits_expires").on(t.expiresAt)],
);
