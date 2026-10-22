import { desc, sql, type SQL } from "drizzle-orm";
import { schema, type Db } from "../../db";
import { hmacHex } from "../../lib/crypto";
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
export async function hashIdentifier(value: string | null | undefined, secret: string, namespace = "audit-ip"): Promise<string | null> {
  return value ? (await hmacHex(secret, namespace, value)).slice(0, 32) : null;
}

/**
 * Builds (does not run) the insert so it can join an atomic batch.
 * Synchronous on purpose: returning a query from an async function would execute it.
 */
export function auditInsert(db: Db, entry: AuditEntry, now: number, ipHash: string | null = null, condition?: SQL) {
  const row = {
    id: ulid(now),
    at: now,
    actorId: entry.actorId ?? null,
    orgId: entry.orgId ?? null,
    action: entry.action,
    targetType: entry.targetType ?? null,
    targetId: entry.targetId ?? null,
    ipHash,
    meta: entry.meta ?? null,
  };
  if (!condition) return db.insert(schema.auditLog).values(row);
  // All values remain bound parameters. This can follow a conditional mutation in the same batch.
  return db.insert(schema.auditLog).select(sql`select ${row.id}, ${row.at}, ${row.actorId}, ${row.orgId},
    ${row.action}, ${row.targetType}, ${row.targetId}, ${row.ipHash}, ${row.meta ? JSON.stringify(row.meta) : null}
    where ${condition}`);
}

export async function writeAudit(db: Db, entry: AuditEntry, now: number, privacySecret?: string): Promise<void> {
  if (entry.ip && !privacySecret) throw new Error("A privacy key is required to record an IP identifier");
  await auditInsert(db, entry, now, entry.ip ? await hashIdentifier(entry.ip, privacySecret!) : null);
}

export async function recentAudit(db: Db, limit = 100) {
  return db.select().from(schema.auditLog).orderBy(desc(schema.auditLog.at)).limit(limit);
}
