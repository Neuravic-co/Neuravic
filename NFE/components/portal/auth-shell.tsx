import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/** The Neuravic mark as five pieces on a 256 grid, drawn as glowing glass like the main page. */
const PIECES = [
  "128,0 64,64 128,128",
  "256,0 192,64 256,128",
  "128,128 192,128 192,192",
  "64,128 128,128 128,192 64,256 64,192 0,192",
  "256,128 192,192 256,256",
];

const POINTS = ["AI systems and software", "Product design", "Operations that run"];

/** Split layout for login and sign-up: the brand on the left, a clean white form on the right. */
export function AuthShell({ children }: { children: ReactNode }) {
  return (
    <main className="auth-split" id="portal-content">
      <div className="auth-brand">
        <Link className="auth-brand__logo" href="/" aria-label="Neuravic home">
          <Image src="/assets/neuravic-logo.png" alt="Neuravic" width={617} height={120} unoptimized priority />
        </Link>

        <svg className="auth-brand__art" viewBox="-24 -24 304 304" aria-hidden="true" focusable="false">
          <defs>
            <linearGradient id="auth-glass" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" stopColor="#1b2540" />
              <stop offset="1" stopColor="#0b1020" />
            </linearGradient>
          </defs>
          {PIECES.map((points) => (
            <polygon key={points} points={points} fill="url(#auth-glass)" stroke="#6f8bff" strokeWidth="2" strokeLinejoin="round" />
          ))}
        </svg>

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
