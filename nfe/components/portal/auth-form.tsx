"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useCallback, useEffect, useId, useState, type FormEvent } from "react";
import { ApiError, api } from "@/lib/api";
import { SUPPORT_EMAIL } from "@/lib/portal";
import { emailError } from "@/lib/validation";
import { Field } from "./ui";

export type AuthMode = "login" | "signup";
type Errors = { name?: string; email?: string; password?: string; consent?: string; form?: string };

function failureMessage(error: unknown, action: string): string {
  if (error instanceof ApiError) {
    if (error.status === 429) return "Too many attempts. Please wait a while and try again.";
    if (error.status === 401) return "Email or password is incorrect.";
    if (error.status === 409) return "An account with this email already exists. Log in instead.";
    if (error.status === 422) return "The verification check failed. Please try again.";
    if (error.status === 503) return `${action} is not available right now. Please try again later.`;
  }
  return `We could not reach the server. Check your connection and try again.`;
}

/** Log in and sign up share one form: email and password, with an optional one-time sign-in link for existing accounts. */
export function AuthForm({ mode, notice }: { mode: AuthMode; notice?: string }) {
  const id = useId();
  const signup = mode === "signup";
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  /** Log in with an emailed one-time link instead of a password. */
  const [useLink, setUseLink] = useState(false);
  const [consent, setConsent] = useState(false);
  const [errors, setErrors] = useState<Errors>({});
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");
  /** False when the server cannot be reached, so the person is told before they type anything. */
  const [available, setAvailable] = useState(true);
  const [cooldown, setCooldown] = useState(0);

  useEffect(() => {
    let cancelled = false;
    api("/health").then(
      () => undefined,
      () => !cancelled && setAvailable(false),
    );
    return () => {
      cancelled = true;
    };
  }, []);

  // After a link is sent, resending is allowed once a short wait is over.
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = window.setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => window.clearTimeout(timer);
  }, [cooldown]);

  const send = useCallback(async () => {
    if (signup) {
      await api("/auth/register", {
        method: "POST",
        body: { name: name.trim(), email: email.trim(), password, consent: true },
      });
    } else if (useLink) {
      await api("/auth/magic-link", { method: "POST", body: { email: email.trim() } });
    } else {
      await api("/auth/login", { method: "POST", body: { email: email.trim(), password } });
    }
  }, [signup, useLink, name, email, password]);

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (status === "sending") return;
    const next: Errors = {};
    if (signup && name.trim().length < 2) next.name = "Tell us your name";
    const invalid = emailError(email);
    if (invalid) next.email = invalid;
    if (signup && password.length < 8) next.password = "Use at least 8 characters";
    else if (!signup && !useLink && !password) next.password = "Enter your password";
    if (signup && !consent) next.consent = "Please agree to continue";
    setErrors(next);
    if (Object.keys(next).length > 0) {
      const first = next.name ? "name" : next.email ? "email" : next.password ? "password" : next.consent ? "consent" : null;
      if (first) document.getElementById(`${id}-${first}`)?.focus();
      return;
    }

    setStatus("sending");
    try {
      await send();
      if (signup || !useLink) {
        window.location.replace("/portal");
        return;
      }
      setCooldown(30);
      setStatus("sent");
    } catch (caught) {
      setStatus("idle");
      if (caught instanceof ApiError && caught.status === 400 && caught.fieldErrors.length > 0) {
        setErrors({
          name: caught.fieldMessage("name"),
          email: caught.fieldMessage("email"),
          password: caught.fieldMessage("password"),
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
            If <strong>{email.trim()}</strong> has a Neuravic account, we sent a sign-in link. It works once and expires
            in 15 minutes.
          </p>
          <div className="auth-sent-actions">
            <button
              type="button"
              className="portal-link"
              disabled={cooldown > 0}
              onClick={() =>
                void send().then(
                  () => setCooldown(30),
                  (caught) => setErrors({ form: failureMessage(caught, signup ? "Sign-up" : "Sign-in") }),
                )
              }
            >
              {cooldown > 0 ? `Send the link again in ${cooldown}s` : "Send the link again"}
            </button>
            <button type="button" className="portal-link" onClick={() => setStatus("idle")}>
              Use a different email
            </button>
          </div>
          <div aria-live="polite">
            {errors.form ? <p className="portal-field__error auth-form-error">{errors.form}</p> : null}
          </div>
        </div>
      ) : (
        <form onSubmit={onSubmit} noValidate>
          <h1>{signup ? "Create your account." : "Sign in to your portal."}</h1>
          <p>
            {signup
              ? "Tell us who you are and choose a password."
              : useLink
                ? "Enter your email and we will send you a one-time link."
                : "Enter your email and password."}
          </p>
          {notice ? (
            <p className="auth-notice" role="status">
              {notice}
            </p>
          ) : null}
          {!available ? (
            <p className="auth-notice auth-notice--warn" role="status">
              {signup ? "Sign-up" : "Sign-in"} is being set up and is not available yet. Please check back soon, or email us at{" "}
              <a href={`mailto:${SUPPORT_EMAIL}`}>{SUPPORT_EMAIL}</a>.
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
          {signup || !useLink ? (
            <Field label="Password" htmlFor={`${id}-password`} error={errors.password}>
              <input
                id={`${id}-password`}
                type="password"
                autoComplete={signup ? "new-password" : "current-password"}
                maxLength={128}
                value={password}
                aria-invalid={errors.password ? true : undefined}
                aria-describedby={errors.password ? `${id}-password-error` : undefined}
                onChange={(event) => {
                  setPassword(event.target.value);
                  edit("password");
                }}
              />
            </Field>
          ) : null}
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
          <div aria-live="polite">
            {errors.form ? <p className="portal-field__error auth-form-error" role="alert">{errors.form}</p> : null}
          </div>
          <button className="auth-submit" type="submit" disabled={status === "sending"}>
            <span>
              {status === "sending" ? (signup || !useLink ? "Please wait…" : "Sending…") : signup ? "Create account" : useLink ? "Email me a link" : "Log in"}
            </span>
            <ArrowUpRight aria-hidden="true" size={18} strokeWidth={1.5} />
          </button>
        </form>
      )}
      {!signup && status !== "sent" ? (
        <p className="auth-switch">
          <button type="button" className="portal-link" onClick={() => { setUseLink(!useLink); setErrors({}); }}>
            {useLink ? "Use my password instead" : "Email me a sign-in link instead"}
          </button>
        </p>
      ) : null}
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
