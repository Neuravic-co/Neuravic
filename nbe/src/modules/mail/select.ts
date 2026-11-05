import type { Config } from "../../config";
import type { Logger } from "../../core/logger";
import { DevMailer, UnconfiguredMailer } from "./local";
import type { Mailer } from "./mailer";
import { ResendMailer } from "./resend";
import { SmtpMailer } from "./smtp";

export function selectMailer(config: Config, log: Logger): { mailer: Mailer; devMailbox: DevMailer | null } {
  if (config.resendApiKey) return { mailer: new ResendMailer(config.resendApiKey), devMailbox: null };
  if (config.smtpUrl) return { mailer: new SmtpMailer(config.smtpUrl), devMailbox: null };
  if (!config.deployed) {
    const devMailbox = new DevMailer();
    return { mailer: devMailbox, devMailbox };
  }
  return { mailer: new UnconfiguredMailer(log), devMailbox: null };
}
