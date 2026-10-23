import { and, eq, gt, isNull, ne, sql } from "drizzle-orm";
import { runBatch, schema } from "../../db";
import type { Deps } from "../../deps";
import { randomToken, sha256Hex } from "../../lib/crypto";
import { unauthorized } from "../../lib/errors";
import { ulid } from "../../lib/ids";
import { auditInsert, hashIdentifier } from "../audit/audit";
import { drainOutbox, emailJob } from "../notifications/outbox";
import type { Actor, OrgRole, User } from "./actor";
import { MFA_PENDING_TTL_MS, mfaRecord } from "./mfa";

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
  // URL fragments are not sent to the web server or included in HTTP Referer headers.
  return `${deps.config.appUrl}/portal/verify#token=${encodeURIComponent(token)}`;
}

/**
 * Builds the writes that create a login token and queue its email.
 * `invitedTo` switches the wording to an invitation.
 */
export async function loginLinkWrites(deps: Deps, user: User, now: number, invitedTo?: string) {
  const token = randomToken();
  const link = loginLink(deps, token);
  const text = invitedTo
    ? `You have been invited to ${invitedTo} on the Neuravic portal.\n\nUse this link to sign in. It works once and expires in 15 minutes.\n\n${link}`
    : `Use this link to sign in. It works once and expires in 15 minutes.\n\n${link}\n\nIf you did not ask for this, ignore this email.`;
  return [
    deps.db.insert(schema.authTokens).values({
      id: await sha256Hex(token),
      email: user.email,
      purpose: user.status === "invited" ? "invite" : "login",
      expiresAt: now + LOGIN_TOKEN_TTL_MS,
      createdAt: now,
    }),
    emailJob(deps.db, now, {
      to: user.email,
      subject: invitedTo ? `You are invited to ${invitedTo}` : "Your Neuravic sign-in link",
      text,
    }, now + LOGIN_TOKEN_TTL_MS),
  ];
}

/**
 * Emails a single-use login link. Always resolves the same way whether or not
 * the address is known, so callers cannot probe which emails have accounts.
 */
