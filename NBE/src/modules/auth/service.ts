import { and, eq, gt, isNull } from "drizzle-orm";
import { runBatch, schema } from "../../db";
import type { Deps } from "../../deps";
import { randomToken, sha256Hex } from "../../lib/crypto";
import { unauthorized } from "../../lib/errors";
import { ulid } from "../../lib/ids";
import { auditInsert, hashIdentifier } from "../audit/audit";
import { drainOutbox, emailJob } from "../notifications/outbox";
import type { Actor, OrgRole, User } from "./actor";

export const LOGIN_TOKEN_TTL_MS = 15 * 60_000;
const HOUR = 3_600_000;
const DAY = 24 * HOUR;

/** Staff sessions are short; client sessions slide for 30 days up to 90. */
export function sessionLifetimes(user: Pick<User, "staffRole">) {
  return user.staffRole
    ? { idleMs: 12 * HOUR, absoluteMs: 12 * HOUR }
    : { idleMs: 30 * DAY, absoluteMs: 90 * DAY };
}

export async function findUserByEmail(deps: Deps, email: string): Promise<User | undefined> {
  const [user] = await deps.db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
  return user;
}

export function loginLink(deps: Deps, token: string): string {
  return `${deps.config.appUrl}/portal/verify?token=${encodeURIComponent(token)}`;
}

/**
 * Emails a single-use login link. Always resolves the same way whether or not
 * the address is known, so callers cannot probe which emails have accounts.
 */
export async function requestMagicLink(deps: Deps, email: string, ip: string): Promise<void> {
  const now = deps.now();
  const withinLimit = await deps.rateLimiter.hit(`magic-email:${email}`, 5, 3600, now);
  if (!withinLimit) return;

  let user = await findUserByEmail(deps, email);
  if (!user && deps.config.bootstrapAdminEmail === email) {
    const id = ulid(now);
    await deps.db.insert(schema.users).values({
      id,
      email,
      status: "invited",
      staffRole: "admin",
      createdAt: now,
    });
    user = await findUserByEmail(deps, email);
  }
  if (!user || user.status === "disabled") return;

  const token = randomToken();
  await runBatch(deps.db, [
    deps.db.insert(schema.authTokens).values({
      id: await sha256Hex(token),
      email,
      purpose: user.status === "invited" ? "invite" : "login",
      expiresAt: now + LOGIN_TOKEN_TTL_MS,
      createdAt: now,
    }),
    emailJob(deps.db, now, {
      to: email,
      subject: "Your Neuravic sign-in link",
      text: `Use this link to sign in. It works once and expires in 15 minutes.\n\n${loginLink(deps, token)}\n\nIf you did not ask for this, ignore this email.`,
    }),
    auditInsert(deps.db, { actorId: user.id, action: "auth.magic_link_requested" }, now, await hashIdentifier(ip)),
  ]);
  await deps.runInBackground(() => drainOutbox(deps));
}

export interface VerifiedLogin {
  user: User;
  sessionToken: string;
  maxAgeSeconds: number;
}

/** Exchanges an emailed token for a session. Tokens are single use. */
export async function verifyMagicLink(
  deps: Deps,
  token: string,
  ip: string,
  userAgent: string | undefined,
): Promise<VerifiedLogin> {
  const now = deps.now();
  const tokenHash = await sha256Hex(token);

  const claimed = await deps.db
    .update(schema.authTokens)
    .set({ usedAt: now })
    .where(
      and(
        eq(schema.authTokens.id, tokenHash),
        isNull(schema.authTokens.usedAt),
        gt(schema.authTokens.expiresAt, now),
      ),
    )
    .returning({ email: schema.authTokens.email });
  const email = claimed[0]?.email;
  if (!email) throw unauthorized("This sign-in link is invalid or has expired");

  const user = await findUserByEmail(deps, email);
  if (!user || user.status === "disabled") throw unauthorized("This sign-in link is invalid or has expired");

  const { idleMs, absoluteMs } = sessionLifetimes(user);
  const sessionToken = randomToken();
  const ipHash = await hashIdentifier(ip);
  await runBatch(deps.db, [
    deps.db.insert(schema.sessions).values({
      id: await sha256Hex(sessionToken),
      userId: user.id,
      expiresAt: now + idleMs,
      absoluteExpiresAt: now + absoluteMs,
      ipHash,
      userAgentHash: await hashIdentifier(userAgent),
      createdAt: now,
    }),
    deps.db.update(schema.users).set({ status: "active", lastLoginAt: now }).where(eq(schema.users.id, user.id)),
    auditInsert(deps.db, { actorId: user.id, action: "auth.login" }, now, ipHash),
  ]);
  return { user: { ...user, status: "active" }, sessionToken, maxAgeSeconds: Math.floor(Math.min(idleMs, absoluteMs) / 1000) };
}

/** Resolves a session cookie value to an actor, extending idle expiry when due. */
export async function actorFromSession(deps: Deps, sessionToken: string): Promise<Actor | null> {
  const now = deps.now();
  const sessionId = await sha256Hex(sessionToken);
  const [row] = await deps.db
    .select({ session: schema.sessions, user: schema.users })
    .from(schema.sessions)
    .innerJoin(schema.users, eq(schema.users.id, schema.sessions.userId))
    .where(eq(schema.sessions.id, sessionId))
    .limit(1);
  if (!row) return null;
  const { session, user } = row;
  if (user.status !== "active" || session.expiresAt <= now || session.absoluteExpiresAt <= now) return null;

  const { idleMs } = sessionLifetimes(user);
  if (session.expiresAt - now < idleMs - HOUR) {
    await deps.db
      .update(schema.sessions)
      .set({ expiresAt: Math.min(now + idleMs, session.absoluteExpiresAt) })
      .where(eq(schema.sessions.id, sessionId));
  }

  const memberRows = await deps.db
    .select({ orgId: schema.memberships.orgId, role: schema.memberships.role })
    .from(schema.memberships)
    .where(eq(schema.memberships.userId, user.id));
  const memberships = new Map<string, OrgRole>(memberRows.map((m) => [m.orgId, m.role]));
  return { user, memberships, sessionId };
}

export async function endSession(deps: Deps, actor: Actor): Promise<void> {
  const now = deps.now();
  await runBatch(deps.db, [
    deps.db.delete(schema.sessions).where(eq(schema.sessions.id, actor.sessionId)),
    auditInsert(deps.db, { actorId: actor.user.id, action: "auth.logout" }, now),
  ]);
}
