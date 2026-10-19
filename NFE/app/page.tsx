import { ArrowRight, ArrowUpRight, BrainCircuit, CodeXml, PenTool, ShieldCheck } from "lucide-react";
import Image from "next/image";
import Link from "next/link";
import { ContactForm } from "@/components/contact-form";
import { HeroArt } from "@/components/hero-art";
import { ScrollEffects } from "@/components/scroll-effects";
import { SiteHeader } from "@/components/site-header";
import { getSiteContent } from "@/lib/site-content";

const SERVICE_ICONS = [BrainCircuit, CodeXml, PenTool, ShieldCheck];

function ArrowLink({ children, href }: { children: React.ReactNode; href: string }) {
  return (
    <a className="text-link" href={href}>
      <span>{children}</span>
      <ArrowUpRight aria-hidden="true" size={15} strokeWidth={1.5} />
    </a>
  );
}

function ProjectVisual({ number, name }: { number: string; name: string }) {
  return (
    <figure className="project-visual" data-reveal>
      <div className="project-visual__meta">
        <span>Project visual / {number}</span>
        <span>Original asset reserved</span>
      </div>
      <div className="project-visual__center" aria-hidden="true">
        <span />
      </div>
      <figcaption>{name} / Image slot</figcaption>
    </figure>
  );
}

