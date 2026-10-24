import { createTransport, type Transporter } from "nodemailer";
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

/** Sends through any SMTP server (Gmail, Outlook, a hosting provider). `url` looks like smtps://user:password@host:465. */
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;

  constructor(url: string, private readonly from: string) {
    this.transport = createTransport({ url, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 });
  }

  async send(message: EmailMessage): Promise<void> {
    try {
      await this.transport.sendMail({ from: this.from, to: message.to, subject: message.subject, text: message.text });
    } catch (error) {
      // 4xx answers (busy server, rate limit) are worth retrying; a refused login or address will not fix itself.
      const code = (error as { responseCode?: number }).responseCode;
      const retryable = code === undefined || code < 500;
      throw new DeliveryError(code === undefined ? "smtp_unreachable" : retryable ? "smtp_temporary" : "smtp_rejected", retryable);
    }
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

/**
 * Development mailbox: keeps the last messages in memory so sign-in links can be read from the dev endpoint
 * (GET /api/v1/dev/mailbox). Only ever built when APP_ENV=development.
 */
export class DevMailer implements Mailer {
  readonly inbox: (EmailMessage & { at: number })[] = [];

  async send(message: EmailMessage): Promise<void> {
    this.inbox.unshift({ ...message, at: Date.now() });
    this.inbox.length = Math.min(this.inbox.length, 50);
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
