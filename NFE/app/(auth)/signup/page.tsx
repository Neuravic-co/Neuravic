import type { Metadata } from "next";
import { AuthPage } from "@/components/portal/auth-page";

export const metadata: Metadata = {
  title: "Sign up — Neuravic",
  description: "Create a Neuravic account. We email you a one-time link, so there is no password to remember.",
};

export default function SignupPage() {
  return <AuthPage mode="signup" />;
}
