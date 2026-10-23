"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { ApiError, api } from "@/lib/api";
import { emailError } from "@/lib/validation";
import { useTurnstile } from "../use-turnstile";
import { Field } from "./ui";

export type AuthMode = "login" | "signup";
type Errors = { name?: string; email?: string; consent?: string; form?: string };

function failureMessage(error: unknown, action: string): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return "Too many attempts. Please wait a while and try again.";
    if (error.status === 422) return "The verification check failed. Please try again.";
    if (error.status === 503) return `${action} is not available right now. Please try again later.`;
  }
  return `We could not reach the server. Check your connection and try again.`;
}

/** Log in and sign up share one form: both end in a one-time link emailed to the person. */
export function AuthForm({ mode, notice }: { mode: AuthMode; notice?: string }) {
  const id = useId();
  const signup = mode === "signup";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  const { container: widget, token, reset: resetCheck, enabled: checkEnabled } = useTurnstile();

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (status === "sending") return;
    const next: Errors = {};
    if (signup && name.trim().length < 2) next.name = "Tell us your name";
    const invalid = emailError(email);
    if (invalid) next.email = invalid;
    if (signup && !consent) next.consent = "Please agree to continue";
    if (signup && checkEnabled && !token) next.form = "Please complete the verification check first.";
    setErrors(next);
    if (Object.keys(next).length > 0) {
      const first = next.name ? "name" : next.email ? "email" : next.consent ? "consent" : null;
      if (first) document.getElementById(`${id}-${first}`)?.focus();
      return;
    }

    setStatus("sending");
    try {
      if (signup) {
        await api("/auth/signup", {
          method: "POST",
          body: { name: name.trim(), email: email.trim(), consent: true, turnstileToken: token || undefined },
        });
      } else {
        await api("/auth/magic-link", { method: "POST", body: { email: email.trim() } });
      }
      setStatus("sent");
    } catch (caught) {
      setStatus("idle");
      if (signup) resetCheck();
      if (caught instanceof ApiError && caught.status === 400 && caught.fieldErrors.length > 0) {
        setErrors({
          name: caught.fieldMessage("name"),
          email: caught.fieldMessage("email"),
          consent: caught.fieldMessage("consent"),
        });
        return;
      }
      setErrors({ form: failureMessage(caught, signup ? "Sign-up" : "Sign-in") });
    }
  }

  const edit = (field: keyof Errors) => setErrors((current) => ({ ...current, [field]: undefined, form: undefined }));

  return (
    <div className="auth-card">
      <p className="auth-eyebrow">{signup ? "Account / Sign up" : "Portal / Sign in"}</p>
      {status === "sent" ? (
        <div role="status">
          <h1>Check your inbox.</h1>
          <p>
            {signup ? (
              <>
                We sent a link to <strong>{email.trim()}</strong>. Open it to finish creating your account. It works
                once and expires in 15 minutes.
              </>
            ) : (
              <>
                If <strong>{email.trim()}</strong> has a Neuravic account, we sent a sign-in link. It works once and
                expires in 15 minutes.
              </>
            )}
          </p>
          <button type="button" className="portal-link" onClick={() => setStatus("idle")}>
            Use a different email
          </button>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <h1>{signup ? "Create your account." : "Sign in to your portal."}</h1>
          <p>
            {signup
              ? "Tell us who you are and we will email you a one-time link. No password to remember."
              : "Enter your email and we will send you a one-time link. No password needed."}
          </p>
          {notice ? (
            <p className="auth-notice" role="status">
              {notice}
            </p>
          ) : null}
          {signup ? (
            <Field label="Name" htmlFor={`${id}-name`} error={errors.name}>
              <input
                id={`${id}-name`}
                type="text"
                autoComplete="name"
                autoFocus
                maxLength={100}
                value={name}
                aria-invalid={errors.name ? true : undefined}
                aria-describedby={errors.name ? `${id}-name-error` : undefined}
                onChange={(event) => {
                  setName(event.target.value);
                  edit("name");
                }}
              />
            </Field>
          ) : null}
          <Field label="Email" htmlFor={`${id}-email`} error={errors.email}>
            <input
              id={`${id}-email`}
              type="email"
              autoComplete="email"
              autoFocus={!signup}
              value={email}
              aria-invalid={errors.email ? true : undefined}
              aria-describedby={errors.email ? `${id}-email-error` : undefined}
              onChange={(event) => {
                setEmail(event.target.value);
                edit("email");
              }}
            />
          </Field>
          {signup ? (
            <div className="portal-consent">
              <label className="portal-check">
                <input
                  id={`${id}-consent`}
                  type="checkbox"
                  checked={consent}
                  aria-invalid={errors.consent ? true : undefined}
                  aria-describedby={errors.consent ? `${id}-consent-error` : undefined}
                  onChange={(event) => {
                    setConsent(event.target.checked);
                    edit("consent");
                  }}
                />
                <span>
                  I agree to the <Link href="/legal/terms">Terms</Link> and have read the{" "}
                  <Link href="/legal/privacy">Privacy policy</Link>.
                </span>
              </label>
              {errors.consent ? (
                <span className="portal-field__error" id={`${id}-consent-error`}>
                  {errors.consent}
                </span>
              ) : null}
            </div>
          ) : null}
          {signup && checkEnabled ? <div ref={widget} className="auth-check" /> : null}
          <div aria-live="polite">
            {errors.form ? <p className="portal-field__error auth-form-error" role="alert">{errors.form}</p> : null}
          </div>
          <button className="auth-submit" type="submit" disabled={status === "sending"}>
            <span>{status === "sending" ? "Sending…" : signup ? "Create account" : "Email me a link"}</span>
            <ArrowUpRight aria-hidden="true" size={18} strokeWidth={1.5} />
          </button>
        </form>
      )}
      <p className="auth-switch">
        {signup ? (
          <>
            Already have an account? <Link href="/login">Log in</Link>
          </>
        ) : (
          <>
            New here? <Link href="/signup">Create an account</Link>
          </>
        )}
      </p>
      <Link className="auth-back" href="/">
        ← Back to neuravic.com
      </Link>
    </div>
  );
}
