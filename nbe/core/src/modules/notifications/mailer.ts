import { createTransport, type Transporter } from "nodemailer";
import { z } from "zod";
import type { Logger } from "../../lib/logger";
import { DeliveryError, requireDeliverySuccess } from "../../lib/delivery";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
  /** Snapshotted by the outbox on its first attempt, so retries have an identical sender. */
  from?: string;
}

/** Acceptance by a provider is not evidence of inbox delivery. */
export interface EmailReceipt {
  provider: "resend" | "smtp" | "development" | "memory";
  messageId?: string;
}

export interface Mailer {
  send(message: EmailMessage, options?: { idempotencyKey: string }): Promise<EmailReceipt | void>;
}

function safeMessage(message: EmailMessage, fallbackFrom: string): EmailMessage & { from: string } {
  const from = message.from ?? fallbackFrom;
  const address = /^(?:[^<>]+ <([^<>]+)>|([^<>]+))$/.exec(from);
  if (!address || /[\x00-\x1f\x7f]/.test(from) || !z.string().email().safeParse(address[1] ?? address[2]).success ||
      !z.string().email().safeParse(message.to).success || /[\x00-\x1f\x7f]/.test(message.subject)) {
    throw new DeliveryError("invalid_email_headers", false);
  }
  return { ...message, from };
}

/** Sends through the Resend HTTP API, always reusing the outbox idempotency key. */
export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly http: typeof fetch = fetch,
    private readonly timeoutMs = 10_000,
  ) {}

  async send(message: EmailMessage, options?: { idempotencyKey: string }): Promise<EmailReceipt> {
    const safe = safeMessage(message, this.from);
    try {
      const res = await this.http("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`, "content-type": "application/json",
          ...(options ? { "idempotency-key": options.idempotencyKey } : {}),
        },
        body: JSON.stringify({ from: safe.from, to: [safe.to], subject: safe.subject, text: safe.text }),
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: "error",
      });
      if (!res.ok) {
        // A conflicting payload is permanent; a concurrent request with the same key is retryable.
        if (res.status === 409) {
          const body = await res.json().catch(() => null) as { name?: string } | null;
          throw new DeliveryError("resend_http_409", body?.name !== "invalid_idempotent_request");
        }
        await res.body?.cancel();
        requireDeliverySuccess(res, "resend");
      }
      const body = await res.json() as { id?: unknown };
      if (typeof body?.id !== "string" || !/^[a-f0-9-]{36}$/i.test(body.id)) {
        throw new DeliveryError("resend_invalid_response");
      }
      return { provider: "resend", messageId: body.id };
    } catch (error) {
      if (error instanceof DeliveryError) throw error;
      const timeout = error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name);
      throw new DeliveryError(timeout ? "resend_timeout" : "resend_unreachable");
    }
  }
}

/** SMTP cannot guarantee deduplication after an ambiguous acceptance; prefer Resend HTTP. */
export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;

  constructor(url: string, private readonly from: string) {
    this.transport = createTransport({ url, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 });
  }

  async send(message: EmailMessage, options?: { idempotencyKey: string }): Promise<EmailReceipt> {
    const safe = safeMessage(message, this.from);
    try {
      const result = await this.transport.sendMail({
        from: safe.from, to: safe.to, subject: safe.subject, text: safe.text,
        // A stable Message-ID helps operators correlate retries, but is not a delivery guarantee.
        ...(options ? { messageId: `<${options.idempotencyKey.replace(/[^A-Za-z0-9._-]/g, "-")}@neuravic.invalid>` } : {}),
        disableFileAccess: true, disableUrlAccess: true,
      });
      if (!result.accepted?.length) throw new DeliveryError("smtp_rejected", false);
      return { provider: "smtp", messageId: result.messageId };
    } catch (error) {
      if (error instanceof DeliveryError) throw error;
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

/** Development-only mailbox. Captured messages have never been sent to an external provider. */
export class DevMailer implements Mailer {
  readonly inbox: (EmailMessage & { at: number })[] = [];
  async send(message: EmailMessage): Promise<EmailReceipt> {
    this.inbox.unshift({ ...message, at: Date.now() });
    this.inbox.length = Math.min(this.inbox.length, 50);
    return { provider: "development" };
  }
}

export class MemoryMailer implements Mailer {
  readonly sent: EmailMessage[] = [];
  failWith: Error | null = null;
  async send(message: EmailMessage): Promise<EmailReceipt> {
    if (this.failWith) throw this.failWith;
    this.sent.push(message);
    return { provider: "memory" };
  }
}
