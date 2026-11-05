"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import type { ReactNode } from "react";

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
        } catch {}
      }}
    >
      {children}
    </Link>
  );
}
