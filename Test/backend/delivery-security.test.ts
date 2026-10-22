import { describe, expect, it, vi } from "vitest";
import { schema } from "../../NBE/src/db";
import { DeliveryError } from "../../NBE/src/lib/delivery";
import { ConsoleMailer, ResendMailer } from "../../NBE/src/modules/notifications/mailer";
import { drainOutbox, emailJob } from "../../NBE/src/modules/notifications/outbox";
import { verifyJwt } from "../../NBE/src/modules/sso/jwt";
import { enableSso, makeTestApp } from "./helpers";

describe("safe, bounded notification delivery", () => {
  const message = { to: "recipient@test.dev", subject: "Sign in", text: "sensitive-test-link-content" };

  it("does not acknowledge missing mail delivery or log message contents", async () => {
    const events: unknown[] = [];
    const log = { info: (...args: unknown[]) => events.push(args), warn: (...args: unknown[]) => events.push(args), error: (...args: unknown[]) => events.push(args) };
    const ctx = await makeTestApp({ mailer: new ConsoleMailer(log) });
    await emailJob(ctx.deps.db, 0, message);
    expect(await drainOutbox({ ...ctx.deps, now: () => 1 })).toEqual({ sent: 0, failed: 1 });
    const [job] = await ctx.deps.db.select().from(schema.outbox);
    expect(job?.state).toBe("pending");
    expect(job?.lastError).toBe("mail_not_configured");
    expect(JSON.stringify(events)).not.toContain(message.to);
    expect(JSON.stringify(events)).not.toContain(message.text);
  });

  it("passes a stable idempotency key on retries and scrubs the delivered payload", async () => {
    const keys: string[] = [];
    let attempts = 0;
    const ctx = await makeTestApp({ mailer: { send: async (_message, options) => {
      keys.push(options!.idempotencyKey);
      if (attempts++ === 0) throw new DeliveryError("resend_http_503");
    } } });
    await emailJob(ctx.deps.db, 0, message);
    await drainOutbox({ ...ctx.deps, now: () => 0 });
    const [retry] = await ctx.deps.db.select().from(schema.outbox);
    await drainOutbox({ ...ctx.deps, now: () => retry!.nextAttemptAt });
    expect(keys).toHaveLength(2);
    expect(keys[0]).toBe(keys[1]);
    const [sent] = await ctx.deps.db.select().from(schema.outbox);
    expect(sent?.state).toBe("sent");
    expect(sent?.payload).toEqual({});
  });

  it("does not send an expired sign-in link or retain its payload", async () => {
    const ctx = await makeTestApp();
    await emailJob(ctx.deps.db, 0, message, 15 * 60_000);
    await drainOutbox({ ...ctx.deps, now: () => 16 * 60_000 });
    expect(ctx.mailer.sent).toHaveLength(0);
    expect((await ctx.deps.db.select().from(schema.outbox))[0]).toMatchObject({ state: "dead", payload: {}, lastError: "delivery_expired" });
  });

  it("sanitizes unexpected provider errors and does not retry permanent failures", async () => {
    const ctx = await makeTestApp();
    ctx.mailer.failWith = new Error("provider-key-and-recipient-private-details");
    await emailJob(ctx.deps.db, 0, message);
    await drainOutbox({ ...ctx.deps, now: () => 0 });
    expect((await ctx.deps.db.select().from(schema.outbox))[0]?.lastError).toBe("delivery_failed");
    ctx.deps.mailer = { send: async () => { throw new DeliveryError("resend_http_422", false); } };
    const [pending] = await ctx.deps.db.select().from(schema.outbox);
    await drainOutbox({ ...ctx.deps, now: () => pending!.nextAttemptAt });
    expect((await ctx.deps.db.select().from(schema.outbox))[0]).toMatchObject({ state: "dead", payload: {}, lastError: "resend_http_422" });
  });

  it("fences a stale sender so it cannot overwrite a later successful delivery", async () => {
    let clock = 0;
    let rejectFirst!: (error: Error) => void;
    let firstStarted!: () => void;
    const started = new Promise<void>((resolve) => { firstStarted = resolve; });
    let calls = 0;
    const ctx = await makeTestApp({ now: () => clock, mailer: { send: async () => {
      if (++calls === 1) return new Promise<void>((_resolve, reject) => { rejectFirst = reject; firstStarted(); });
    } } });
    await emailJob(ctx.deps.db, 0, message);
    const first = drainOutbox(ctx.deps);
    await started;
    clock = 3 * 60_000;
    expect((await drainOutbox(ctx.deps)).sent).toBe(1);
    rejectFirst(new Error("old failure"));
    await first;
    expect((await ctx.deps.db.select().from(schema.outbox))[0]).toMatchObject({ state: "sent", lastError: null, payload: {} });
  });

  it("uses provider timeouts, refuses redirects, and sends the job idempotency key", async () => {
    let init: RequestInit | undefined;
    const http = vi.fn(async (_url: string | URL | Request, options?: RequestInit) => { init = options; return new Response("{}"); }) as unknown as typeof fetch;
    const mailer = new ResendMailer("test-provider-key", "no-reply@test.dev", http);
    await mailer.send(message, { idempotencyKey: "outbox/test-job" });
    expect(new Headers(init?.headers).get("idempotency-key")).toBe("outbox/test-job");
    expect(init?.signal).toBeInstanceOf(AbortSignal);
    expect(init?.redirect).toBe("error");
  });
});

describe("strict reference JWT verification", () => {
  it("rejects extra compact-token segments, excessive lifetimes and future-issued tokens", async () => {
    const ctx = await makeTestApp();
    await enableSso(ctx);
    const now = Math.floor(Date.now() / 1000);
    const claims = { iss: ctx.deps.config.appUrl, aud: "darkagent", sub: "user", jti: "token-id", iat: now, exp: now + 300 };
    const keys = { keys: [await ctx.deps.sso!.publicJwk()] };
    const expected = { issuer: claims.iss, audience: claims.aud, now: now * 1000 };
    const token = await ctx.deps.sso!.sign(claims);
    await expect(verifyJwt(`${token}.ignored`, keys, expected)).rejects.toThrow("malformed");
    await expect(verifyJwt(await ctx.deps.sso!.sign({ ...claims, exp: now + 3600 }), keys, expected)).rejects.toThrow("lifetime");
    await expect(verifyJwt(await ctx.deps.sso!.sign({ ...claims, iat: now + 60, exp: now + 300 }), keys, expected)).rejects.toThrow("lifetime");
    await expect(verifyJwt(await ctx.deps.sso!.sign({ ...claims, nbf: now + 60 }), keys, expected)).rejects.toThrow("not active");
  });
});
