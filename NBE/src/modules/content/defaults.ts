import type { CONTENT_KINDS } from "../../db/schema";

export interface DefaultContent {
  kind: (typeof CONTENT_KINDS)[number];
  slug: string;
  position: number;
  data: Record<string, unknown>;
}

const services = [
  ["ai-systems-automation", "AI Systems & Automation", "Inspectable agents, retrieval, document intelligence and computer vision."],
  ["software-platforms", "Software Platforms", "Web applications, APIs, databases and integrations engineered for daily operation."],
  ["product-experience", "Product Experience", "Clear UX, interfaces and design systems that make complex technology usable."],
  ["deployment-operations", "Deployment & Operations", "Secure delivery, monitoring, testing, access control and long-term support."],
] as const;

const process = [
  ["discover", "Discover", "Map the workflow, constraints and real decision points."],
  ["design", "Design", "Shape the product, experience and system architecture."],
  ["engineer", "Engineer", "Build the platform, intelligence and integrations."],
  ["deploy-support", "Deploy & support", "Ship securely, observe performance and keep improving."],
] as const;

const pad = (n: number) => String(n).padStart(2, "0");

/** Initial site content. Mirrors the copy currently hard-coded in NFE/app/page.tsx. */
export const DEFAULT_CONTENT: DefaultContent[] = [
  ...services.map(([slug, title, description], i): DefaultContent => ({
    kind: "service", slug, position: i, data: { number: pad(i + 1), title, description },
  })),
  ...process.map(([slug, title, description], i): DefaultContent => ({
    kind: "process", slug, position: i, data: { number: pad(i + 1), title, description },
  })),
  {
    kind: "project", slug: "darkagent", position: 0,
    data: {
      number: "01", name: "DARKAGENT", eyebrow: "Work, made operational.", title: "Governed AI mission control.",
      description: "A bounded multi-agent platform built for human authority, live inspection and reliable execution.",
      surface: "ink",
    },
  },
  {
    kind: "project", slug: "coolaccess-dxb", position: 1,
    data: {
      number: "02", name: "COOLACCESS_DXB", eyebrow: "Access, made effortless.", title: "Access operations, made clear.",
      description: "A unified workflow platform for requests, approvals and access visibility across Dubai operations.",
      surface: "slate",
    },
  },
  { kind: "team", slug: "member-1", position: 0, data: { number: "01", city: "Cairo", name: null, role: null } },
  { kind: "team", slug: "member-2", position: 1, data: { number: "02", city: "Cairo", name: null, role: null } },
  { kind: "team", slug: "member-3", position: 2, data: { number: "03", city: "Dubai", name: null, role: null } },
  {
    kind: "company", slug: "profile", position: 0,
    data: {
      name: "Neuravic",
      headline: "We turn complex operations into intelligent systems.",
      about:
        "Neuravic is an engineering company in Dubai and Cairo. We bring AI, software, design and operations together to build systems people can run.",
      locations: [
        { city: "Dubai", country: "United Arab Emirates" },
        { city: "Cairo", country: "Egypt" },
      ],
      contactEmail: "neuravic2026@gmail.com",
    },
  },
];
