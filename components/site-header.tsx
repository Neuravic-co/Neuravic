"use client";

import { useEffect, useState } from "react";
import Image from "next/image";

const navItems = [
  { label: "Home", href: "#home", section: "home", type: "link" },
  { label: "Services", href: "#services", section: "services", type: "link" },
  { label: "Portal", section: "portal", type: "portal" },
  { label: "About us", href: "#about", section: "about", type: "link" },
  { label: "Contact us", href: "#contact", section: "contact", type: "link" },
] as const;

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState("home");
  const [portalNotice, setPortalNotice] = useState(false);

  useEffect(() => {
    const handleScroll = () => setScrolled(window.scrollY > 24);
    handleScroll();
    window.addEventListener("scroll", handleScroll, { passive: true });
    return () => window.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>("[data-nav-section]"),
    );
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        if (visible?.target.id) setActiveSection(visible.target.id);
      },
      { rootMargin: "-35% 0px -55%", threshold: [0, 0.1, 0.35] },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    document.body.classList.toggle("menu-is-open", menuOpen);
    return () => document.body.classList.remove("menu-is-open");
  }, [menuOpen]);

  useEffect(() => {
    if (!portalNotice) return;
    const timeout = window.setTimeout(() => setPortalNotice(false), 3600);
    return () => window.clearTimeout(timeout);
  }, [portalNotice]);

  const closeMenu = () => setMenuOpen(false);

  return (
    <>
      <header className={`site-header${scrolled ? " is-scrolled" : ""}`}>
        <div className="page-shell site-header__inner">
          <a className="site-header__brand" href="#home" onClick={closeMenu}>
            <Image
              src="/assets/neuravic-logo.png"
              alt="Neuravic home"
              width={617}
              height={120}
              priority
              unoptimized
            />
          </a>

          <nav className="desktop-nav" aria-label="Primary navigation">
            {navItems.map((item) =>
              item.type === "portal" ? (
                <button
                  className="desktop-nav__portal"
                  type="button"
                  onClick={() => setPortalNotice(true)}
                  aria-describedby="portal-status"
                  key={item.section}
                >
                  {item.label}
                </button>
              ) : (
                <a
                  className={activeSection === item.section ? "is-active" : ""}
                  href={item.href}
                  key={item.section}
                >
                  {item.label}
                </a>
              ),
            )}
          </nav>

          <div
            className="site-header__presence"
            aria-label="Neuravic operates from Dubai and Cairo"
          >
            <span className="site-header__presence-dot" aria-hidden="true" />
            <span>Dubai · Cairo</span>
          </div>

          <button
            className={`menu-toggle${menuOpen ? " is-open" : ""}`}
            type="button"
            aria-expanded={menuOpen}
            aria-controls="mobile-navigation"
            aria-label={menuOpen ? "Close navigation" : "Open navigation"}
            onClick={() => setMenuOpen((value) => !value)}
          >
            <span />
            <span />
          </button>
        </div>

        <div
          className={`mobile-nav${menuOpen ? " is-open" : ""}`}
          id="mobile-navigation"
          aria-hidden={!menuOpen}
        >
          <nav aria-label="Mobile navigation">
            {navItems.map((item, index) =>
              item.type === "portal" ? (
                <button
                  type="button"
                  onClick={() => {
                    setMenuOpen(false);
                    setPortalNotice(true);
                  }}
                  key={item.section}
                >
                  <span>0{index + 1}</span>
                  {item.label}
                </button>
              ) : (
                <a href={item.href} onClick={closeMenu} key={item.section}>
                  <span>0{index + 1}</span>
                  {item.label}
                </a>
              ),
            )}
          </nav>
          <p>Dubai / Cairo</p>
        </div>
      </header>

      <div
        className={`portal-toast${portalNotice ? " is-visible" : ""}`}
        id="portal-status"
        role="status"
        aria-live="polite"
      >
        <span>Portal access</span>
        <p>Ready to connect when you provide the final URL.</p>
      </div>
    </>
  );
}
