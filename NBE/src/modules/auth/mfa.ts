import { and, eq, isNull, lt, sql } from "drizzle-orm";
import { runBatch, schema } from "../../db";
import type { Deps } from "../../deps";
import { fromBase64Url, randomToken, sha256Hex, toBase64Url } from "../../lib/crypto";
import { AppError, forbidden, unauthorized } from "../../lib/errors";
import { auditInsert } from "../audit/audit";
import type { Actor } from "./actor";

const encoder = new TextEncoder();
const ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";
export const MFA_PENDING_TTL_MS = 10 * 60_000;

export function newTotpSecret(): string {
  return Array.from(crypto.getRandomValues(new Uint8Array(32)), (b) => ALPHABET[b & 31]).join("");
}

/** RFC 6238 / RFC 4226, six digits, SHA-1, 30-second counter. */
export async function totpCode(secret: string, step: number, digits = 6): Promise<string> {
  let bits = "";
  for (const char of secret) {
    const value = ALPHABET.indexOf(char);
    if (value < 0) throw new Error("Invalid stored MFA secret");
    bits += value.toString(2).padStart(5, "0");
  }
  const bytes = Uint8Array.from(bits.match(/.{8}/g) ?? [], (b) => parseInt(b, 2));
  const counter = new Uint8Array(8);
  new DataView(counter.buffer).setBigUint64(0, BigInt(step));
  const key = await crypto.subtle.importKey("raw", bytes, { name: "HMAC", hash: "SHA-1" }, false, ["sign"]);
  const mac = new Uint8Array(await crypto.subtle.sign("HMAC", key, counter));
  const offset = mac[mac.length - 1]! & 15;
  const value = new DataView(mac.buffer).getUint32(offset) & 0x7fffffff;
  return String(value % 10 ** digits).padStart(digits, "0");
}

async function matchingStep(secret: string, code: string, now: number): Promise<number | null> {
  if (!/^\d{6}$/.test(code)) return null;
  const step = Math.floor(now / 30_000);
  let match: number | null = null;
  for (const candidate of [step - 1, step, step + 1]) {
    const expected = await totpCode(secret, candidate);
    let difference = 0;
    for (let i = 0; i < 6; i++) difference |= expected.charCodeAt(i) ^ code.charCodeAt(i);
    if (difference === 0) match = candidate;
  }
  return match;
}

async function encryptionKey(deps: Deps) {
  const value = deps.config.mfaEncryptionKey;
  if (!value) throw new AppError(503, "mfa_unavailable", "Staff verification is not configured");
  return crypto.subtle.importKey("raw", Uint8Array.from(value.match(/../g)!, (b) => parseInt(b, 16)), "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function seal(deps: Deps, userId: string, secret: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv, additionalData: encoder.encode(userId) }, await encryptionKey(deps), encoder.encode(secret));
  return `${toBase64Url(iv)}.${toBase64Url(new Uint8Array(encrypted))}`;
}

async function open(deps: Deps, userId: string, value: string): Promise<string> {
  const [iv, ciphertext] = value.split(".");
  const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64Url(iv!), additionalData: encoder.encode(userId) }, await encryptionKey(deps), fromBase64Url(ciphertext!));
  return new TextDecoder().decode(decrypted);
}

export async function mfaRecord(deps: Deps, userId: string) {
  const [record] = await deps.db.select().from(schema.staffMfa).where(eq(schema.staffMfa.userId, userId)).limit(1);
  return record;
}

export function requireMfaStaff(actor: Actor) {
  if (!actor.user.staffRole) throw forbidden();
}

