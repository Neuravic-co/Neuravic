"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cookie, X } from "lucide-react";
import { useEffect, useRef, useState, useSyncExternalStore } from "react";

const STORAGE_KEY = "neuravic-notice-dismissed";
/** Fired by the footer's "Cookie Settings" link to reopen the settings. */
export const COOKIE_SETTINGS_EVENT = "neuravic:cookie-settings";
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
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);

  useEffect(() => {
    const open = () => {
      setSettingsOpen(true);
      dialogRef.current?.showModal();
    };
    window.addEventListener(COOKIE_SETTINGS_EVENT, open);
    return () => window.removeEventListener(COOKIE_SETTINGS_EVENT, open);
  }, []);

  function dismiss() {
    try {
      window.localStorage.setItem(STORAGE_KEY, "1");
    } catch {
      // Storage blocked: hide for this page view only.
    }
    listeners.forEach((listener) => listener());
    dialogRef.current?.close();
  }

  function openSettings() {
    setSettingsOpen(true);
    dialogRef.current?.showModal();
  }

  return (
    <>
      {dismissed || inPortal ? null : (
        <aside className="cookie-notice" role="region" aria-label="Cookie notice">
          <div className="cookie-notice__copy">
            <p className="cookie-notice__title">
              <Cookie aria-hidden="true" size={16} strokeWidth={1.75} />
              Your privacy
            </p>
            <p className="cookie-notice__text">
              This site saves your privacy choice and temporary project selections in your
              browser. No analytics or advertising scripts are installed. Read our{" "}
              <Link href="/legal/cookies">Cookie Policy</Link> and{" "}
              <Link href="/legal/privacy">Privacy Policy</Link>.
            </p>
          </div>
          <div className="cookie-notice__actions">
            <button type="button" className="cookie-notice__button" onClick={dismiss}>
              Essential Only
            </button>
            <button
              type="button"
              className="cookie-notice__button cookie-notice__button--ghost"
              aria-haspopup="dialog"
              onClick={openSettings}
            >
              Cookie Settings
            </button>
          </div>
        </aside>
      )}

      <dialog
        ref={dialogRef}
        className="cookie-settings"
        aria-labelledby="cookie-settings-title"
        onClose={() => setSettingsOpen(false)}
        onClick={(event) => {
          if (event.target === dialogRef.current) dialogRef.current?.close();
        }}
      >
        {settingsOpen ? (
          <div className="cookie-settings__card">
            <header>
              <h2 id="cookie-settings-title">Cookie Settings</h2>
              <button
                type="button"
                className="cookie-settings__close"
                aria-label="Close"
                onClick={() => dialogRef.current?.close()}
              >
                <X aria-hidden="true" size={18} strokeWidth={1.5} />
              </button>
            </header>
            <div className="cookie-settings__row">
              <div>
                <h3>Essential storage</h3>
                <p>
                  Remembers this choice and temporary project selections, and keeps portal
                  sign-in working. Always on.
                </p>
              </div>
              <span className="cookie-settings__badge">Always on</span>
            </div>
            <div className="cookie-settings__row">
              <div>
                <h3>Analytics and advertising</h3>
                <p>Not used on this site, so there is nothing to switch on.</p>
              </div>
              <span className="cookie-settings__badge cookie-settings__badge--off">Not used</span>
            </div>
            <footer>
              <Link href="/legal/cookies">Cookie Policy</Link>
              <button type="button" className="cookie-notice__button" onClick={dismiss}>
                Save choice
              </button>
            </footer>
          </div>
        ) : null}
      </dialog>
    </>
  );
}
