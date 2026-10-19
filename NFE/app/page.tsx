import {
  ArrowRight,
  ArrowUpRight,
  BrainCircuit,
  Cpu,
  CodeXml,
  PencilRuler,
  PenTool,
  Rocket,
  Search,
  ShieldCheck,
} from "lucide-react";
import { ContactForm } from "@/components/contact-form";
import { HeroArt } from "@/components/hero-art";
import { ScrollEffects } from "@/components/scroll-effects";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { getSiteContent } from "@/lib/site-content";

const SERVICE_ICONS = [BrainCircuit, CodeXml, PenTool, ShieldCheck];
const PROCESS_ICONS = [Search, PencilRuler, Cpu, Rocket];

const PROJECT_NAMES: Record<string, string> = {
  DARKAGENT: "DarkAgent",
  COOLACCESS_DXB: "CoolAccess DXB",
};

/** A drawn stand-in for a product screenshot: a network for the first project, access tiles for the second. */
function WorkVisual({ index }: { index: number }) {
  return (
    <div className="work-card__visual" aria-hidden="true">
      {index % 2 === 0 ? (
        <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice">
          <g className="work-lines">
            <path d="M60 150L140 70L220 115L310 50L350 125" />
            <path d="M60 150L220 115L350 125M140 70L310 50" opacity="0.4" />
          </g>
          <circle cx="60" cy="150" r="5" />
          <circle cx="140" cy="70" r="7" />
          <circle className="work-hub" cx="220" cy="115" r="10" />
          <circle cx="310" cy="50" r="6" />
          <circle cx="350" cy="125" r="5" />
        </svg>
      ) : (
        <svg viewBox="0 0 400 200" preserveAspectRatio="xMidYMid slice">
          <g className="work-lines">
            <rect x="60" y="40" width="120" height="55" rx="8" />
            <rect x="200" y="40" width="140" height="55" rx="8" />
            <rect x="60" y="112" width="180" height="55" rx="8" />
            <rect x="260" y="112" width="80" height="55" rx="8" />
            <path d="M95 67h60M235 67h80M95 139h120M295 139h30" opacity="0.5" />
          </g>
          <circle className="work-hub" cx="80" cy="67" r="5" />
          <circle className="work-hub" cx="220" cy="67" r="5" />
          <circle className="work-hub" cx="80" cy="139" r="5" />
          <circle className="work-hub" cx="280" cy="139" r="5" />
        </svg>
      )}
    </div>
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

      <main className="landing" id="main-content">
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
                <h2>We build it, start to finish.</h2>
              </div>
              <p className="section-lede" data-reveal>
                AI, software and design in one team. We take hard problems and build tools
                people use every day.
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

        <section className="work section-dark" id="work">
          <div className="page-shell work__inner">
            <div className="work__copy" data-reveal>
              <p className="eyebrow">Our work</p>
              <h2>
                Systems built
                <br />
                to be used.
              </h2>
              <p className="section-lede">
                Focused products for real workflows, built and run by one team.
              </p>
            </div>

            <div className="work__grid">
              {projects.map((project, index) => (
                <article className="work-card" data-reveal key={project.number}>
                  <WorkVisual index={index} />
                  <div className="work-card__body">
                    <span className="work-card__number">{project.number}</span>
                    <h3>{PROJECT_NAMES[project.name] ?? project.name}</h3>
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

        <section className="process section-light" id="process">
          <div className="page-shell">
            <div className="section-heading services__heading" data-reveal>
              <div>
                <p className="eyebrow">Process / How we work</p>
                <h2>From idea to live.</h2>
              </div>
              <p className="section-lede">
                Discovery, design, engineering and launch happen as one flow, so nothing gets
                lost between teams.
              </p>
            </div>

            <div className="service-grid">
              {processSteps.map((step, index) => {
                const Icon = PROCESS_ICONS[index % PROCESS_ICONS.length];
                return (
                  <article className="service-card" data-reveal key={step.number}>
                    <span className="service-card__number">{step.number}</span>
                    <Icon
                      className="service-card__icon"
                      aria-hidden="true"
                      size={40}
                      strokeWidth={1.25}
                    />
                    <h3>{step.title}</h3>
                    <p>{step.description}</p>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

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

        <section className="team section-light" id="team">
          <div className="page-shell">
            <div className="section-heading team__heading">
              <div data-reveal>
                <p className="eyebrow">Our team</p>
                <h2>Three people. One team.</h2>
              </div>
              <p className="section-lede" data-reveal>
                Based in Dubai and Cairo. We work as one team from the first idea to launch.
              </p>
            </div>

            <div className="person-grid">
              {team.map((person) => {
                const [name, role = "Role to be added"] = person.label.split(" / ");
                return (
                  <article className="person-card" data-reveal key={person.number}>
                    <div className="person-card__portrait">
                      <span className="person-card__city">{person.city}</span>
                      <svg className="person-card__figure" viewBox="0 0 100 100" aria-hidden="true">
                        <circle cx="50" cy="36" r="17" />
                        <path d="M14 100c0-25 16-40 36-40s36 15 36 40z" />
                      </svg>
                    </div>
                    <div className="person-card__meta">
                      <h3>{name}</h3>
                      <p>{role}</p>
                    </div>
                  </article>
                );
              })}
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

        </section>

        <SiteFooter contactEmail={company.contactEmail} locations={company.locations} />
      </main>
    </>
  );
}
