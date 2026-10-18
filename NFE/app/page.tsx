import { ArrowRight, ArrowUpRight } from "lucide-react";
import Image from "next/image";
import { SiteEffects } from "@/components/site-effects";
import { SiteHeader } from "@/components/site-header";

const services = [
  {
    number: "01",
    title: "AI Systems & Automation",
    description:
      "Inspectable agents, retrieval, document intelligence and computer vision.",
  },
  {
    number: "02",
    title: "Software Platforms",
    description:
      "Web applications, APIs, databases and integrations engineered for daily operation.",
  },
  {
    number: "03",
    title: "Product Experience",
    description:
      "Clear UX, interfaces and design systems that make complex technology usable.",
  },
  {
    number: "04",
    title: "Deployment & Operations",
    description:
      "Secure delivery, monitoring, testing, access control and long-term support.",
  },
];

const projects = [
  {
    number: "01",
    name: "DARKAGENT",
    eyebrow: "Work, made operational.",
    title: "Governed AI mission control.",
    description:
      "A bounded multi-agent platform built for human authority, live inspection and reliable execution.",
    surface: "ink",
  },
  {
    number: "02",
    name: "COOLACCESS_DXB",
    eyebrow: "Access, made effortless.",
    title: "Access operations, made clear.",
    description:
      "A unified workflow platform for requests, approvals and access visibility across Dubai operations.",
    surface: "slate",
  },
];

const process = [
  {
    number: "01",
    title: "Discover",
    description: "Map the workflow, constraints and real decision points.",
  },
  {
    number: "02",
    title: "Design",
    description: "Shape the product, experience and system architecture.",
  },
  {
    number: "03",
    title: "Engineer",
    description: "Build the platform, intelligence and integrations.",
  },
  {
    number: "04",
    title: "Deploy & support",
    description: "Ship securely, observe performance and keep improving.",
  },
];

const team = [
  { number: "01", city: "Cairo", label: "Name / role to be added" },
  { number: "02", city: "Cairo", label: "Name / role to be added" },
  { number: "03", city: "Dubai", label: "Name / role to be added" },
];

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

export default function Home() {
  return (
    <>
      <SiteEffects />
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <SiteHeader />

      <main id="main-content">
        <section className="hero section-dark" id="home" data-nav-section>
          <div className="hero__art" aria-hidden="true">
            <Image
              src="/assets/hero-art.png"
              alt=""
              fill
              priority
              quality={92}
              sizes="100vw"
            />
          </div>
          <div className="hero__veil" aria-hidden="true" />

          <div className="page-shell hero__inner">
            <div className="hero__copy">
              <div className="hero__tags" data-reveal>
                <span>AI systems</span>
                <span>Software</span>
                <span>Product design</span>
              </div>

              <h1 data-reveal>
                We turn complex operations into intelligent systems.
              </h1>

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

            <div className="hero__service-index" data-reveal>
              <span className="hero__service-label">Services</span>
              {services.map((service) => (
                <a href="#services" key={service.number}>
                  {service.title}
                </a>
              ))}
            </div>
          </div>

          <a className="hero__scroll" href="#services" aria-label="Scroll to services">
            <span>Scroll</span>
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

            <div className="service-list">
              {services.map((service) => (
                <article className="service-row" data-reveal key={service.number}>
                  <span className="service-row__number">{service.number}</span>
                  <h3>{service.title}</h3>
                  <p>{service.description}</p>
                  <ArrowUpRight
                    className="service-row__arrow"
                    aria-hidden="true"
                    size={22}
                    strokeWidth={1.25}
                  />
                </article>
              ))}
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
              {process.map((step) => (
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
              <p>
                Neuravic is a multidisciplinary engineering company working across
                Dubai and Cairo. We combine AI, software, product design and operations
                to build systems people can actually run.
              </p>
              <ArrowLink href="#team">About Neuravic</ArrowLink>
            </div>

            <div className="about__locations" data-reveal>
              <div>
                <span>01</span>
                <p>Dubai / United Arab Emirates</p>
              </div>
              <div>
                <span>02</span>
                <p>Cairo / Egypt</p>
              </div>
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
              <a
                className="button button--primary button--large"
                href="mailto:hello@neuravic.com?subject=Start%20a%20project%20with%20Neuravic"
              >
                <span>Start a Conversation</span>
                <ArrowUpRight aria-hidden="true" size={18} strokeWidth={1.5} />
              </a>
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
                <span>Dubai</span>
                <span>Cairo</span>
              </div>
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
