import { desc } from "drizzle-orm";
import { schema, type Db } from "../../db";
import { sha256Hex } from "../../lib/crypto";
import { ulid } from "../../lib/ids";

export interface AuditEntry {
  actorId?: string | null;
  orgId?: string | null;
  action: string;
  targetType?: string;
  targetId?: string;
  ip?: string | null;
  meta?: Record<string, unknown>;
}

/** One-way hash so logs can correlate a client without storing the address. */
export async function hashIdentifier(value: string | null | undefined): Promise<string | null> {
  return value ? (await sha256Hex(value)).slice(0, 32) : null;
}

/** Builds (does not run) the insert so it can join an atomic batch. */
export async function auditInsert(db: Db, entry: AuditEntry, now: number) {
  return db.insert(schema.auditLog).values({
    id: ulid(now),
    at: now,
    actorId: entry.actorId ?? null,
    orgId: entry.orgId ?? null,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    ipHash: await hashIdentifier(entry.ip),
    meta: entry.meta ?? null,
  });
}

export async function writeAudit(db: Db, entry: AuditEntry, now: number): Promise<void> {
  await (await auditInsert(db, entry, now));
}

export async function recentAudit(db: Db, limit = 100) {
  return db.select().from(schema.auditLog).orderBy(desc(schema.auditLog.at)).limit(limit);
}
