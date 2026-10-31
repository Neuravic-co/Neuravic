import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { DeliveryError } from "../../nbe/core/src/lib/delivery";
import { SmtpMailer } from "../../nbe/core/src/modules/notifications/mailer";

describe("SMTP mailer", () => {
  it("reports an unreachable mail server as a retryable delivery error, without leaking the address or password", async () => {
    // Port 1 on the local machine refuses connections straight away.
    const mailer = new SmtpMailer("smtp://someone:secret-password@127.0.0.1:1", "Neuravic <no-reply@example.com>");
    await assert.rejects(
      mailer.send({ to: "visitor@example.com", subject: "Hello", text: "Body" }),
      (error) => {
        assert.ok(error instanceof DeliveryError);
        assert.equal(error.retryable, true);
        assert.equal(error.code, "smtp_unreachable");
        assert.ok(!error.message.includes("secret-password"));
        return true;
      },
    );
  });
});

// A loopback-only SMTP peer exercises Nodemailer's real acceptance/rejection handling.
// It never relays mail or connects to an external provider.
async function localSmtp(reply: number) {
  const { createServer } = await import("node:net");
  const messages: string[] = [];
  const sockets = new Set<import("node:net").Socket>();
  const server = createServer(socket => {
    sockets.add(socket); socket.on("close", () => sockets.delete(socket));
    socket.setEncoding("utf8"); socket.write("220 localhost test SMTP\r\n");
    let buffer = "", data = false, message = "";
    socket.on("data", chunk => {
      buffer += chunk;
      while (buffer.includes("\r\n")) {
        const end = buffer.indexOf("\r\n");
        const line = buffer.slice(0, end); buffer = buffer.slice(end + 2);
        if (data) {
          if (line === ".") { messages.push(message); data = false; socket.write("250 accepted\r\n"); }
          else message += line + "\r\n";
        } else if (/^EHLO|^HELO/.test(line)) socket.write("250 localhost\r\n");
        else if (/^MAIL FROM:/.test(line)) socket.write("250 sender ok\r\n");
        else if (/^RCPT TO:/.test(line)) socket.write(String(reply) + " recipient response\r\n");
        else if (line === "DATA") { data = true; message = ""; socket.write("354 send data\r\n"); }
        else if (line === "QUIT") socket.end("221 bye\r\n");
        else socket.write("250 ok\r\n");
      }
    });
  });
  await new Promise<void>(resolve => server.listen(0, "127.0.0.1", resolve));
  const port = (server.address() as import("node:net").AddressInfo).port;
  return { messages, mailer: new SmtpMailer("smtp://127.0.0.1:" + port, "Neuravic <contact@example.com>"),
    close: async () => { for (const socket of sockets) socket.destroy(); await new Promise<void>(resolve => server.close(() => resolve())); } };
}

it("records SMTP acceptance and uses the same Message-ID for retries", async () => {
  const smtp = await localSmtp(250);
  try {
    const message = { to: "visitor@example.com", subject: "Enquiry", text: "Synthetic local message" };
    const first = await smtp.mailer.send(message, { idempotencyKey: "outbox/test-job" });
    const second = await smtp.mailer.send(message, { idempotencyKey: "outbox/test-job" });
    assert.deepEqual(first, { provider: "smtp", messageId: "<outbox-test-job@neuravic.invalid>" });
    assert.deepEqual(second, first);
    assert.equal(smtp.messages.length, 2); // SMTP itself does not deduplicate.
    assert.ok(smtp.messages.every(text => text.includes("To: visitor@example.com") && text.includes("Synthetic local message")));
  } finally { await smtp.close(); }
});
for (const [code, retryable] of [[450, true], [550, false]] as const) {
  it("classifies SMTP " + code + " without exposing provider response text", async () => {
    const smtp = await localSmtp(code);
    try {
      await assert.rejects(smtp.mailer.send({ to: "visitor@example.com", subject: "Test", text: "Private" }), error => {
        assert.ok(error instanceof DeliveryError); assert.equal(error.retryable, retryable);
        assert.equal(error.code, retryable ? "smtp_temporary" : "smtp_rejected"); return true;
      });
      assert.equal(smtp.messages.length, 0);
    } finally { await smtp.close(); }
  });
}
