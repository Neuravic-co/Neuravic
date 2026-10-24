"use client";

import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { ApiError, api } from "@/lib/api";
import type { Me } from "@/lib/portal";

type SessionState =
  | { status: "loading" }
  /** `expired` is true when a signed-in session ended, so the sign-in screen can say so. */
  | { status: "anonymous"; expired: boolean }
  | { status: "unavailable" }
  | { status: "mfa" }
  | { status: "ready"; me: Me };

interface SessionContextValue {
  state: SessionState;
  /** Reload the signed-in user. */
  refresh: () => Promise<void>;
  /** Called when any request returns 401. */
  expire: () => void;
  signOut: () => Promise<void>;
}

const SessionContext = createContext<SessionContextValue | null>(null);

async function loadSession(): Promise<SessionState> {
  try {
    return { status: "ready", me: await api<Me>("/me") };
  } catch (error) {
    if (error instanceof ApiError && error.status === 401) return { status: "anonymous", expired: false };
    if (error instanceof ApiError && error.code === "mfa_required") return { status: "mfa" };
    return { status: "unavailable" };
  }
}

export function SessionProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<SessionState>({ status: "loading" });

  useEffect(() => {
    let cancelled = false;
    void loadSession().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const refresh = useCallback(async () => {
    setState({ status: "loading" });
    setState(await loadSession());
  }, []);

  const expire = useCallback(() => setState((current) => (current.status === "ready" ? { status: "anonymous", expired: true } : current)), []);

  const signOut = useCallback(async () => {
    try {
      await api("/auth/logout", { method: "POST" });
    } finally {
      setState({ status: "anonymous", expired: false });
    }
  }, []);

  const value = useMemo(() => ({ state, refresh, expire, signOut }), [state, refresh, expire, signOut]);
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}

export function useSession() {
  const value = useContext(SessionContext);
  if (!value) throw new Error("useSession must be used inside SessionProvider");
  return value;
}

/** The signed-in user. Only call below a screen that renders when the session is ready. */
export function useMe(): Me {
  const { state } = useSession();
  if (state.status !== "ready") throw new Error("useMe requires a signed-in session");
  return state.me;
}
