"use client";

import { ArrowUpRight, BookOpen, Briefcase, Building2, Clock, FileText, Inbox, Receipt, type LucideIcon } from "lucide-react";
import type { ClientTab, Me } from "@/lib/portal";

interface LiveTool {
  title: string;
  description: string;
  icon: LucideIcon;
  tab: ClientTab;
  allowed: (staffRole: Me["user"]["staffRole"]) => boolean;
}

const LIVE_TOOLS: LiveTool[] = [
  {
    title: "Client portal",
    description: "Projects, requests, activity and members for client organisations.",
    icon: Briefcase,
    tab: "projects",
    allowed: () => true,
  },
  {
    title: "Enquiries",
    description: "Contact-form enquiries from the website.",
    icon: Inbox,
    tab: "leads",
    allowed: (role) => role === "admin" || role === "sales",
  },
  {
    title: "Organisations",
    description: "Create client organisations and invite their first owner.",
    icon: Building2,
    tab: "organisations",
    allowed: (role) => role === "admin",
  },
];

const COMING_SOON: { title: string; description: string; icon: LucideIcon }[] = [
  { title: "Documents", description: "Contracts, policies and shared files.", icon: FileText },
  { title: "Time tracking", description: "Log hours against projects.", icon: Clock },
  { title: "Expenses", description: "Submit and track expense claims.", icon: Receipt },
  { title: "Knowledge base", description: "How we work, written down.", icon: BookOpen },
];

export function ToolsView({ staffRole, onOpen }: { staffRole: Me["user"]["staffRole"]; onOpen: (tab: ClientTab) => void }) {
  return (
    <div className="ws-tools">
      <h2 className="sr-only">Available tools</h2>
      <ul className="ws-tool-grid">
        {LIVE_TOOLS.filter((tool) => tool.allowed(staffRole)).map(({ title, description, icon: Icon, tab }) => (
          <li key={title}>
            <button type="button" className="ws-tool" onClick={() => onOpen(tab)}>
              <Icon aria-hidden="true" size={26} strokeWidth={1.25} />
              <strong>{title}</strong>
              <span>{description}</span>
              <ArrowUpRight className="ws-tool__go" aria-hidden="true" size={18} strokeWidth={1.5} />
            </button>
          </li>
        ))}
      </ul>

      <h2 className="ws-subtitle">Coming soon</h2>
      <ul className="ws-tool-grid">
        {COMING_SOON.map(({ title, description, icon: Icon }) => (
          <li key={title}>
            <div className="ws-tool is-soon">
              <Icon aria-hidden="true" size={26} strokeWidth={1.25} />
              <strong>{title}</strong>
              <span>{description}</span>
              <em>Soon</em>
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
