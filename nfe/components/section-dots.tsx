"use client";

import { useEffect, useState } from "react";

const SECTIONS = [
  { id: "home", label: "Home" },
  { id: "services", label: "Services" },
  { id: "work", label: "Our work" },
  { id: "process", label: "Process" },
  { id: "about", label: "About us" },
  { id: "team", label: "Our team" },
  { id: "contact", label: "Contact us" },
] as const;

/** A dot rail on the right edge: one dot per section, the current one is a pill. */
export function SectionDots() {
  const [active, setActive] = useState<string>(SECTIONS[0].id);
  const [overFooter, setOverFooter] = useState(false);

  useEffect(() => {
    const nodes = SECTIONS.map(({ id }) => document.getElementById(id)).filter(
      (node): node is HTMLElement => node !== null,
    );
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActive(visible.target.id);
      },
      { rootMargin: "-40% 0px -40%", threshold: [0, 0.1, 0.5] },
    );
    nodes.forEach((node) => observer.observe(node));

    // The footer is not a section: tuck the rail away so it never sits on top of the footer text.
    const footer = document.querySelector(".site-footer");
    const footerObserver = new IntersectionObserver(([entry]) =>
      setOverFooter(Boolean(entry?.isIntersecting)),
    );
    if (footer) footerObserver.observe(footer);

    return () => {
      observer.disconnect();
      footerObserver.disconnect();
    };
  }, []);

  return (
    <nav className={`section-dots${overFooter ? " is-hidden" : ""}`} aria-label="Page sections">
      {SECTIONS.map(({ id, label }) => (
        <a
          key={id}
          href={`#${id}`}
          className={active === id ? "is-active" : ""}
          aria-label={label}
          aria-current={active === id ? "true" : undefined}
        >
          <i aria-hidden="true" />
        </a>
      ))}
    </nav>
  );
}
