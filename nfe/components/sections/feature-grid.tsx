import { ArrowUpRight, type LucideIcon } from "lucide-react";
import type { Feature } from "@/lib/site-content";

export function FeatureGrid({ items, icons, linkLabel }: { items: Feature[]; icons: LucideIcon[]; linkLabel?: string }) {
  return (
    <div className="service-grid">
      {items.map((item, index) => {
        const Icon = icons[index % icons.length]!;
        return (
          <article className="service-card" data-reveal key={item.number}>
            <span className="service-card__number">{item.number}</span>
            <Icon className="service-card__icon" aria-hidden="true" size={40} strokeWidth={1.25} />
            <h3>{item.title}</h3>
            <p>{item.description}</p>
            {linkLabel ? (
              <a className="service-card__link" href="#contact">
                <span>{linkLabel}</span>
                <ArrowUpRight aria-hidden="true" size={14} strokeWidth={1.5} />
              </a>
            ) : null}
          </article>
        );
      })}
    </div>
  );
}
