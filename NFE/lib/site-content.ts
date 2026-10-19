/**
 * Marketing content shown on the home page.
 * The Neuravic API is the source of truth; these defaults are the fallback
 * used when the API is unreachable, so the site always renders.
 */
export interface Service {
  number: string;
  title: string;
  description: string;
}

export type ProcessStep = Service;

export interface Project {
  number: string;
  name: string;
  eyebrow: string;
  title: string;
  description: string;
  surface: "ink" | "slate";
}

export interface TeamMember {
  number: string;
  city: string;
  label: string;
}

export interface Company {
  headline: string;
  about: string;
  contactEmail: string;
  locations: { city: string; country: string }[];
}

export interface SiteContent {
  services: Service[];
  projects: Project[];
  process: ProcessStep[];
  team: TeamMember[];
  company: Company;
}

export const DEFAULT_CONTENT: SiteContent = {
  services: [
    { number: "01", title: "AI Systems & Automation", description: "Inspectable agents, retrieval, document intelligence and computer vision." },
    { number: "02", title: "Software Platforms", description: "Web applications, APIs, databases and integrations engineered for daily operation." },
    { number: "03", title: "Product Experience", description: "Clear UX, interfaces and design systems that make complex technology usable." },
    { number: "04", title: "Deployment & Operations", description: "Secure delivery, monitoring, testing, access control and long-term support." },
  ],
  projects: [
    {
      number: "01",
      name: "DARKAGENT",
      eyebrow: "Work, made operational.",
      title: "Governed AI mission control.",
      description: "A bounded multi-agent platform built for human authority, live inspection and reliable execution.",
      surface: "ink",
    },
    {
      number: "02",
      name: "COOLACCESS_DXB",
      eyebrow: "Access, made effortless.",
      title: "Access operations, made clear.",
      description: "A unified workflow platform for requests, approvals and access visibility across Dubai operations.",
      surface: "slate",
    },
  ],
  process: [
    { number: "01", title: "Discover", description: "Map the workflow, constraints and real decision points." },
    { number: "02", title: "Design", description: "Shape the product, experience and system architecture." },
    { number: "03", title: "Engineer", description: "Build the platform, intelligence and integrations." },
    { number: "04", title: "Deploy & support", description: "Ship securely, observe performance and keep improving." },
  ],
  team: [
    { number: "01", city: "Cairo", label: "Name / Role to be added" },
    { number: "02", city: "Cairo", label: "Name / Role to be added" },
    { number: "03", city: "Dubai", label: "Name / Role to be added" },
  ],
  company: {
    headline: "We turn complex operations into intelligent systems.",
    about:
      "Neuravic is an engineering company in Dubai and Cairo. We bring AI, software, design and operations together to build systems people can run.",
    contactEmail: "neuravic2026@gmail.com",
    locations: [
      { city: "Dubai", country: "United Arab Emirates" },
      { city: "Cairo", country: "Egypt" },
    ],
  },
};

interface ApiTeamMember {
  number: string;
  city: string;
  name: string | null;
  role: string | null;
}

const isList = (value: unknown): value is unknown[] => Array.isArray(value) && value.length > 0;

/** Maps API team records to the card label the design uses. */
function teamLabel(member: ApiTeamMember): string {
  if (member.name && member.role) return `${member.name} / ${member.role}`;
  return member.name ?? "Name / Role to be added";
}

/**
 * Reads site content from the API (server side) and falls back, section by
 * section, to the built-in defaults on any error, timeout or empty response.
 */
export async function getSiteContent(): Promise<SiteContent> {
  const origin = process.env.API_ORIGIN?.replace(/\/$/, "");
  if (!origin) return DEFAULT_CONTENT;

  try {
    const response = await fetch(`${origin}/api/v1/content`, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(2500),
      next: { revalidate: 60 },
    } as RequestInit);
    if (!response.ok) return DEFAULT_CONTENT;
    const data = (await response.json()) as Record<string, unknown>;

    const company = isList(data.company) ? (data.company[0] as Partial<Company>) : undefined;
    return {
      services: isList(data.services) ? (data.services as Service[]) : DEFAULT_CONTENT.services,
      projects: isList(data.projects) ? (data.projects as Project[]) : DEFAULT_CONTENT.projects,
      process: isList(data.process) ? (data.process as ProcessStep[]) : DEFAULT_CONTENT.process,
      team: isList(data.team)
        ? (data.team as ApiTeamMember[]).map((m) => ({ number: m.number, city: m.city, label: teamLabel(m) }))
        : DEFAULT_CONTENT.team,
      company: {
        headline: company?.headline ?? DEFAULT_CONTENT.company.headline,
        about: company?.about ?? DEFAULT_CONTENT.company.about,
        contactEmail: company?.contactEmail ?? DEFAULT_CONTENT.company.contactEmail,
        locations: isList(company?.locations) ? company.locations : DEFAULT_CONTENT.company.locations,
      },
    };
  } catch {
    return DEFAULT_CONTENT;
  }
}
