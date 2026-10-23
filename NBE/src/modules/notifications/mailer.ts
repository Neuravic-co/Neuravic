import type { Logger } from "../../lib/logger";
import { DeliveryError, requireDeliverySuccess } from "../../lib/delivery";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: EmailMessage, options?: { idempotencyKey: string }): Promise<void>;
}

/** Sends through the Resend HTTP API. */
export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly http: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage, options?: { idempotencyKey: string }): Promise<void> {
    const res = await this.http("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        authorization: `Bearer ${this.apiKey}`, "content-type": "application/json",
        ...(options ? { "idempotency-key": options.idempotencyKey } : {}),
      },
      body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, text: message.text }),
      signal: AbortSignal.timeout(10_000),
      redirect: "error",
    });
    requireDeliverySuccess(res, "resend");
    await res.body?.cancel();
  }
}

/** Missing provider: retain jobs for retry. Never print login links or pretend a message was sent. */
export class ConsoleMailer implements Mailer {
  constructor(private readonly log: Logger) {}

  async send(_message: EmailMessage): Promise<void> {
    this.log.warn("email_not_sent_no_provider");
    throw new DeliveryError("mail_not_configured");
  }
}

/** Test mailer that records everything it is asked to send. */
export class MemoryMailer implements Mailer {
  readonly sent: EmailMessage[] = [];
  failWith: Error | null = null;

  async send(message: EmailMessage): Promise<void> {
    if (this.failWith) throw this.failWith;
    this.sent.push(message);
  }
}
