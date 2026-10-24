"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

/**
 * A back link that returns to the page the visitor came from on this site, so they land where they were
 * (scroll position included). With no earlier page on the site, or when they came from another legal page,
 * it goes to `fallback`, so it always works, even from a bookmark or a link shared with someone else.
 */
export function BackLink({ fallback = "/", className, children }: { fallback?: string; className?: string; children: ReactNode }) {
  const router = useRouter();
  return (
    <Link
      href={fallback}
      className={className}
      onClick={(event) => {
        try {
          const from = document.referrer ? new URL(document.referrer) : null;
          const sameSite = from?.origin === window.location.origin && !from.pathname.startsWith("/legal/");
          if (sameSite && window.history.length > 1) {
            event.preventDefault();
            router.back();
          }
        } catch {
          /* an unreadable referrer just means the normal link is used */
        }
      }}
    >
      {children}
    </Link>
  );
}
