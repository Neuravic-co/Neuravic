"use client";

import { ArrowUpRight } from "lucide-react";
import Link from "next/link";
import { useId, useState, type FormEvent } from "react";
import { ApiError, api } from "@/lib/api";
import { emailError } from "@/lib/validation";
import { Field } from "./ui";

export function SignIn({ notice }: { notice?: string }) {
  const id = useId();
  const [email, setEmail] = useState("");
  const [error, setError] = useState("");
  const [status, setStatus] = useState<"idle" | "sending" | "sent">("idle");

  async function onSubmit(event: FormEvent) {
    event.preventDefault();
    if (status === "sending") return;
    const invalid = emailError(email);
    if (invalid) {
      setError(invalid);
      return;
    }
    setError("");
    setStatus("sending");
    try {
      await api("/auth/magic-link", { method: "POST", body: { email: email.trim() } });
      setStatus("sent");
    } catch (caught) {
      setStatus("idle");
      setError(
        caught instanceof ApiError && caught.status === 429
          ? "Too many attempts. Please wait a while and try again."
          : "We could not send the link. Check your connection and try again.",
      );
    }
  }

  return (
    <main className="portal-auth">
      <div className="portal-auth__card">
        <p className="portal-eyebrow">Portal / Sign in</p>
        {status === "sent" ? (
          <div role="status">
            <h1>Check your inbox.</h1>
            <p>
              If <strong>{email.trim()}</strong> has a Neuravic account, we sent a sign-in link. It works once and
              expires in 15 minutes.
            </p>
            <button type="button" className="portal-link" onClick={() => setStatus("idle")}>
              Use a different email
            </button>
          </div>
        ) : (
          <form onSubmit={onSubmit} noValidate>
            <h1>Sign in to your portal.</h1>
            <p>Enter your email and we will send you a one-time link. No password needed.</p>
            {notice ? (
              <p className="portal-auth__notice" role="status">
                {notice}
              </p>
            ) : null}
            <Field label="Email" htmlFor={`${id}-email`} error={error}>
              <input
                id={`${id}-email`}
                type="email"
                autoComplete="email"
                autoFocus
                value={email}
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? `${id}-email-error` : undefined}
                onChange={(event) => {
                  setEmail(event.target.value);
                  setError("");
                }}
              />
            </Field>
            <button className="button button--primary button--large" type="submit" disabled={status === "sending"}>
              <span>{status === "sending" ? "Sending…" : "Email me a link"}</span>
              <ArrowUpRight aria-hidden="true" size={18} strokeWidth={1.5} />
            </button>
          </form>
        )}
        <Link className="portal-auth__back" href="/">
          ← Back to neuravic.com
        </Link>
      </div>
    </main>
  );
}
