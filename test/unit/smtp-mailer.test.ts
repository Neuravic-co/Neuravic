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
