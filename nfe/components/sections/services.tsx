import { ArrowRight, BrainCircuit, CodeXml, PenTool, ShieldCheck } from "lucide-react";
import type { Feature } from "@/lib/site-content";
import { FeatureGrid } from "./feature-grid";

const ICONS = [BrainCircuit, CodeXml, PenTool, ShieldCheck];

export function Services({ services }: { services: Feature[] }) {
  return (
    <section className="services section-light" id="services" data-nav-section>
      <div className="page-shell">
        <div className="section-heading services__heading">
          <div data-reveal>
            <p className="eyebrow">Services / What we build</p>
            <h2>We build it, start to finish.</h2>
          </div>
          <p className="section-lede" data-reveal>
            AI, software and design in one team. We take hard problems and build tools people use every day.
          </p>
        </div>

        <FeatureGrid items={services} icons={ICONS} linkLabel="Discuss this" />

        <div className="services__cta" data-reveal>
          <a className="button button--primary" href="#contact">
            <span>Start a project</span>
            <ArrowRight aria-hidden="true" size={18} strokeWidth={1.5} />
          </a>
        </div>
      </div>
    </section>
  );
}
