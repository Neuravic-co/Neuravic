"use client";

import { LogIn, LogOut, UserRound } from "lucide-react";
import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { api } from "@/lib/api";
import type { Me } from "@/lib/portal";
import { PORTAL_OPEN } from "@/lib/portal-gate";

type Account = { status: "unknown" } | { status: "anonymous" } | { status: "signed-in"; me: Me };

/** The round profile button. It asks visitors to sign in, and shows the account once they have. */
export function ProfileMenu() {
  const [open, setOpen] = useState(false);
  const [account, setAccount] = useState<Account>({ status: "unknown" });
  const root = useRef<HTMLDivElement>(null);

  // Check for a session the first time the menu opens, so the public site makes no request until it is needed.
  useEffect(() => {
    if (!open || !PORTAL_OPEN || account.status !== "unknown") return;
    let cancelled = false;
    api<Me>("/me")
      .then((me) => !cancelled && setAccount({ status: "signed-in", me }))
      // A failed request, such as the API being offline, counts as signed out: the portal explains the rest.
      .catch(() => !cancelled && setAccount({ status: "anonymous" }));
    return () => {
      cancelled = true;
    };
  }, [open, account.status]);

  useEffect(() => {
    if (!open) return;
    const close = (event: Event) => {
      if (event.target instanceof Node && !root.current?.contains(event.target)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        root.current?.querySelector("button")?.focus();
      }
    };
    document.addEventListener("pointerdown", close);
    document.addEventListener("keydown", escape);
    return () => {
      document.removeEventListener("pointerdown", close);
      document.removeEventListener("keydown", escape);
    };
  }, [open]);

  async function signOut() {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      setAccount({ status: "anonymous" });
      setOpen(false);
    }
  }

  const me = account.status === "signed-in" ? account.me : null;

  return (
    <div className="profile-menu" ref={root}>
      <button
        type="button"
        className="site-header__profile"
        aria-label={me ? "Your account" : "Sign in or log in"}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="profile-menu-panel"
        onClick={() => setOpen((value) => !value)}
      >
        <UserRound aria-hidden="true" size={18} strokeWidth={1.5} />
      </button>

      {open ? (
        <div className="profile-menu__panel" id="profile-menu-panel" role="dialog" aria-label="Account">
          {me ? (
            <>
              <p className="profile-menu__title">{me.user.name ?? me.user.email}</p>
              <p className="profile-menu__text">{me.user.email}</p>
              <Link className="profile-menu__action" href="/portal" onClick={() => setOpen(false)}>
                <UserRound aria-hidden="true" size={16} strokeWidth={1.5} />
                Open your portal
              </Link>
              <button type="button" className="profile-menu__quiet" onClick={() => void signOut()}>
                <LogOut aria-hidden="true" size={16} strokeWidth={1.5} />
                Sign out
              </button>
            </>
          ) : (
            <>
              <p className="profile-menu__title">Sign in or log in</p>
              <p className="profile-menu__text">
                Use your email. We send you a one-time link, so there is no password to remember.
              </p>
              <Link className="profile-menu__action" href="/portal" onClick={() => setOpen(false)}>
                <LogIn aria-hidden="true" size={16} strokeWidth={1.5} />
                Continue to sign in
              </Link>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}
