"use client";

import type { ReactNode } from "react";
import { PORTAL_OPEN } from "@/lib/portal-gate";
import { SessionProvider } from "./session";

/** One session for every /portal page, so moving between sections does not sign in again. */
export function PortalProviders({ children }: { children: ReactNode }) {
  return PORTAL_OPEN ? <SessionProvider>{children}</SessionProvider> : children;
}
