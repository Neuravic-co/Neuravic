import type { Metadata } from "next";
import "../portal/portal.css";
import "../portal/auth.css";

export const metadata: Metadata = { robots: { index: false, follow: true } };

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return children;
}
