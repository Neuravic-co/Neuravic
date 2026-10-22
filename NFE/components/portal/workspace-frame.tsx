"use client";

import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import type { Me } from "@/lib/portal";
import { useSession } from "./session";

/** The staff workspace chrome: top bar, then the page inside <main>. With `preview` the account is sample data. */
export function WorkspaceFrame({ me, preview, children }: { me: Me; preview: boolean; children: ReactNode }) {
  return (
    <div className="portal-shell ws">
      <header className="portal-topbar">
        <Link className="portal-topbar__brand" href="/" aria-label="Neuravic home">
          <Image src="/assets/neuravic-logo.png" alt="Neuravic" width={617} height={120} unoptimized priority />
        </Link>
        <span className="portal-topbar__label">Workspace</span>
        <div className="portal-topbar__spacer" />
        {preview ? <span className="ws-badge">Preview</span> : null}
        <span className="portal-topbar__user" title={me.user.email}>
          {me.user.name ?? me.user.email}
        </span>
        {preview ? null : <SignOut />}
      </header>

      <main className="ws-main" id="portal-content">
        {preview ? <p className="ws-banner">This is a preview with sample details. Sign-in opens when the portal goes live.</p> : null}
        {children}
      </main>
    </div>
  );
}

function SignOut() {
  const { signOut } = useSession();
  return (
    <button type="button" className="portal-link" onClick={() => void signOut()}>
      Sign out
    </button>
  );
}
