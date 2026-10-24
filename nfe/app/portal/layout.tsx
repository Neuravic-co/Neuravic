import type { Metadata } from "next";
import "./portal.css";

export const metadata: Metadata = {
  title: "Portal — Neuravic",
  description: "The Neuravic client portal is under construction.",
  robots: { index: false, follow: false },
};

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return children;
}
