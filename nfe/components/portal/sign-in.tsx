"use client";

import { AuthForm } from "./auth-form";
import { AuthShell } from "./auth-shell";

/** Shown inside the portal when there is no session. */
export function SignIn({ notice }: { notice?: string }) {
  return (
    <AuthShell>
      <AuthForm mode="login" notice={notice} />
    </AuthShell>
  );
}
