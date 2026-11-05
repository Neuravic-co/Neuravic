import { ArrowRight } from "lucide-react";
import { HeroArt } from "@/components/hero-art";

export function Hero({ headline }: { headline: string }) {
  return (
    <section className="hero section-dark" id="home" data-nav-section>
      <div className="hero__art">
        <HeroArt />
      </div>
      <div className="hero__veil" aria-hidden="true" />

      <div className="page-shell hero__inner">
        <div className="hero__copy">
          <div className="hero__tags" data-reveal>
            <span>AI systems</span>
            <span>Software</span>
            <span>Product design</span>
          </div>

          <h1 data-reveal>{headline}</h1>

          <p className="hero__intro" data-reveal>
            From discovery and design to engineering, deployment and support—one team building systems people can actually run.
          </p>

          <div className="hero__actions" data-reveal>
            <a className="button button--primary" href="#contact">
              <span>Start a Project</span>
              <ArrowRight aria-hidden="true" size={16} strokeWidth={1.5} />
            </a>
            <a className="button button--text" href="#services">
              <span>Explore Services</span>
            </a>
          </div>

          <div className="hero__locations" data-reveal>
            <span>Dubai</span>
            <span>Cairo</span>
          </div>
        </div>
      </div>

      <a className="hero__scroll" href="#services" aria-label="Scroll to services">
        <i aria-hidden="true" />
      </a>
    </section>
  );
}
