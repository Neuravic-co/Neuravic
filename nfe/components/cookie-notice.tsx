"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";

const STORAGE_KEY = "neuravic-notice-dismissed";
const listeners = new Set<() => void>();

function readDismissed() {
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Tells visitors the site only uses essential storage; shown once, no tracking to opt out of. */
export function CookieNotice() {
  // Server and first client render treat it as dismissed, so nothing flashes or shifts.
  const dismissed = useSyncExternalStore(subscribe, readDismissed, () => true);
  // The portal is a work screen; its storage is covered by the cookie policy linked from the site footer.
  const inPortal = usePathname().startsWith("/portal");

  if (dismissed || inPortal) return null;

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Storage blocked: hide for this page view only.
    }
    listeners.forEach((listener) => listener());
  }

  return (
    <aside className="cookie-notice" role="region" aria-label="Cookie notice">
      <p className="cookie-notice__title">Your privacy</p>
      <p className="cookie-notice__text">
        We only use essential cookies and storage to keep the site and portal working. No ads, no
        tracking.{" "}
        <Link href="/legal/cookies">Cookie policy</Link>
        {" · "}
        <Link href="/legal/privacy">Privacy</Link>
      </p>
      <button type="button" className="cookie-notice__button" onClick={dismiss}>
        Got it
      </button>
    </aside>
  );
}
