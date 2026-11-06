import assert from "node:assert/strict";
import { createServer, type AddressInfo, type Socket } from "node:net";
import { describe, it } from "node:test";
import { DeliveryError } from "../../nbe/src/core/errors";
import { silentLogger } from "../../nbe/src/core/logger";
import { MemoryMailer, UnconfiguredMailer } from "../../nbe/src/modules/mail/local";
import { ResendMailer } from "../../nbe/src/modules/mail/resend";
import { SmtpMailer } from "../../nbe/src/modules/mail/smtp";

const id = "00000000-0000-4000-8000-000000000001";
const message = { to: "visitor@example.com", from: "Neuravic <contact@example.com>", subject: "New enquiry: Sara", text: "Private message\nA second line" };
const options = { idempotencyKey: "outbox/job1" };

const failure = (code: string, retryable = true) => (error: unknown) => {
  assert.ok(error instanceof DeliveryError);
  assert.equal(error.code, code);
  assert.equal(error.retryable, retryable);
  return true;
};

describe("Resend delivery", () => {
  it("sends plain text to one recipient with the stored sender and idempotency key", async () => {
    const calls: RequestInit[] = [];
    const http = (async (url, init) => {
      assert.equal(url, "https://api.resend.com/emails");
      calls.push(init!);
      return Response.json({ id });
    }) as typeof fetch;
    const receipt = await new ResendMailer("test-secret", http).send(message, options);
    assert.deepEqual(receipt, { provider: "resend", messageId: id });
    const call = calls[0]!;
    assert.equal(call.redirect, "error");
    assert.ok(call.signal instanceof AbortSignal);
    assert.equal(new Headers(call.headers).get("idempotency-key"), "outbox/job1");
    assert.deepEqual(JSON.parse(call.body as string), { from: message.from, to: [message.to], subject: message.subject, text: message.text });
  });

  for (const status of [408, 429, 500, 502, 503]) {
    it(`retries HTTP ${status} without exposing the provider body`, async () => {
      const http = (async () => new Response("private message and secret", { status })) as typeof fetch;
      await assert.rejects(new ResendMailer("secret", http).send(message, options), failure(`resend_http_${status}`));
    });
  }

  for (const status of [400, 401, 403, 422]) {
    it(`stops retrying HTTP ${status}`, async () => {
      const http = (async () => new Response("private", { status })) as typeof fetch;
      await assert.rejects(new ResendMailer("secret", http).send(message, options), failure(`resend_http_${status}`, false));
    });
  }

  for (const [name, retryable] of [["invalid_idempotent_request", false], ["concurrent_idempotent_requests", true]] as const) {
    it(`classifies ${name}`, async () => {
      const http = (async () => Response.json({ name }, { status: 409 })) as typeof fetch;
      await assert.rejects(new ResendMailer("secret", http).send(message, options), failure("resend_http_409", retryable));
    });
  }

  it("aborts a stalled request with a safe timeout code", async () => {
    const http = (async (_url, init) =>
      new Promise((_resolve, reject) => {
        init!.signal!.addEventListener("abort", () => reject(init!.signal!.reason), { once: true });
      })) as typeof fetch;
    const keepAlive = setTimeout(() => {}, 1000);
    try {
      await assert.rejects(new ResendMailer("secret", http, 5).send(message, options), failure("resend_timeout"));
    } finally {
      clearTimeout(keepAlive);
    }
  });

  it("redacts transport errors", async () => {
    const http = (async () => {
      throw new Error("https://private-link secret visitor@example.com");
    }) as typeof fetch;
    await assert.rejects(new ResendMailer("secret", http).send(message, options), failure("resend_unreachable"));
  });

  it("does not treat an empty provider success as acceptance", async () => {
    const http = (async () => Response.json({})) as typeof fetch;
    await assert.rejects(new ResendMailer("secret", http).send(message, options), failure("resend_invalid_response"));
  });

  for (const bad of [{ to: "a@example.com,b@example.com" }, { subject: "Hello\r\nBcc: other@example.com" }, { from: "bad\nname <sender@example.com>" }]) {
    it(`rejects unsafe ${Object.keys(bad)[0]} before contacting the provider`, async () => {
      const http = (async () => assert.fail("must not contact provider")) as typeof fetch;
      await assert.rejects(new ResendMailer("secret", http).send({ ...message, ...bad }, options), failure("invalid_email_headers", false));
    });
  }
});

