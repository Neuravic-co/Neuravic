"use client";

import Image from "next/image";
import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LEGAL_DOCUMENTS, type LegalDocument } from "@/lib/legal-content";

const TAB_LABELS: Record<string, string> = {
  privacy: "Privacy",
  terms: "Terms",
  cookies: "Cookies",
  license: "Licence",
};

/** A classic footer: brand, company links, legal links (popups), contact details and the copyright line; each tab opens its document in a popup. */
export function SiteFooter({
  contactEmail,
  locations,
}: {
  contactEmail: string;
  locations: { city: string; country: string }[];
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [active, setActive] = useState<LegalDocument | null>(null);

  const open = useCallback((doc: LegalDocument) => {
    setActive(doc);
    const dialog = dialogRef.current;
    if (dialog && !dialog.open) dialog.showModal();
    bodyRef.current?.scrollTo({ top: 0 });
  }, []);

  const close = useCallback(() => dialogRef.current?.close(), []);

  // Lock page scrolling while the popup is open.
  useEffect(() => {
    document.documentElement.classList.toggle("has-popup", active !== null);
    return () => document.documentElement.classList.remove("has-popup");
  }, [active]);

  return (
    <footer className="site-footer">
      <div className="page-shell site-footer__grid">
        <div className="site-footer__brand">
          <Image
            src="/assets/neuravic-logo.png"
            alt="Neuravic"
            width={617}
            height={120}
            unoptimized
          />
          <p>
            Intelligent systems for complex operations. AI, software, design and deployment
            from one team.
          </p>
        </div>

        <nav className="site-footer__col" aria-label="Company">
          <h2>Company</h2>
          <a href="#home">Home</a>
          <a href="#services">Services</a>
          <a href="#about">About us</a>
          <a href="#contact">Contact us</a>
        </nav>

        <nav className="site-footer__col" aria-label="Legal">
          <h2>Legal</h2>
          {LEGAL_DOCUMENTS.map((doc) => (
            <button
              type="button"
              key={doc.slug}
              aria-haspopup="dialog"
              onClick={() => open(doc)}
            >
              {TAB_LABELS[doc.slug] ?? doc.title}
            </button>
          ))}
        </nav>

        <div className="site-footer__col">
          <h2>Contact</h2>
          <a href={`mailto:${contactEmail}`}>{contactEmail}</a>
          {locations.map((location) => (
            <span key={location.city}>
              {location.city} · {location.country}
            </span>
          ))}
        </div>
      </div>

      <div className="page-shell site-footer__bar">
        <p>© 2026 Neuravic. All rights reserved.</p>
        <a href="#home">Back to top ↑</a>
      </div>

      <dialog
        ref={dialogRef}
        className="legal-popup"
        aria-labelledby="legal-popup-title"
        onClose={() => setActive(null)}
        onClick={(event) => {
          // A click on the backdrop lands on the dialog element itself.
          if (event.target === dialogRef.current) close();
        }}
      >
        {active ? (
          <div className="legal-popup__card">
            <header className="legal-popup__head">
              <div>
                <p>Legal · Updated {active.updated}</p>
                <h2 id="legal-popup-title">{active.title}</h2>
              </div>
              <button type="button" className="legal-popup__close" onClick={close} aria-label="Close">
                <X aria-hidden="true" size={18} strokeWidth={1.5} />
              </button>
            </header>

            <div className="legal-popup__body" ref={bodyRef}>
              <p>{active.summary}</p>
              {active.sections.map((section, index) => (
                <section key={section.heading}>
                  <h3>
                    <span>{String(index + 1).padStart(2, "0")}</span>
                    {section.heading}
                  </h3>
                  {section.body.map((paragraph) => (
                    <p key={paragraph}>{paragraph}</p>
                  ))}
                </section>
              ))}
            </div>

            <footer className="legal-popup__foot">
              <span>Questions? {contactEmail}</span>
              <span>Esc to close</span>
            </footer>
          </div>
        ) : null}
      </dialog>
    </footer>
  );
}
