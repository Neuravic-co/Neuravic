"use client";

import { useEffect } from "react";

export function ScrollEffects() {
  useEffect(() => {
    document.documentElement.classList.add("js");

    const revealNodes = Array.from(
      document.querySelectorAll<HTMLElement>("[data-reveal]"),
    );
    const revealObserver = new IntersectionObserver(
      (entries, observer) => {
        entries.forEach((entry) => {
          if (!entry.isIntersecting) return;
          entry.target.classList.add("is-visible");
          observer.unobserve(entry.target);
        });
      },
      { rootMargin: "0px 0px -8%", threshold: 0.08 },
    );

    revealNodes.forEach((node) => revealObserver.observe(node));

    const hero = document.querySelector<HTMLElement>(".hero");
    let frame = 0;

    // Pause the hero's looping light animation while the hero is scrolled out of view.
    const heroObserver = new IntersectionObserver(([entry]) => {
      hero?.classList.toggle("is-offscreen", !entry?.isIntersecting);
    });
    if (hero) heroObserver.observe(hero);

    const handlePointerMove = (event: PointerEvent) => {
      if (!hero || window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
        return;
      }
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const x = (event.clientX / window.innerWidth - 0.5) * 10;
        const y = (event.clientY / window.innerHeight - 0.5) * 8;
        hero.style.setProperty("--hero-x", `${x}px`);
        hero.style.setProperty("--hero-y", `${y}px`);
      });
    };

    window.addEventListener("pointermove", handlePointerMove, { passive: true });

    return () => {
      document.documentElement.classList.remove("js");
      revealObserver.disconnect();
      heroObserver.disconnect();
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", handlePointerMove);
    };
  }, []);

  return null;
}