export async function requestMagicLink(deps: Deps, email: string, ip: string): Promise<void> {
  const now = deps.now();
  const identifier = await hashIdentifier(email, deps.config.privacyHashSecret, "rate:magic-email");
  const withinLimit = await deps.rateLimiter.hit(`magic-email:${identifier}`, 5, 3600, now);
  if (!withinLimit) return;

  let user = await findUserByEmail(deps, email);
  if (!user && deps.config.bootstrapAdminEmail === email) {
    // A concurrent request may create the same user first; the insert then does nothing.
    await deps.db
      .insert(schema.users)
      .values({ id: ulid(now), email, status: "invited", staffRole: "admin", createdAt: now })
      .onConflictDoNothing();
    user = await findUserByEmail(deps, email);
  }
  if (!user || user.status === "disabled") return;

  await runBatch(deps.db, [
    ...(await loginLinkWrites(deps, user, now)),
    auditInsert(deps.db, { actorId: user.id, action: "auth.magic_link_requested" }, now, await hashIdentifier(ip, deps.config.privacyHashSecret)),
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
  previousSessionId?: string,
): Promise<VerifiedLogin> {
  const now = deps.now();
  const tokenHash = await sha256Hex(token);

  const [available] = await deps.db
    .select({ email: schema.authTokens.email })
    .from(schema.authTokens)
    .where(
      and(
        eq(schema.authTokens.id, tokenHash),
        isNull(schema.authTokens.usedAt),
        gt(schema.authTokens.expiresAt, now),
      ),
    )
    .limit(1);
  const email = available?.email;
  if (!email) throw unauthorized("This sign-in link is invalid or has expired");

  const user = await findUserByEmail(deps, email);
  if (!user || user.status === "disabled") throw unauthorized("This sign-in link is invalid or has expired");

  const { idleMs, absoluteMs } = sessionLifetimes(user);
  const sessionToken = randomToken();
  const sessionId = await sha256Hex(sessionToken);
  const ipHash = await hashIdentifier(ip, deps.config.privacyHashSecret);
  const userAgentHash = await hashIdentifier(userAgent, deps.config.privacyHashSecret, "audit-user-agent");
  const claimBelongsToUs = sql`exists (select 1 from auth_tokens where id = ${tokenHash}
    and claimed_session_id = ${sessionId} and used_at = ${now})`;
  await runBatch(deps.db, [
    deps.db.update(schema.authTokens).set({ usedAt: now, claimedSessionId: sessionId }).where(and(
      eq(schema.authTokens.id, tokenHash), isNull(schema.authTokens.usedAt), gt(schema.authTokens.expiresAt, now),
      sql`exists (select 1 from users where id = ${user.id} and status <> 'disabled' and staff_role is ${user.staffRole})`,
    )),
    deps.db.update(schema.users).set({ status: "active", lastLoginAt: now }).where(and(
      eq(schema.users.id, user.id), ne(schema.users.status, "disabled"), claimBelongsToUs,
    )),
    // The per-claim session hash distinguishes even simultaneous verifications at the same timestamp.
    deps.db.insert(schema.sessions).select(sql`select ${sessionId}, ${user.id}, ${now + idleMs},
      ${now + absoluteMs}, ${ipHash}, ${userAgentHash}, null, ${now} where ${claimBelongsToUs}`),
    ...(previousSessionId ? [deps.db.delete(schema.sessions).where(and(eq(schema.sessions.id, previousSessionId), claimBelongsToUs))] : []),
    auditInsert(deps.db, { actorId: user.id, action: "auth.login" }, now, ipHash, claimBelongsToUs),
  ]);
  const [session] = await deps.db.select({ id: schema.sessions.id }).from(schema.sessions).where(eq(schema.sessions.id, sessionId)).limit(1);
  if (!session) throw unauthorized("This sign-in link is invalid or has expired");
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
  const factor = user.staffRole ? await mfaRecord(deps, user.id) : undefined;
  // A proof is valid only for a currently enrolled factor, including after supervised recovery.
  const verified = factor?.enabledAt != null && session.mfaVerifiedAt !== null && session.mfaVerifiedAt >= factor.enabledAt;
  const mfaRequired = Boolean(user.staffRole && (deps.config.staffMfaRequired || factor?.enabledAt != null) && !verified);
  if (mfaRequired && session.createdAt <= now - MFA_PENDING_TTL_MS) return null;

  const { idleMs } = sessionLifetimes(user);
  let sessionRenewalSeconds: number | undefined;
  const nextExpiry = Math.min(now + idleMs, session.absoluteExpiresAt);
  if (session.expiresAt - now < idleMs - HOUR && nextExpiry > session.expiresAt) {
    await deps.db
      .update(schema.sessions)
      .set({ expiresAt: nextExpiry })
      .where(eq(schema.sessions.id, sessionId));
    sessionRenewalSeconds = Math.floor((nextExpiry - now) / 1000);
  }

  const memberRows = await deps.db
    .select({ orgId: schema.memberships.orgId, role: schema.memberships.role })
    .from(schema.memberships)
    .where(eq(schema.memberships.userId, user.id));
  const memberships = new Map<string, OrgRole>(memberRows.map((m) => [m.orgId, m.role]));
  return { user, memberships, sessionId, sessionRenewalSeconds, sessionCreatedAt: session.createdAt, mfaRequired };
}

export async function endSession(deps: Deps, actor: Actor): Promise<void> {
  const now = deps.now();
  await runBatch(deps.db, [
    deps.db.delete(schema.sessions).where(eq(schema.sessions.id, actor.sessionId)),
    auditInsert(deps.db, { actorId: actor.user.id, action: "auth.logout" }, now),
  ]);
}
