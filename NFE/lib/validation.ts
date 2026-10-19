/**
 * Light checks that run in the browser before a form is sent, so mistakes are caught instantly.
 * They mirror the API's rules and messages. The API validates everything again and stays the authority;
 * this file is deliberately tiny so the website does not have to ship a validation library.
 */

/** Same shape of address the API accepts: no leading or doubled dots, a real domain with a 2+ letter ending. */
const EMAIL_PATTERN = /^(?!\.)(?!.*\.\.)([A-Za-z0-9_'+\-.]*)[A-Za-z0-9_+-]@([A-Za-z0-9][A-Za-z0-9-]*\.)+[A-Za-z]{2,}$/;

/** Returns a message when the address is not valid, otherwise undefined. */
export function emailError(value: string): string | undefined {
  const email = value.trim();
  return email.length <= 254 && EMAIL_PATTERN.test(email) ? undefined : "Enter a valid email address";
}

export interface ContactValues {
  firstName: string;
  lastName: string;
  email: string;
  company?: string;
  message: string;
  consent: boolean;
}

export type ContactField = "firstName" | "lastName" | "email" | "company" | "message" | "consent";
export type ContactResult =
  | { ok: true; data: ContactValues }
  | { ok: false; errors: Partial<Record<ContactField, string>> };

/** Checks the contact form. Values come back trimmed. Errors are listed in the order the fields appear. */
export function validateContact(values: ContactValues): ContactResult {
  const data: ContactValues = {
    ...values,
    firstName: values.firstName.trim(),
    lastName: values.lastName.trim(),
    email: values.email.trim(),
    company: values.company?.trim() || undefined,
    message: values.message.trim(),
  };
  const errors: Partial<Record<ContactField, string>> = {};

  if (data.firstName.length < 1) errors.firstName = "Tell us your name";
  else if (data.firstName.length > 60) errors.firstName = "Name is too long";

  if (data.lastName.length < 1) errors.lastName = "Tell us your last name";
  else if (data.lastName.length > 59) errors.lastName = "Last name is too long";

  const badEmail = emailError(data.email);
  if (badEmail) errors.email = badEmail;

  if (data.company && data.company.length > 160) errors.company = "Company name is too long";

  if (data.message.length < 10) errors.message = "Please write at least a sentence";
  else if (data.message.length > 4000) errors.message = "Message is too long (4000 characters maximum)";

  if (data.consent !== true) errors.consent = "Please agree so we can reply to you";

  return Object.keys(errors).length === 0 ? { ok: true, data } : { ok: false, errors };
}
