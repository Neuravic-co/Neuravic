import { DeliveryError, requireDeliverySuccess } from "../../core/errors";
import { assertSafeMessage, type EmailMessage, type EmailReceipt, type Mailer, type SendOptions } from "./mailer";

const RESEND_ID = /^[a-f0-9-]{36}$/i;

export class ResendMailer implements Mailer {
  constructor(
    private readonly apiKey: string,
    private readonly http: typeof fetch = fetch,
    private readonly timeoutMs = 10_000,
  ) {}

  async send(message: EmailMessage, options: SendOptions): Promise<EmailReceipt> {
    assertSafeMessage(message);
    try {
      const response = await this.http("https://api.resend.com/emails", {
        method: "POST",
        headers: {
          authorization: `Bearer ${this.apiKey}`,
          "content-type": "application/json",
          "idempotency-key": options.idempotencyKey,
        },
        body: JSON.stringify({ from: message.from, to: [message.to], subject: message.subject, text: message.text }),
        signal: AbortSignal.timeout(this.timeoutMs),
        redirect: "error",
      });
      if (!response.ok) {
        if (response.status === 409) {
          const body = (await response.json().catch(() => null)) as { name?: string } | null;
          throw new DeliveryError("resend_http_409", body?.name !== "invalid_idempotent_request");
        }
        await response.body?.cancel();
        requireDeliverySuccess(response, "resend");
      }
      const body = (await response.json()) as { id?: unknown };
      if (typeof body?.id !== "string" || !RESEND_ID.test(body.id)) throw new DeliveryError("resend_invalid_response");
      return { provider: "resend", messageId: body.id };
    } catch (error) {
      if (error instanceof DeliveryError) throw error;
      const timedOut = error instanceof Error && ["AbortError", "TimeoutError"].includes(error.name);
      throw new DeliveryError(timedOut ? "resend_timeout" : "resend_unreachable");
    }
  }
}
