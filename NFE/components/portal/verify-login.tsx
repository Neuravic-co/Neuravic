"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { ApiError, api } from "@/lib/api";

async function exchangeToken(token: string | null): Promise<"ok" | "failed" | "network"> {
  if (!token) return "failed";
  try {
    await api("/auth/verify", { method: "POST", body: { token } });
    return "ok";
  } catch (error) {
    return error instanceof ApiError && error.status === 0 ? "network" : "failed";
  }
}

/** Landing page for the emailed link: exchanges the one-time token for a session. */
export function VerifyLogin() {
  const [state, setState] = useState<"working" | "failed" | "network">("working");
  const started = useRef(false);

  useEffect(() => {
    // The token is single use, so guard against React running this effect twice in development.
    if (started.current) return;
    started.current = true;
    const token = new URLSearchParams(window.location.hash.slice(1)).get("token") ??
      new URLSearchParams(window.location.search).get("token"); // accept links issued before this change
    window.history.replaceState(window.history.state, "", window.location.pathname);
    void exchangeToken(token).then((result) => {
      if (result === "ok") window.location.replace("/portal");
      else setState(result);
    });
  }, []);

  return (
    <main className="portal-auth">
      <div className="portal-auth__card" role="status">
        <p className="portal-eyebrow">Portal / Sign in</p>
        {state === "working" ? (
          <>
            <h1>Signing you in…</h1>
            <p>One moment.</p>
          </>
        ) : (
          <>
            <h1>{state === "network" ? "We could not reach the server." : "This link no longer works."}</h1>
            <p>
              {state === "network"
                ? "Check your connection and open the link again."
                : "Sign-in links work once and expire after 15 minutes. Request a new one to continue."}
            </p>
            <Link className="button button--primary" href="/login">
              <span>Back to sign in</span>
            </Link>
          </>
        )}
      </div>
    </main>
  );
}