describe("local mailers", () => {
  it("keeps unconfigured mail for retry without logging the message", async () => {
    const records: unknown[] = [];
    const mailer = new UnconfiguredMailer({ ...silentLogger, warn: (...args) => records.push(args) });
    await assert.rejects(mailer.send(), failure("mail_not_configured"));
    assert.deepEqual(records, [["email_not_sent_no_provider"]]);
  });

  it("labels test capture separately from a real provider", async () => {
    assert.deepEqual(await new MemoryMailer().send(message), { provider: "memory" });
  });
});

async function localSmtp(recipientReply: number) {
  const messages: string[] = [];
  const sockets = new Set<Socket>();
  const server = createServer((socket) => {
    sockets.add(socket);
    socket.on("close", () => sockets.delete(socket));
    socket.setEncoding("utf8");
    socket.write("220 localhost test SMTP\r\n");
    let buffer = "";
    let data = false;
    let body = "";
    socket.on("data", (chunk) => {
      buffer += chunk;
      while (buffer.includes("\r\n")) {
        const end = buffer.indexOf("\r\n");
        const line = buffer.slice(0, end);
        buffer = buffer.slice(end + 2);
        if (data) {
          if (line === ".") {
            messages.push(body);
            data = false;
            socket.write("250 accepted\r\n");
          } else body += `${line}\r\n`;
        } else if (/^EHLO|^HELO/.test(line)) socket.write("250 localhost\r\n");
        else if (/^MAIL FROM:/.test(line)) socket.write("250 sender ok\r\n");
        else if (/^RCPT TO:/.test(line)) socket.write(`${recipientReply} recipient response\r\n`);
        else if (line === "DATA") {
          data = true;
          body = "";
          socket.write("354 send data\r\n");
        } else if (line === "QUIT") socket.end("221 bye\r\n");
        else socket.write("250 ok\r\n");
      }
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as AddressInfo).port;
  return {
    messages,
    mailer: new SmtpMailer(`smtp://127.0.0.1:${port}`),
    close: async () => {
      for (const socket of sockets) socket.destroy();
      await new Promise<void>((resolve) => server.close(() => resolve()));
    },
  };
}

describe("SMTP delivery", () => {
  it("reports an unreachable server as retryable, without leaking the password", async () => {
    const mailer = new SmtpMailer("smtp://someone:secret-password@127.0.0.1:1");
    await assert.rejects(mailer.send(message, options), (error) => {
      assert.ok(error instanceof DeliveryError);
      assert.equal(error.retryable, true);
      assert.equal(error.code, "smtp_unreachable");
      assert.ok(!error.message.includes("secret-password"));
      return true;
    });
  });

  it("records acceptance and reuses the same Message-ID for retries", async () => {
    const smtp = await localSmtp(250);
    try {
      const first = await smtp.mailer.send(message, { idempotencyKey: "outbox/test-job" });
      const second = await smtp.mailer.send(message, { idempotencyKey: "outbox/test-job" });
      assert.deepEqual(first, { provider: "smtp", messageId: "<outbox-test-job@example.com>" });
      assert.deepEqual(second, first);
      assert.equal(smtp.messages.length, 2);
    } finally {
      await smtp.close();
    }
  });

  for (const [code, retryable] of [[450, true], [550, false]] as const) {
    it(`classifies SMTP ${code} without exposing the provider text`, async () => {
      const smtp = await localSmtp(code);
      try {
        await assert.rejects(smtp.mailer.send(message, options), failure(retryable ? "smtp_temporary" : "smtp_rejected", retryable));
        assert.equal(smtp.messages.length, 0);
      } finally {
        await smtp.close();
      }
    });
  }
});
