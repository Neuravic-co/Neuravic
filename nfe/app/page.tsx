import { ScrollEffects } from "@/components/scroll-effects";
import { About } from "@/components/sections/about";
import { Contact } from "@/components/sections/contact";
import { Hero } from "@/components/sections/hero";
import { Process } from "@/components/sections/process";
import { Services } from "@/components/sections/services";
import { Team } from "@/components/sections/team";
import { Work } from "@/components/sections/work";
import { SectionDots } from "@/components/section-dots";
import { SiteFooter } from "@/components/site-footer";
import { SiteHeader } from "@/components/site-header";
import { SITE_CONTENT } from "@/lib/site-content";

export default function Home() {
  const { services, projects, process, team, company } = SITE_CONTENT;

  return (
    <>
      <ScrollEffects />
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <SiteHeader />
      <SectionDots />

      <main id="main-content">
        <Hero headline={company.headline} />
        <Services services={services} />
        <Work projects={projects} />
        <Process steps={process} />
        <About company={company} />
        <Team team={team} />
        <Contact email={company.contactEmail} />
        <SiteFooter
          contactEmail={company.contactEmail}
          locations={company.locations}
          services={services.map((service) => service.title)}
          projects={projects.map((project) => project.name)}
        />
      </main>
    </>
  );
}
