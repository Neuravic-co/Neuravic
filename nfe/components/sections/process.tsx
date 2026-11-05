import { Cpu, PencilRuler, Rocket, Search } from "lucide-react";
import type { Feature } from "@/lib/site-content";
import { FeatureGrid } from "./feature-grid";

const ICONS = [Search, PencilRuler, Cpu, Rocket];

export function Process({ steps }: { steps: Feature[] }) {
  return (
    <section className="process section-light" id="process">
      <div className="page-shell">
        <div className="section-heading services__heading" data-reveal>
          <div>
            <p className="eyebrow">Process / How we work</p>
            <h2>From idea to live.</h2>
          </div>
          <p className="section-lede">
            Discovery, design, engineering and launch happen as one flow, so nothing gets lost between teams.
          </p>
        </div>

        <FeatureGrid items={steps} icons={ICONS} />
      </div>
    </section>
  );
}
