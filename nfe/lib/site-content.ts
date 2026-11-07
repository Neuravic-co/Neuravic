export interface Feature {
  number: string;
  title: string;
  description: string;
}

export type WorkVisualKind = "network" | "document" | "tiles";

export interface Project {
  number: string;
  name: string;
  visual: WorkVisualKind;
  title: string;
  description: string;
}

export interface TeamMember {
  number: string;
  city: string;
  name: string;
  role: string;
  summary: string;
  skills: string[];
  cv: string;
}

export interface Location {
  city: string;
  country: string;
}

export interface Company {
  headline: string;
  about: string;
  contactEmail: string;
  locations: Location[];
}

export interface SiteContent {
  services: Feature[];
  projects: Project[];
  process: Feature[];
  team: TeamMember[];
  company: Company;
}

const numbered = <T extends object>(items: T[]) =>
  items.map((item, index) => ({ number: String(index + 1).padStart(2, "0"), ...item }));

export const SITE_CONTENT: SiteContent = {
  services: numbered([
    { title: "AI Systems & Automation", description: "Inspectable agents, retrieval, document intelligence and computer vision." },
    { title: "Software Platforms", description: "Web applications, APIs, databases and integrations engineered for daily operation." },
    { title: "Product Experience", description: "Clear UX, interfaces and design systems that make complex technology usable." },
    { title: "Deployment & Operations", description: "Secure delivery, monitoring, testing, access control and long-term support." },
  ]),
  projects: numbered<Omit<Project, "number">>([
    {
      name: "DarkAgent",
      visual: "network",
      title: "Governed AI mission control.",
      description: "A bounded multi-agent platform built for human authority, live inspection and reliable execution.",
    },
    {
      name: "ContractGuard",
      visual: "document",
      title: "Contract risk, made visible.",
      description: "A review workspace that flags risky clauses, tracks obligations and keeps renewals on schedule.",
    },
    {
      name: "CoolAccess",
      visual: "tiles",
      title: "Access operations, made clear.",
      description: "A unified workflow platform for requests, approvals and access visibility across Dubai operations.",
    },
  ]),
  process: numbered([
    { title: "Discover", description: "Understand the workflow, the limits and the key decisions." },
    { title: "Design", description: "Shape the product, the experience and the system." },
    { title: "Engineer", description: "Build the platform, the AI and the integrations." },
    { title: "Deploy & Support", description: "Launch safely, watch performance and keep improving." },
  ]),
  team: numbered([
    {
      city: "Dubai",
      name: "Mohamed Bassam",
      role: "AI Engineer",
      summary: "Builds end-to-end AI systems: multi-agent workflows, retrieval, computer vision and NLP.",
      skills: ["Python", "LangGraph", "PyTorch", "FastAPI"],
      cv: "/assets/cv/mohamed-bassam-cv.pdf",
    },
    {
      city: "Cairo",
      name: "Zeyad Wael",
      role: "Software Engineer",
      summary: "Software Engineer at Orange Business, building Go services and Grafana observability plugins.",
      skills: ["Go", "Java", "Docker", "Grafana"],
      cv: "/assets/cv/zeyad-wael-cv.pdf",
    },
  ]),
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
