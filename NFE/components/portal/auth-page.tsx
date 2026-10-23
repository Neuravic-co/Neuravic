"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { api } from "@/lib/api";
import { AuthForm, type AuthMode } from "./auth-form";

/** The full /login and /signup pages. Someone who is already signed in goes straight to the portal. */
export function AuthPage({ mode }: { mode: AuthMode }) {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    api("/me")
      .then(() => !cancelled && router.replace("/portal"))
      .catch(() => undefined); // signed out, or the API is unreachable: the form is the right thing to show
    return () => {
      cancelled = true;
    };
  }, [router]);

  return (
    <main className="portal-auth portal-auth--page" id="portal-content">
      <AuthForm mode={mode} />
    </main>
  );
}
