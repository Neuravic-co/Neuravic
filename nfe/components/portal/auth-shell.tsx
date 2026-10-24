import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";
import { BrandMark } from "../brand-mark";

const POINTS = ["AI systems and software", "Product design", "Operations that run"];

/** Split layout for login and sign-up: the brand on the left, a clean white form on the right. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-split" id="portal-content">
      <div className="auth-brand">
        <Link className="auth-brand__logo" href="/" aria-label="Neuravic home">
          <Image src="/assets/neuravic-logo.png" alt="Neuravic" width={617} height={120} unoptimized priority />
        </Link>

        <BrandMark className="auth-brand__art" id="auth-glass" />

        <div className="auth-brand__copy">
          <p className="auth-brand__headline">Intelligent systems for complex operations.</p>
          <ul>
            {POINTS.map((point) => (
              <li key={point}>{point}</li>
            ))}
          </ul>
          <p className="auth-brand__places">Dubai / Cairo</p>
        </div>
      </div>

      <div className="auth-panel">{children}</div>
    </main>
  );
}
