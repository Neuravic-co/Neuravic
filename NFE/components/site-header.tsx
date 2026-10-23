"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { UserRound } from "lucide-react";
import { ProfileMenu } from "./profile-menu";

const navItems = [
  { label: "Home", href: "#home", section: "home" },
  { label: "Services", href: "#services", section: "services" },
  { label: "About us", href: "#about", section: "about" },
  { label: "Contact us", href: "#contact", section: "contact" },
] as const;

const portalHref = "/portal";

export function SiteHeader() {
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeSection, setActiveSection] = useState("home");

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
            {navItems.map((item) => (
              <a
                className={activeSection === item.section ? "is-active" : ""}
                href={item.href}
                key={item.section}
              >
                {item.label}
              </a>
            ))}
          </nav>

          <div className="site-header__aside">
            <a className="site-header__portal" href={portalHref}>
              Portal
            </a>
            <ProfileMenu />
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
          <div>
            <nav aria-label="Mobile navigation">
              {navItems.map((item, index) => (
                <a href={item.href} onClick={closeMenu} key={item.section}>
                  <span>0{index + 1}</span>
                  {item.label}
                </a>
              ))}
            </nav>
            <a className="mobile-nav__portal" href={portalHref}>
              <UserRound aria-hidden="true" size={18} strokeWidth={1.5} />
              Sign in / Portal
            </a>
          </div>
          <p>Dubai / Cairo</p>
        </div>
      </header>
    </>
  );
}
