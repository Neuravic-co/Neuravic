import type { SERVICE_INTERESTS } from "./schema";

type Service = (typeof SERVICE_INTERESTS)[number];

const LABELS: Record<Service, string> = {
  ai: "AI systems",
  software: "Software",
  product: "Product design",
  ops: "Operations",
};

const APPROACH: Record<Service, string> = {
  ai: "AI systems: we will look at where automation or a model could take manual work off your team, and tell you honestly whether AI is the right tool for it.",
  software: "Software: we will look at what needs to be built or fixed, and how it fits with the systems you already run.",
  product: "Product design: we will look at how people use your product today and where the experience slows them down.",
  ops: "Operations: we will look at where work gets stuck between people and systems, and what is worth simplifying first.",
};

export const serviceLabels = (services: readonly Service[]) => services.map((service) => LABELS[service]).join(", ");

export function acknowledgementText(name: string, services: readonly Service[]): string {
  const first = name.split(/\s+/)[0] || "there";
  const chosen = services.map((service) => APPROACH[service]);
  const focus = chosen.length
    ? [`Here is how we will approach what you asked about:`, "", ...chosen.map((line) => `- ${line}`), ""]
    : [];
  return [
    `Hi ${first},`,
    "",
    "Thank you for getting in touch with Neuravic. We have your message, and a person on our team will read it and reply to you shortly.",
    "",
    ...focus,
    "What happens next:",
    "1. We read your message and, if we need more detail, send you a few short questions.",
    "2. We suggest a first step and a clear scope, with no obligation.",
    "",
    "If you want to add something, just reply to this email.",
    "",
    "Best regards,",
    "The Neuravic team",
    "Dubai / Cairo",
  ].join("\n");
}

export function teamText(id: string, name: string, email: string, company: string, services: readonly Service[], message: string): string {
  return [
    `Enquiry: ${id}`,
    `Name: ${name}`,
    `Email: ${email}`,
    `Company: ${company}`,
    `Interested in: ${services.length ? serviceLabels(services) : "not specified"}`,
    "",
    message,
  ].join("\n");
}
