import type { Metadata } from "next";
import { AuthPage } from "@/components/portal/auth-page";

export const metadata: Metadata = {
  title: "Log in — Neuravic",
  description: "Log in to your Neuravic account with a one-time email link.",
};

export default function LoginPage() {
  return <AuthPage mode="login" />;
}
