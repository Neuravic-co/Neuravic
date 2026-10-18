import { ArrowUpRight, Construction } from "lucide-react";
import Link from "next/link";
import { DEFAULT_CONTENT } from "@/lib/site-content";

const CONTACT_EMAIL = DEFAULT_CONTENT.company.contactEmail;

/** Shown instead of the client portal until it opens. */
export function UnderConstruction() {
  return (
    <main className="construction">
      <div className="construction__backdrop" aria-hidden="true">
        <span className="construction__glow construction__glow--one" />
        <span className="construction__glow construction__glow--two" />
        <span className="construction__grid" />
        <span className="construction__ring construction__ring--one" />
        <span className="construction__ring construction__ring--two" />
        <span className="construction__ring construction__ring--three" />
      </div>

      <div className="construction__content">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img className="construction__logo" src="/assets/neuravic-logo.png" alt="Neuravic" width={150} height={28} />

        <div className="construction__icon" aria-hidden="true">
          <Construction size={44} strokeWidth={1.25} />
        </div>

        <p className="construction__eyebrow">Client portal</p>
        <h1>Under construction</h1>
        <p className="construction__lede">
          We are building a secure place for you to follow projects, approve requests and talk to the team. It opens
          soon.
        </p>

        <div className="construction__status" role="status">
          <span className="construction__pulse" aria-hidden="true" />
          Launching soon
        </div>

        <div className="construction__actions">
          <Link className="button button--primary button--large" href="/">
            <span>Back to neuravic.com</span>
            <ArrowUpRight aria-hidden="true" size={18} strokeWidth={1.5} />
          </Link>
          <a className="construction__mail" href={`mailto:${CONTACT_EMAIL}?subject=Client%20portal`}>
            Need access sooner? {CONTACT_EMAIL}
          </a>
        </div>
      </div>
    </main>
  );
}
