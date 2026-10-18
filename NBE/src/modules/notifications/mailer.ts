import type { Logger } from "../../lib/logger";

export interface EmailMessage {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  send(message: EmailMessage): Promise<void>;
}

/** Sends through the Resend HTTP API. */
export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
    private readonly http: typeof fetch = fetch,
  ) {}

  async send(message: EmailMessage): Promise<void> {
    const res = await this.http("https://api.resend.com/emails", {
      method: "POST",
      headers: { authorization: `Bearer ${this.apiKey}`, "content-type": "application/json" },
      body: JSON.stringify({ from: this.from, to: [message.to], subject: message.subject, text: message.text }),
    });
    if (!res.ok) throw new Error(`Resend responded ${res.status}`);
  }
}

/** Development mailer: logs recipient and subject only (never the body, which can hold login links in prod). */
export class ConsoleMailer implements Mailer {
  constructor(private readonly log: Logger, private readonly includeBody = false) {}

  async send(message: EmailMessage): Promise<void> {
    this.log.info("email_not_sent_no_provider", {
      to: message.to,
      subject: message.subject,
      ...(this.includeBody ? { text: message.text } : {}),
    });
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
