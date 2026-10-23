"use client";

import { ArrowUpRight } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { ApiError, api } from "@/lib/api";
import { validateContact } from "@/lib/validation";
import { useTurnstile } from "./use-turnstile";

const SERVICES = [
  { value: "ai", label: "AI systems" },
  { value: "software", label: "Software" },
  { value: "product", label: "Product design" },
  { value: "ops", label: "Operations" },
] as const;

type ServiceValue = (typeof SERVICES)[number]["value"];

type FieldName = "firstName" | "lastName" | "email" | "company" | "message" | "consent" | "form";
type Errors = Partial<Record<FieldName, string>>;

export function ContactForm({ fallbackEmail }: { fallbackEmail: string }) {
  const uid = useId();
  const [services, setServices] = useState<ServiceValue[]>([]);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  /** A ready-to-send email with what the person typed, offered when the form cannot reach the server. */
  const [emailInstead, setEmailInstead] = useState<string | null>(null);
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [sentTo, setSentTo] = useState("");
  const { container: widget, token, reset: resetCheck, enabled: checkEnabled } = useTurnstile();
  const confirmation = useRef<HTMLDivElement>(null);

  // The form collapses on success: bring the confirmation into view and announce it.
  useEffect(() => {
    if (status !== "sent") return;
    confirmation.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    confirmation.current?.focus({ preventScroll: true });
  }, [status]);

  /** Clears a field's error as soon as the person edits it. */
  const clearError = (name: string | undefined) =>
    setErrors((current) => {
      if (!name || (!current[name as FieldName] && !current.form)) return current;
      const next = { ...current };
      delete next[name as FieldName];
      delete next.form;
      return next;
    });

  const toggleService = (value: ServiceValue) =>
    setServices((current) => (current.includes(value) ? current.filter((v) => v !== value) : [...current, value]));

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (status === "sending") return;
    const form = new FormData(event.currentTarget);
    const values = {
      firstName: String(form.get("firstName") ?? ""),
      lastName: String(form.get("lastName") ?? ""),
      email: String(form.get("email") ?? ""),
      company: String(form.get("company") ?? "").trim() || undefined,
      message: String(form.get("message") ?? ""),
      consent,
    };

    const parsed = validateContact(values);
    if (!parsed.ok) {
      setErrors(parsed.errors);
      document.getElementById(`${uid}-${Object.keys(parsed.errors)[0]}`)?.focus();
      return;
    }
    if (checkEnabled && !token) {
      setErrors({ form: "Please complete the verification check first." });
      return;
    }

    setErrors({});
    setEmailInstead(null);
    setStatus("sending");
    try {
      const { firstName, lastName, ...details } = parsed.data;
      await api("/leads", {
        method: "POST",
        body: {
          ...details,
          // The API stores one full name.
          name: `${firstName} ${lastName}`,
          serviceInterest: services,
          turnstileToken: token || undefined,
          website: String(form.get("website") ?? ""),
        },
      });
      setSentTo(parsed.data.email);
      setStatus("sent");
    } catch (error) {
      setStatus("idle");
      resetCheck();
      if (error instanceof ApiError && error.status === 400 && error.fieldErrors.length) {
        const next: Errors = {};
        for (const item of error.fieldErrors) {
          // The API has one "name" field; show its message under the first name box.
          const key = (item.path === "name" ? "firstName" : item.path) as FieldName;
          next[key] ??= item.message;
        }
        setErrors(next);
      } else if (error instanceof ApiError && error.status === 429) {
        setErrors({ form: "Too many messages from this connection. Please try again in a little while." });
      } else if (error instanceof ApiError && error.status === 422) {
        setErrors({ form: "The verification check failed. Please try again." });
      } else {
        setErrors({ form: `We could not send your message. You can also email us at ${fallbackEmail}.` });
        const body = `${parsed.data.message}\n\n${parsed.data.firstName} ${parsed.data.lastName}${parsed.data.company ? `, ${parsed.data.company}` : ""}\n${parsed.data.email}`;
        setEmailInstead(`mailto:${fallbackEmail}?subject=${encodeURIComponent("Start a project with Neuravic")}&body=${encodeURIComponent(body)}`);
      }
    }
  }

  if (status === "sent") {
    return (
      <div className="contact-form contact-form--sent" role="status" tabIndex={-1} ref={confirmation}>
        <p className="contact-form__sent-title">Message received.</p>
        <p>
          Thank you. We received your enquiry and will reply to <strong>{sentTo}</strong>.
        </p>
      </div>
    );
  }

  const field = (name: Exclude<FieldName, "form">) => ({
    id: `${uid}-${name}`,
    name,
    "aria-invalid": errors[name] ? true : undefined,
    "aria-describedby": errors[name] ? `${uid}-${name}-error` : undefined,
  });
  const fieldError = (name: Exclude<FieldName, "form">) =>
    errors[name] ? (
      <span className="contact-form__error" id={`${uid}-${name}-error`}>
        {errors[name]}
      </span>
    ) : null;

  return (
    <form
      className="contact-form"
      onSubmit={onSubmit}
      onInput={(event) => clearError((event.target as HTMLInputElement).name)}
      noValidate
    >
      <div className="contact-form__row">
        <div className="contact-form__field">
          <label htmlFor={`${uid}-firstName`}>Name</label>
          <input type="text" autoComplete="given-name" maxLength={60} {...field("firstName")} />
          {fieldError("firstName")}
        </div>
        <div className="contact-form__field">
          <label htmlFor={`${uid}-lastName`}>Last name</label>
          <input type="text" autoComplete="family-name" maxLength={59} {...field("lastName")} />
          {fieldError("lastName")}
        </div>
      </div>

      <div className="contact-form__row">
        <div className="contact-form__field">
          <label htmlFor={`${uid}-email`}>Email</label>
          <input type="email" autoComplete="email" maxLength={254} {...field("email")} />
          {fieldError("email")}
        </div>
        <div className="contact-form__field">
          <label htmlFor={`${uid}-company`}>
            Company <em>optional</em>
          </label>
          <input type="text" autoComplete="organization" maxLength={160} {...field("company")} />
          {fieldError("company")}
        </div>
      </div>

      <fieldset className="contact-form__services">
        <legend>
          What do you need? <em>optional</em>
        </legend>
        <div>
          {SERVICES.map((service) => (
            <label className={services.includes(service.value) ? "is-selected" : ""} key={service.value}>
              <input
                type="checkbox"
                checked={services.includes(service.value)}
                onChange={() => toggleService(service.value)}
              />
              <span>{service.label}</span>
            </label>
          ))}
        </div>
      </fieldset>

      <div className="contact-form__field">
        <label htmlFor={`${uid}-message`}>Where does the operation break down?</label>
        <textarea rows={5} maxLength={4000} {...field("message")} />
        {fieldError("message")}
      </div>

      {/* Honeypot: hidden from people and assistive technology, bots fill it in. */}
      <div className="contact-form__trap" aria-hidden="true">
        <label>
          Website
          <input type="text" name="website" tabIndex={-1} autoComplete="off" />
        </label>
      </div>

      <label className="contact-form__consent">
        <input
          type="checkbox"
          id={`${uid}-consent`}
          name="consent"
          checked={consent}
          onChange={(event) => setConsent(event.target.checked)}
          aria-invalid={errors.consent ? true : undefined}
          aria-describedby={errors.consent ? `${uid}-consent-error` : undefined}
        />
        <span>I agree that Neuravic may use these details to reply to my enquiry.</span>
      </label>
      {errors.consent ? (
        <span className="contact-form__error" id={`${uid}-consent-error`}>
          {errors.consent}
        </span>
      ) : null}

      {checkEnabled ? <div ref={widget} className="contact-form__turnstile" /> : null}

      <div aria-live="polite">
        {errors.form ? <p className="contact-form__error contact-form__error--form">{errors.form}</p> : null}
        {emailInstead ? (
          <a className="contact-form__fallback" href={emailInstead}>
            Send it by email instead
          </a>
        ) : null}
      </div>

      <div className="contact-form__actions">
        <button className="button button--primary button--large" type="submit" disabled={status === "sending"}>
          <span>{status === "sending" ? "Sending…" : "Start a Conversation"}</span>
          <ArrowUpRight aria-hidden="true" size={18} strokeWidth={1.5} />
        </button>
        <a
          className="contact-form__mailto"
          href={`mailto:${fallbackEmail}?subject=Start%20a%20project%20with%20Neuravic`}
        >
          Prefer email? {fallbackEmail}
        </a>
      </div>
    </form>
  );
}
