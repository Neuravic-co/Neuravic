"use client";

import Script from "next/script";
import { useEffect, useRef, useState } from "react";

interface Turnstile {
  render(container: HTMLElement, options: Record<string, unknown>): string;
  reset(id: string): void;
  remove(id: string): void;
}
declare global { interface Window { turnstile?: Turnstile } }

export function ContactVerification({ siteKey, onToken, onResetReady }: {
  siteKey: string;
  onToken: (token: string) => void;
  onResetReady: (reset: () => void) => void;
}) {
  const container = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    const api = window.turnstile;
    if (!ready || !api || !container.current) return;
    const clear = () => onToken("");
    const id = api.render(container.current, {
      sitekey: siteKey, action: "contact", size: "compact",
      callback: (token: string) => { onToken(token); setError(""); },
      "expired-callback": clear,
      "timeout-callback": clear,
      "error-callback": () => { clear(); setError("Verification could not load. Please try again."); },
    });
    onResetReady(() => { clear(); api.reset(id); });
    return () => { clear(); onResetReady(() => {}); api.remove(id); };
  }, [ready, siteKey, onToken, onResetReady]);
  return <>
    <Script src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
      onReady={() => setReady(true)} onError={() => setError("Verification could not load. Please try again later.")} />
    <div ref={container} role="group" aria-label="Contact verification" />
    {error ? <p role="alert" className="contact-form__error">{error}</p> : null}
  </>;
}
