import { createTransport, type Transporter } from "nodemailer";
import { DeliveryError } from "../../core/errors";
import { assertSafeMessage, type EmailMessage, type EmailReceipt, type Mailer, type SendOptions } from "./mailer";

const senderDomain = (from: string) => /@([^>\s]+)>?$/.exec(from)?.[1] ?? "localhost";

export class SmtpMailer implements Mailer {
  private readonly transport: Transporter;

  constructor(url: string) {
    this.transport = createTransport({ url, connectionTimeout: 10_000, greetingTimeout: 10_000, socketTimeout: 20_000 });
  }

  async send(message: EmailMessage, options: SendOptions): Promise<EmailReceipt> {
    assertSafeMessage(message);
    try {
      const result = await this.transport.sendMail({
        from: message.from,
        to: message.to,
        subject: message.subject,
        text: message.text,
        messageId: `<${options.idempotencyKey.replace(/[^A-Za-z0-9._-]/g, "-")}@${senderDomain(message.from)}>`,
        disableFileAccess: true,
        disableUrlAccess: true,
      });
      if (!result.accepted?.length) throw new DeliveryError("smtp_rejected", false);
      return { provider: "smtp", messageId: result.messageId };
    } catch (error) {
      if (error instanceof DeliveryError) throw error;
      const code = (error as { responseCode?: number }).responseCode;
      if (code === undefined) throw new DeliveryError("smtp_unreachable");
      throw new DeliveryError(code < 500 ? "smtp_temporary" : "smtp_rejected", code < 500);
    }
  }
}
