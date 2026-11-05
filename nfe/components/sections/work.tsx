import { ArrowUpRight } from "lucide-react";
import { WorkVisual } from "@/components/work-visual";
import type { Project } from "@/lib/site-content";

export function Work({ projects }: { projects: Project[] }) {
  return (
    <section className="work section-dark" id="work">
      <div className="page-shell work__inner">
        <div className="work__copy" data-reveal>
          <p className="eyebrow">Our work</p>
          <h2>
            Systems built
            <br />
            to be used.
          </h2>
          <p className="section-lede">Focused products for real workflows, built and run by one team.</p>
        </div>

        <div className="work__grid">
          {projects.map((project) => (
            <article className="work-card" data-reveal key={project.number}>
              <WorkVisual kind={project.visual} />
              <div className="work-card__body">
                <span className="work-card__number">{project.number}</span>
                <h3>{project.name}</h3>
                <p>
                  {project.title} {project.description}
                </p>
                <a className="work-card__link" href="#contact">
                  <span>View system</span>
                  <ArrowUpRight aria-hidden="true" size={14} strokeWidth={1.5} />
                </a>
              </div>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}