export default async function Home() {
  const { services, projects, process: processSteps, team, company } = await getSiteContent();

  return (
    <>
      <ScrollEffects />
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <SiteHeader />

      <main id="main-content">
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

              <h1 data-reveal>{company.headline}</h1>

              <p className="hero__intro" data-reveal>
                From discovery and design to engineering, deployment and support—one
                team building systems people can actually run.
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

        <section className="services section-light" id="services" data-nav-section>
          <div className="page-shell">
            <div className="section-heading services__heading">
              <div data-reveal>
                <p className="eyebrow">Services / What we build</p>
                <h2>One team, from problem to production.</h2>
              </div>
              <p className="section-lede" data-reveal>
                Neuravic combines AI, software, product design and deployment into one
                delivery system—turning difficult operational problems into systems
                people can actually run.
              </p>
            </div>

            <div className="service-grid">
              {services.map((service, index) => {
                const Icon = SERVICE_ICONS[index % SERVICE_ICONS.length];
                return (
                  <article className="service-card" data-reveal key={service.number}>
                    <span className="service-card__number">{service.number}</span>
                    <Icon
                      className="service-card__icon"
                      aria-hidden="true"
                      size={40}
                      strokeWidth={1.25}
                    />
                    <h3>{service.title}</h3>
                    <p>{service.description}</p>
                    <a className="service-card__link" href="#contact">
                      <span>Discuss this</span>
                      <ArrowUpRight aria-hidden="true" size={14} strokeWidth={1.5} />
                    </a>
                  </article>
                );
              })}
            </div>

            <div className="services__cta" data-reveal>
              <a className="button button--primary" href="#contact">
                <span>Start a project</span>
                <ArrowRight aria-hidden="true" size={18} strokeWidth={1.5} />
              </a>
            </div>
          </div>
        </section>

        <section className="work-intro section-dark" id="work">
          <div className="page-shell work-intro__grid">
            <p className="eyebrow" data-reveal>
              Selected systems / 01—02
            </p>
            <h2 data-reveal>
              Operational systems.
              <br />
              Built to be used.
            </h2>
            <p className="section-lede" data-reveal>
              Focused products for real workflows—designed, engineered and carried into
              daily operation by one accountable team.
            </p>
          </div>
        </section>

        {projects.map((project) => (
          <section
            className={`project project--${project.surface}`}
            id={`project-${project.number}`}
            key={project.number}
          >
            <div className="page-shell">
              <div className="project__heading">
                <div data-reveal>
                  <p className="eyebrow">Selected systems / {project.number}</p>
                  <p className="project__eyebrow">{project.eyebrow}</p>
                </div>
                <div className="project__copy" data-reveal>
                  <p className="project__name">{project.name}</p>
                  <h2>{project.title}</h2>
                  <p>{project.description}</p>
                  <ArrowLink href="#contact">View system</ArrowLink>
                </div>
              </div>
              <ProjectVisual number={project.number} name={project.name} />
            </div>
          </section>
        ))}

        <section className="process section-light" id="process">
          <div className="page-shell">
            <div className="section-heading process__heading">
              <div data-reveal>
                <p className="eyebrow">Process / How we work</p>
                <h2>From ambiguity to operation.</h2>
              </div>
              <p className="section-lede" data-reveal>
                Discovery, product design, engineering and deployment move as one
                system—so nothing gets lost between teams.
              </p>
            </div>

            <div className="process-list">
              {processSteps.map((step) => (
                <article className="process-step" data-reveal key={step.number}>
                  <span>{step.number}</span>
                  <h3>{step.title}</h3>
                  <p>{step.description}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section className="about section-dark" id="about" data-nav-section>
          <Image
            className="about__pattern"
            src="/assets/neuravic-pattern.svg"
            alt=""
            aria-hidden="true"
            width={1080}
            height={700}
            unoptimized
          />
          <div className="page-shell about__inner">
            <div className="about__copy" data-reveal>
              <p className="eyebrow">About / Neuravic</p>
              <h2>Different disciplines. One accountable team.</h2>
              <p>{company.about}</p>
              <ArrowLink href="#team">About Neuravic</ArrowLink>
            </div>

            <div className="about__locations" data-reveal>
              {company.locations.map((location, index) => (
                <div key={location.city}>
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <p>
                    {location.city} / {location.country}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="team section-light" id="team">
          <div className="page-shell">
            <div className="section-heading team__heading">
              <div data-reveal>
                <p className="eyebrow">People / The team</p>
                <h2>Three people. One accountable team.</h2>
              </div>
              <p className="section-lede" data-reveal>
                Two cities, one delivery system. Strategy, design, AI, engineering and
                operations stay connected from the first decision to deployment.
              </p>
            </div>

            <div className="team-grid">
              {team.map((person) => (
                <article className="team-card" data-reveal key={person.number}>
                  <div className="team-card__portrait">
                    <div>
                      <span>Portrait / {person.number}</span>
                      <span>Original asset reserved</span>
                    </div>
                  </div>
                  <div className="team-card__meta">
                    <div>
                      <p>{person.label}</p>
                      <span>{person.city}</span>
                    </div>
                    <span>{person.number}</span>
                  </div>
                </article>
              ))}
            </div>

            <div className="team__footer" data-reveal>
              <span>Distributed by design</span>
              <ArrowUpRight aria-hidden="true" size={15} strokeWidth={1.5} />
            </div>
          </div>
        </section>

        <section className="contact section-dark" id="contact" data-nav-section>
          <div className="page-shell contact__inner">
            <div data-reveal>
              <p className="eyebrow">Contact / Start a project</p>
              <h2>Bring us the difficult part.</h2>
            </div>
            <div className="contact__copy" data-reveal>
              <p>
                Tell us where the operation breaks down. We’ll help define the right
                system—and take it through design, engineering, deployment and support.
              </p>
              <ContactForm fallbackEmail={company.contactEmail} />
            </div>
          </div>

          <footer className="footer">
            <div className="page-shell footer__top">
              <div className="footer__brand">
                <Image
                  src="/assets/neuravic-logo.png"
                  alt="Neuravic"
                  width={617}
                  height={120}
                  unoptimized
                />
                <p>AI systems · Software · Product design · Operations</p>
              </div>

              <nav aria-label="Footer navigation">
                <a href="#home">Home</a>
                <a href="#services">Services</a>
                <a href="#work">Work</a>
                <a href="#about">About us</a>
                <a href="#contact">Contact us</a>
              </nav>

              <div className="footer__places">
                {company.locations.map((location) => (
                  <span key={location.city}>{location.city}</span>
                ))}
              </div>
            </div>

            <div className="page-shell footer__legal">
              <p>
                All rights reserved. Neuravic and its logo are trademarks of Neuravic.
              </p>
              <nav aria-label="Legal">
                <Link href="/legal/privacy">Privacy</Link>
                <Link href="/legal/terms">Terms</Link>
                <Link href="/legal/cookies">Cookies</Link>
                <Link href="/legal/license">Licence</Link>
              </nav>
            </div>

            <div className="page-shell footer__bottom">
              <span>© 2026 Neuravic</span>
              <a href="#home">Back to top ↑</a>
            </div>
          </footer>
        </section>
      </main>
    </>
  );
}
