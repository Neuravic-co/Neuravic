"use client";

import { X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { LEGAL_DOCUMENTS, type LegalDocument } from "@/lib/legal-content";

const TAB_LABELS: Record<string, string> = {
  privacy: "Privacy",
  terms: "Terms",
  cookies: "Cookies",
  license: "Licence",
};

/** A faded gradient wordmark, four legal tabs and the copyright line; each tab opens its document in a popup. */
export function SiteFooter({ contactEmail }: { contactEmail: string }) {
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
      <span className="site-footer__word" aria-hidden="true">
        NEURAVIC
      </span>

      <nav className="site-footer__tabs" aria-label="Legal">
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

      <p className="site-footer__copy">© 2026 Neuravic</p>

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