export async function setupMfa(deps: Deps, actor: Actor) {
  requireMfaStaff(actor);
  const now = deps.now();
  if (actor.sessionCreatedAt === undefined || actor.sessionCreatedAt <= now - MFA_PENDING_TTL_MS) throw unauthorized("Sign in again before setting up staff verification");
  await deps.db.delete(schema.staffMfa).where(and(eq(schema.staffMfa.userId, actor.user.id), isNull(schema.staffMfa.enabledAt), lt(schema.staffMfa.createdAt, now - MFA_PENDING_TTL_MS)));
  const pendingBinding = JSON.stringify([actor.user.id, actor.sessionId]);
  const encryptedSecret = await seal(deps, pendingBinding, newTotpSecret());
  await deps.db.insert(schema.staffMfa).values({ userId: actor.user.id, encryptedSecret, createdAt: now }).onConflictDoNothing();
  const record = await mfaRecord(deps, actor.user.id);
  if (!record || record.enabledAt !== null) throw new AppError(409, "mfa_already_enabled", "Staff verification is already set up");
  // The same pending secret is returned on retries; an active factor is never overwritten.
  let secret: string;
  try { secret = await open(deps, pendingBinding, record.encryptedSecret); }
  catch { throw new AppError(409, "mfa_setup_in_progress", "Continue setup in the original browser, or wait ten minutes and sign in again"); }
  return { secret, uri: `otpauth://totp/${encodeURIComponent(`Neuravic:${actor.user.email}`)}?secret=${secret}&issuer=Neuravic&algorithm=SHA1&digits=6&period=30` };
}

/** Atomically consumes a code and upgrades only this live session. No email-only reset exists. */
export async function verifyMfa(deps: Deps, actor: Actor, code: string, enrollment: boolean, rotateRecovery = false) {
  requireMfaStaff(actor);
  const now = deps.now();
  const record = await mfaRecord(deps, actor.user.id);
  if (!record || (record.enabledAt === null) !== enrollment || (enrollment && record.createdAt <= now - MFA_PENDING_TTL_MS)) throw unauthorized("Verification failed; sign in again if setup expired");
  let secret: string;
  try { secret = await open(deps, enrollment ? JSON.stringify([actor.user.id, actor.sessionId]) : actor.user.id, record.encryptedSecret); }
  catch { throw unauthorized("Staff verification could not be completed"); }
  const step = await matchingStep(secret, code, now);
  let recoveryHashes = record.recoveryHashes;
  let recoveryCodes: string[] = [];
  if (step === null) {
    if (enrollment || rotateRecovery || !/^[A-Za-z0-9_-]{22}$/.test(code)) throw unauthorized("Verification code is invalid or has already been used");
    const hash = await sha256Hex(`${actor.user.id}\0${code}`);
    if (!recoveryHashes.includes(hash)) throw unauthorized("Verification code is invalid or has already been used");
    recoveryHashes = recoveryHashes.filter((item) => item !== hash);
  } else if (step <= record.lastUsedStep) throw unauthorized("Verification code is invalid or has already been used");
  if (enrollment || rotateRecovery) {
    recoveryCodes = Array.from({ length: 8 }, () => randomToken(16));
    recoveryHashes = await Promise.all(recoveryCodes.map((code) => sha256Hex(`${actor.user.id}\0${code}`)));
  }
  const liveSession = sql`exists (select 1 from sessions s join users u on u.id = s.user_id
    where s.id = ${actor.sessionId} and u.id = ${actor.user.id} and u.status = 'active' and u.staff_role is not null
    and s.expires_at > ${now} and s.absolute_expires_at > ${now})`;
  const [changed] = await runBatch(deps.db, [
    deps.db.update(schema.staffMfa).set({ encryptedSecret: enrollment ? await seal(deps, actor.user.id, secret) : record.encryptedSecret, enabledAt: record.enabledAt ?? now, lastUsedStep: step ?? record.lastUsedStep, recoveryHashes }).where(and(
      eq(schema.staffMfa.userId, actor.user.id), eq(schema.staffMfa.encryptedSecret, record.encryptedSecret),
      enrollment ? isNull(schema.staffMfa.enabledAt) : eq(schema.staffMfa.enabledAt, record.enabledAt!),
      eq(schema.staffMfa.lastUsedStep, record.lastUsedStep), eq(schema.staffMfa.recoveryHashes, record.recoveryHashes), liveSession,
    )).returning({ userId: schema.staffMfa.userId }),
    deps.db.update(schema.sessions).set({ mfaVerifiedAt: now }).where(and(eq(schema.sessions.id, actor.sessionId), sql`changes() > 0`)),
    auditInsert(deps.db, { actorId: actor.user.id, action: enrollment ? "auth.mfa_enrolled" : rotateRecovery ? "auth.mfa_recovery_replaced" : step === null ? "auth.mfa_recovery_used" : "auth.mfa_verified" }, now, null, sql`changes() > 0`),
  ]);
  if (!Array.isArray(changed) || changed.length !== 1) throw unauthorized("Verification code is invalid or has already been used");
  return { recoveryCodes };
}
