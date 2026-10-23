"use client";

import { AuthForm } from "./auth-form";

/** Shown inside the portal when there is no session. */
export function SignIn({ notice }: { notice?: string }) {
  return (
    <main className="portal-auth">
      <AuthForm mode="login" notice={notice} />
    </main>
  );
}
