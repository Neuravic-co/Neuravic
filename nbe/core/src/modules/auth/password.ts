import { eq } from "drizzle-orm";
import { runBatch, schema } from "../../db";
import type { Deps } from "../../deps";
import { randomToken, sha256Hex } from "../../lib/crypto";
import { conflict, tooManyRequests, unauthorized } from "../../lib/errors";
import { ulid } from "../../lib/ids";
import { hashPassword, verifyPassword } from "../../lib/password";
import { auditInsert, hashIdentifier } from "../audit/audit";
import type { User } from "./actor";
import { findUserByEmail, sessionLifetimes, type VerifiedLogin } from "./service";

async function startSession(deps: Deps, user: User, ip: string, userAgent: string | undefined, action: string): Promise<VerifiedLogin> {
  const now = deps.now();
  const { idleMs, absoluteMs } = sessionLifetimes(user);
  const sessionToken = randomToken();
  const ipHash = await hashIdentifier(ip, deps.config.privacyHashSecret);
  const userAgentHash = await hashIdentifier(userAgent, deps.config.privacyHashSecret, "audit-user-agent");
  await runBatch(deps.db, [
    deps.db.insert(schema.sessions).values({
      id: await sha256Hex(sessionToken),
      userId: user.id,
      expiresAt: now + idleMs,
      absoluteExpiresAt: now + absoluteMs,
      ipHash,
      userAgentHash,
      mfaVerifiedAt: null,
      createdAt: now,
    }),
    deps.db.update(schema.users).set({ lastLoginAt: now }).where(eq(schema.users.id, user.id)),
    auditInsert(deps.db, { actorId: user.id, action }, now, ipHash),
  ]);
  return { user, sessionToken, maxAgeSeconds: Math.floor(Math.min(idleMs, absoluteMs) / 1000) };
}

/** Creates an account with a password and signs it in. Staff roles are never granted here, except the dev bootstrap admin. */
export async function registerWithPassword(
  deps: Deps,
  input: { name: string; email: string; password: string },
  ip: string,
  userAgent: string | undefined,
): Promise<VerifiedLogin> {
  const now = deps.now();
  const identifier = await hashIdentifier(input.email, deps.config.privacyHashSecret, "rate:register-email");
  if (!(await deps.rateLimiter.hit(`register-email:${identifier}`, 5, 3600, now))) throw tooManyRequests();
  if (await findUserByEmail(deps, input.email)) throw conflict("An account with this email already exists. Log in instead.");

  const staffRole = deps.config.environment === "development" && deps.config.bootstrapAdminEmail === input.email ? "admin" : null;
  const user: User = { id: ulid(now), email: input.email, name: input.name, status: "active", staffRole, createdAt: now, lastLoginAt: null };
  const passwordHash = await hashPassword(input.password);
  try {
    await runBatch(deps.db, [
      deps.db.insert(schema.users).values(user),
      deps.db.insert(schema.userPasswords).values({ userId: user.id, passwordHash, updatedAt: now }),
    ]);
  } catch {
    throw conflict("An account with this email already exists. Log in instead.");
  }
  return startSession(deps, user, ip, userAgent, "auth.register");
}

export async function loginWithPassword(
  deps: Deps,
  input: { email: string; password: string },
  ip: string,
  userAgent: string | undefined,
): Promise<VerifiedLogin> {
  const now = deps.now();
  const identifier = await hashIdentifier(input.email, deps.config.privacyHashSecret, "rate:password-email");
  if (!(await deps.rateLimiter.hit(`password-email:${identifier}`, 10, 900, now))) throw tooManyRequests();

  const user = await findUserByEmail(deps, input.email);
  const [row] = user
    ? await deps.db.select().from(schema.userPasswords).where(eq(schema.userPasswords.userId, user.id)).limit(1)
    : [];
  const valid = await verifyPassword(input.password, row?.passwordHash);
  if (!user || !valid || user.status === "disabled") throw unauthorized("Email or password is incorrect");
  return startSession(deps, user, ip, userAgent, "auth.password_login");
}
