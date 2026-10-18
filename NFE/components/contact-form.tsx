"use client";

import { ArrowUpRight } from "lucide-react";
import { useEffect, useId, useRef, useState, type FormEvent } from "react";
import { z } from "zod";
import { ApiError, api } from "@/lib/api";

const SERVICES = [
  { value: "ai", label: "AI systems" },
  { value: "software", label: "Software" },
  { value: "product", label: "Product design" },
  { value: "ops", label: "Operations" },
] as const;

type ServiceValue = (typeof SERVICES)[number]["value"];

/** Mirrors the API validation so mistakes are caught before a request is sent. */
const formSchema = z.object({
  name: z.string().trim().min(1, "Tell us your name").max(120, "Name is too long"),
  email: z.string().trim().email("Enter a valid email address").max(254),
  company: z.string().trim().max(160, "Company name is too long").optional(),
  message: z
    .string()
    .trim()
    .min(10, "Please write at least a sentence")
    .max(4000, "Message is too long (4000 characters maximum)"),
  consent: z.literal(true, { errorMap: () => ({ message: "Please agree so we can reply to you" }) }),
});

type FieldName = "name" | "email" | "company" | "message" | "consent" | "form";
type Errors = Partial<Record<FieldName, string>>;

const TURNSTILE_SITE_KEY = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY;

declare global {
  interface Window {
    turnstile?: {
      render: (el: HTMLElement, options: Record<string, unknown>) => string;
      reset: (id?: string) => void;
    };
  }
}

export function ContactForm({ fallbackEmail }: { fallbackEmail: string }) {
  const uid = useId();
  const [services, setServices] = useState<ServiceValue[]>([]);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const [sentTo, setSentTo] = useState("");
  const [token, setToken] = useState("");
  const widget = useRef<HTMLDivElement>(null);
  const widgetId = useRef<string | undefined>(undefined);
  const confirmation = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!TURNSTILE_SITE_KEY || !widget.current) return;
    const render = () => {
      if (!window.turnstile || !widget.current || widgetId.current) return;
      widgetId.current = window.turnstile.render(widget.current, {
        sitekey: TURNSTILE_SITE_KEY,
        theme: "dark",
        callback: (value: string) => setToken(value),
        "expired-callback": () => setToken(""),
      });
    };
    if (window.turnstile) {
      render();
      return;
    }
    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.onload = render;
    document.head.appendChild(script);
  }, []);

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
      name: String(form.get("name") ?? ""),
      email: String(form.get("email") ?? ""),
      company: String(form.get("company") ?? "").trim() || undefined,
      message: String(form.get("message") ?? ""),
      consent,
    };

    const parsed = formSchema.safeParse(values);
    if (!parsed.success) {
      const next: Errors = {};
      for (const issue of parsed.error.issues) {
        const key = issue.path[0] as FieldName;
        next[key] ??= issue.message;
      }
      setErrors(next);
      document.getElementById(`${uid}-${Object.keys(next)[0]}`)?.focus();
      return;
    }
    if (TURNSTILE_SITE_KEY && !token) {
      setErrors({ form: "Please complete the verification check first." });
      return;
    }

    setErrors({});
    setStatus("sending");
    try {
      await api("/leads", {
        method: "POST",
        body: {
          ...parsed.data,
          serviceInterest: services,
          turnstileToken: token || undefined,
          website: String(form.get("website") ?? ""),
        },
      });
      setSentTo(parsed.data.email);
      setStatus("sent");
    } catch (error) {
      setStatus("idle");
      if (window.turnstile && widgetId.current) window.turnstile.reset(widgetId.current);
      setToken("");
      if (error instanceof ApiError && error.status === 400 && error.fieldErrors.length) {
        const next: Errors = {};
        for (const item of error.fieldErrors) next[item.path as FieldName] ??= item.message;
        setErrors(next);
      } else if (error instanceof ApiError && error.status === 429) {
        setErrors({ form: "Too many messages from this connection. Please try again in a little while." });
      } else if (error instanceof ApiError && error.status === 422) {
        setErrors({ form: "The verification check failed. Please try again." });
      } else {
        setErrors({ form: `We could not send your message. You can also email us at ${fallbackEmail}.` });
      }
    }
  }

  if (status === "sent") {
    return (
      <div className="contact-form contact-form--sent" role="status" tabIndex={-1} ref={confirmation}>
        <p className="contact-form__sent-title">Message received.</p>
        <p>
          Thank you. We sent a confirmation to <strong>{sentTo}</strong> and will reply from there.
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
          <label htmlFor={`${uid}-name`}>Name</label>
          <input type="text" autoComplete="name" maxLength={120} {...field("name")} />
          {fieldError("name")}
        </div>
        <div className="contact-form__field">
          <label htmlFor={`${uid}-email`}>Email</label>
          <input type="email" autoComplete="email" maxLength={254} {...field("email")} />
          {fieldError("email")}
        </div>
      </div>

      <div className="contact-form__field">
        <label htmlFor={`${uid}-company`}>
          Company <em>optional</em>
        </label>
        <input type="text" autoComplete="organization" maxLength={160} {...field("company")} />
        {fieldError("company")}
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

      {TURNSTILE_SITE_KEY ? <div ref={widget} className="contact-form__turnstile" /> : null}

      <div aria-live="polite">
        {errors.form ? <p className="contact-form__error contact-form__error--form">{errors.form}</p> : null}
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
