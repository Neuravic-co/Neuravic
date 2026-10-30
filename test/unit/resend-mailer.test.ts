import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { ResendMailer, ConsoleMailer, MemoryMailer } from "../../nbe/core/src/modules/notifications/mailer";
import { DeliveryError } from "../../nbe/core/src/lib/delivery";
import { silentLogger } from "../../nbe/core/src/lib/logger";

const id = "00000000-0000-4000-8000-000000000001";
const message = { to: "visitor@example.com", subject: "New enquiry: Sara", text: "<b>Private message</b>\nA second line" };
const from = "Neuravic <contact@example.com>";
const failure = (code: string, retryable = true) => (error: unknown) => {
  assert.ok(error instanceof DeliveryError);
  assert.equal(error.code, code);
  assert.equal(error.retryable, retryable);
  return true;
};

describe("Resend contact delivery", () => {
  it("sends plain text to one recipient, pins the sender and idempotency key, and returns acceptance evidence", async () => {
    const calls: RequestInit[] = [];
    const http = (async (url, init) => {
      assert.equal(url, "https://api.resend.com/emails");
      calls.push(init!);
      return Response.json({ id });
    }) as typeof fetch;
    const mailer = new ResendMailer("test-secret", from, http);
    const receipt = await mailer.send({ ...message, from: "Saved <saved@example.com>" }, { idempotencyKey: "outbox/job1" });
    assert.deepEqual(receipt, { provider: "resend", messageId: id });
    assert.equal("delivered" in receipt, false);
    const call = calls[0]!;
    assert.equal(call.redirect, "error");
    assert.ok(call.signal instanceof AbortSignal);
    assert.equal(new Headers(call.headers).get("idempotency-key"), "outbox/job1");
    assert.deepEqual(JSON.parse(call.body as string), { from: "Saved <saved@example.com>", to: [message.to], subject: message.subject, text: message.text });
  });
  for (const status of [408, 429, 500, 502, 503]) it(`retries HTTP ${status} without exposing the provider body`, async () => {
    const mailer = new ResendMailer("secret", from, (async () => new Response("private message and secret", { status })) as typeof fetch);
    await assert.rejects(mailer.send(message), failure(`resend_http_${status}`));
  });
  for (const status of [400, 401, 403, 422]) it(`stops retrying HTTP ${status}`, async () => {
    const mailer = new ResendMailer("secret", from, (async () => new Response("private", { status })) as typeof fetch);
    await assert.rejects(mailer.send(message), failure(`resend_http_${status}`, false));
  });
  for (const [name, retryable] of [["invalid_idempotent_request", false], ["concurrent_idempotent_requests", true]] as const) {
    it(`classifies ${name}`, async () => {
      const mailer = new ResendMailer("secret", from, (async () => Response.json({ name }, { status: 409 })) as typeof fetch);
      await assert.rejects(mailer.send(message), failure("resend_http_409", retryable));
    });
  }
  it("aborts a stalled request and exposes a safe timeout code", async () => {
    const http = (async (_url, init) => new Promise((_resolve, reject) => {
      init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
    })) as typeof fetch;
    const keepAlive = setTimeout(() => {}, 1000);
    try { await assert.rejects(new ResendMailer("secret", from, http, 5).send(message), failure("resend_timeout")); }
    finally { clearTimeout(keepAlive); }
  });
  it("redacts transport errors", async () => {
    const http = (async () => { throw new Error("https://private-link secret visitor@example.com"); }) as typeof fetch;
    await assert.rejects(new ResendMailer("secret", from, http).send(message), failure("resend_unreachable"));
  });
  it("does not treat an empty provider success as acceptance", async () => {
    const http = (async () => Response.json({})) as typeof fetch;
    await assert.rejects(new ResendMailer("secret", from, http).send(message), failure("resend_invalid_response"));
  });
  for (const bad of [{ to: "a@example.com,b@example.com" }, { subject: "Hello\r\nBcc: other@example.com" }, { from: "bad\nname <sender@example.com>" }]) {
    it(`rejects unsafe ${Object.keys(bad)[0]} before contacting the provider`, async () => {
      const http = (async () => { assert.fail("must not contact provider"); }) as typeof fetch;
      await assert.rejects(new ResendMailer("secret", from, http).send({ ...message, ...bad }), failure("invalid_email_headers", false));
    });
  }
  it("retains unconfigured mail for retry without logging the message", async () => {
    const records: unknown[] = [];
    const mailer = new ConsoleMailer({ ...silentLogger, warn: (...args) => records.push(args) });
    await assert.rejects(mailer.send(message), failure("mail_not_configured"));
    assert.deepEqual(records, [["email_not_sent_no_provider"]]);
  });
  it("labels test capture separately from a real provider", async () => {
    const mailer = new MemoryMailer();
    assert.deepEqual(await mailer.send(message), { provider: "memory" });
  });
});
