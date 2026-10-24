"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import type { Me } from "@/lib/portal";
import { SECTION_META, WORKSPACE_SECTION_IDS } from "@/lib/workspace";
import { useSession } from "./session";

const NAV = [
  { href: "/portal", label: "Home" },
  ...WORKSPACE_SECTION_IDS.map((id) => ({ href: `/portal/${id}`, label: SECTION_META[id].label })),
];

/** The staff workspace chrome: top bar with a menu to jump between sections, then the page inside <main>. */
export function WorkspaceFrame({
  me,
  preview,
  home = false,
  bleed = home,
  children,
}: {
  me: Me;
  preview: boolean;
  /** The home page: it draws its own welcome band, so the plain preview banner is not shown. */
  home?: boolean;
  /** Let the page's header band run edge to edge. */
  bleed?: boolean;
  children: ReactNode;
}) {
  const pathname = usePathname();
  const isActive = (href: string) => (href === "/portal" ? pathname === "/portal" : pathname === href);

  return (
    <div className="portal-shell ws">
      <header className="portal-topbar">
        <Link className="portal-topbar__brand" href="/" aria-label="Neuravic home">
          <Image src="/assets/neuravic-logo.png" alt="Neuravic" width={617} height={120} unoptimized priority />
        </Link>
        <nav className="ws-topnav" aria-label="Workspace menu">
          {NAV.map((item) => (
            <Link key={item.href} href={item.href} aria-current={isActive(item.href) ? "page" : undefined}>
              {item.label}
            </Link>
          ))}
        </nav>
        <div className="portal-topbar__spacer" />
        {preview ? <span className="ws-badge">Preview</span> : null}
        <span className="portal-topbar__user" title={me.user.email}>
          {me.user.name ?? me.user.email}
        </span>
        {preview ? null : <SignOut />}
        {preview ? null : (
          <Link className="portal-link" href="/portal/privacy">
            Privacy
          </Link>
        )}
      </header>

      <main className={bleed ? "ws-main ws-main--home" : "ws-main"} id="portal-content">
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
