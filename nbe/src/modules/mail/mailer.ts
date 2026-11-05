import { z } from "zod";
import { DeliveryError } from "../../core/errors";

export interface EmailMessage {
  to: string;
  from: string;
  subject: string;
  text: string;
}

export interface EmailReceipt {
  provider: "resend" | "smtp" | "development" | "memory";
  messageId?: string;
}

export interface SendOptions {
  idempotencyKey: string;
}

export interface Mailer {
  send(message: EmailMessage, options: SendOptions): Promise<EmailReceipt>;
}

const email = z.email();
const FROM_PATTERN = /^(?:[^<>]+ <([^<>]+)>|([^<>]+))$/;
const CONTROL_CHARACTERS = /[\x00-\x1f\x7f]/;

export function assertSafeMessage(message: EmailMessage): void {
  const address = FROM_PATTERN.exec(message.from);
  const valid =
    address !== null &&
    !CONTROL_CHARACTERS.test(message.from) &&
    !CONTROL_CHARACTERS.test(message.subject) &&
    email.safeParse(address[1] ?? address[2]).success &&
    email.safeParse(message.to).success;
  if (!valid) throw new DeliveryError("invalid_email_headers", false);
}
