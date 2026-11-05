import { ArrowRight } from "lucide-react";
import type { Company } from "@/lib/site-content";

export function About({ company }: { company: Company }) {
  return (
    <section className="about section-dark" id="about" data-nav-section>
      <div className="page-shell about__inner">
        <div className="about__copy" data-reveal>
          <p className="eyebrow">About us</p>
          <h2>
            Different skills.
            <br />
            One team.
          </h2>
          <p className="section-lede">{company.about}</p>
        </div>

        <div className="about__cities" data-reveal>
          {company.locations.map((location, index) => (
            <div className="about__city" key={location.city}>
              <span>{String(index + 1).padStart(2, "0")}</span>
              <div>
                <h3>{location.city}</h3>
                <p>{location.country}</p>
              </div>
              <i aria-hidden="true" />
            </div>
          ))}
        </div>

        <a className="button button--primary" href="#team">
          <span>Meet the team</span>
          <ArrowRight aria-hidden="true" size={18} strokeWidth={1.5} />
        </a>
      </div>
    </section>
  );
}
