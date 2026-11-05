import { DeliveryError } from "../../core/errors";
import type { Logger } from "../../core/logger";
import type { EmailMessage, EmailReceipt, Mailer } from "./mailer";

export class UnconfiguredMailer implements Mailer {
  constructor(private readonly log: Logger) {}

  async send(): Promise<EmailReceipt> {
    this.log.warn("email_not_sent_no_provider");
    throw new DeliveryError("mail_not_configured");
  }
}

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
