/** Sections of the staff workspace and the example content shown in them until real records are connected. */

import type { ClientTab, StaffRole } from "./portal";

export type WorkspaceSectionId = "pims" | "calendar" | "tools" | "support";

export const WORKSPACE_SECTION_IDS: WorkspaceSectionId[] = ["pims", "calendar", "tools", "support"];

/** /portal/clients is the client portal itself, reachable by staff from the Tools page. */
export const CLIENTS_SECTION = "clients";

export function isWorkspaceSection(value: string): value is WorkspaceSectionId {
  return (WORKSPACE_SECTION_IDS as string[]).includes(value);
}

export const SECTION_META: Record<WorkspaceSectionId, { label: string; caption: string; intro: string }> = {
  pims: { label: "PIMS", caption: "Your details", intro: "Your personal information, team, papers and contract in one place." },
  calendar: { label: "Calendar", caption: "Your schedule", intro: "Public holidays and every kind of leave." },
  tools: { label: "Tools", caption: "Apps and systems", intro: "Find the tools we use. Search, or filter by open and closed source." },
  support: { label: "IT & Support", caption: "Help when you need it", intro: "Raise a ticket, request equipment or access, and get help." },
};

/** What each section holds, shown on its card on the workspace home. */
export const SECTION_HIGHLIGHTS: Record<WorkspaceSectionId, string[]> = {
  pims: ["Personal info", "Team", "Papers", "HR", "Contract"],
  calendar: ["Public holidays", "Annual leave", "Sick leave", "Maternity", "Forced leave"],
  tools: ["Search", "Open source", "Closed source"],
  support: ["Tickets", "Requests", "Security", "Contacts"],
};

/* ---------- PIMS ---------- */

export const SAMPLE_TEAM = [
  { name: "Sample Manager", role: "Head of Delivery", city: "Dubai", relation: "Your manager" },
  { name: "Sample Engineer", role: "Software engineer", city: "Cairo", relation: "Your team" },
  { name: "Sample Designer", role: "Product designer", city: "Cairo", relation: "Your team" },
  { name: "Sample Analyst", role: "AI engineer", city: "Dubai", relation: "Your team" },
];

export type PaperStatus = "valid" | "expiring" | "missing";

export const SAMPLE_PAPERS: { name: string; detail: string; status: PaperStatus }[] = [
  { name: "Passport", detail: "Copy on file · expires 12 Mar 2031", status: "valid" },
  { name: "Residence permit or visa", detail: "Expires 30 Nov 2026", status: "expiring" },
  { name: "National ID", detail: "Copy on file · expires 08 Jun 2030", status: "valid" },
  { name: "Highest qualification", detail: "Certificate not uploaded", status: "missing" },
  { name: "Signed employment contract", detail: "Copy on file", status: "valid" },
];

export const PAPER_LABELS: Record<PaperStatus, string> = { valid: "Valid", expiring: "Expiring soon", missing: "Missing" };

export const SAMPLE_HR = {
  employment: [
    { label: "Status", value: "Active" },
    { label: "Employment type", value: "Full-time" },
    { label: "Probation", value: "Completed" },
    { label: "Line manager", value: "Sample Manager" },
  ],
  payroll: [
    { label: "Paid", value: "Monthly" },
    { label: "Bank account", value: "•••• 0000" },
    { label: "Payslips", value: "Available from HR" },
  ],
  benefits: ["Health insurance", "Annual flight allowance", "Laptop and phone", "Learning budget"],
};

export const SAMPLE_CONTRACT = {
  terms: [
    { label: "Contract type", value: "Open-ended" },
    { label: "Start date", value: "01 Mar 2025" },
    { label: "Notice period", value: "30 days" },
    { label: "Working week", value: "Monday to Friday" },
    { label: "Place of work", value: "Dubai (hybrid)" },
  ],
  documents: ["Employment contract", "Offer letter", "Confidentiality agreement"],
};

/* ---------- Calendar ---------- */

export type Country = "uae" | "egypt";

export const COUNTRY_LABELS: Record<Country, string> = { uae: "United Arab Emirates", egypt: "Egypt" };

/** Fixed-date holidays only. Months are 0-based. Holidays that follow the moon are announced each year. */
export const FIXED_HOLIDAYS: Record<Country, { month: number; day: number; title: string }[]> = {
  uae: [
    { month: 0, day: 1, title: "New Year's Day" },
    { month: 11, day: 2, title: "National Day" },
    { month: 11, day: 3, title: "National Day holiday" },
  ],
  egypt: [
    { month: 0, day: 1, title: "New Year's Day" },
    { month: 0, day: 7, title: "Coptic Christmas" },
    { month: 0, day: 25, title: "Revolution and Police Day" },
    { month: 3, day: 25, title: "Sinai Liberation Day" },
    { month: 4, day: 1, title: "Labour Day" },
    { month: 5, day: 30, title: "30 June Revolution" },
    { month: 6, day: 23, title: "23 July Revolution" },
    { month: 9, day: 6, title: "Armed Forces Day" },
  ],
};

export type LeaveKind = "annual" | "sick" | "maternity" | "forced";

export interface LeaveConfig {
  label: string;
  summary: string;
  mode: "balance" | "scheduled";
  /** Example balance, in days. */
  entitlement?: number;
  taken?: number;
  history: { dates: string; days: number; status: "Approved" | "Pending" }[];
  scheduled?: { title: string; dates: string }[];
  note: string;
}

export const LEAVE: Record<LeaveKind, LeaveConfig> = {
  annual: {
    label: "Annual leave",
    summary: "Paid time off for rest and travel.",
    mode: "balance",
    entitlement: 30,
    taken: 8,
    history: [
      { dates: "03 – 07 Aug 2026", days: 5, status: "Approved" },
      { dates: "14 – 16 Sep 2026", days: 3, status: "Approved" },
    ],
    note: "Request leave at least two weeks ahead where you can, so the team can plan around it.",
  },
  sick: {
    label: "Sick leave",
    summary: "Time off when you are unwell. Tell your manager as early as you can.",
    mode: "balance",
    entitlement: 15,
    taken: 2,
    history: [{ dates: "11 – 12 May 2026", days: 2, status: "Approved" }],
    note: "A medical certificate may be needed for longer absences. HR will tell you if it is.",
  },
  maternity: {
    label: "Maternity leave",
    summary: "Leave before and after the birth of a child.",
    mode: "balance",
    entitlement: 60,
    taken: 0,
    history: [],
    note: "Speak to HR early. They will explain what applies to you and help plan your return.",
  },
  forced: {
    label: "Forced leave",
    summary: "Leave the company asks everyone to take, for example when the office is closed.",
    mode: "scheduled",
    history: [],
    scheduled: [
      { title: "Year-end office closure", dates: "28 – 31 Dec 2026" },
      { title: "Summer shutdown week", dates: "10 – 14 Aug 2026" },
    ],
    note: "Forced leave is arranged by the company, so there is nothing to request. Ask HR if you have questions.",
  },
};

/* ---------- Tools ---------- */

export type ToolLicence = "open" | "closed";
export type ToolCategory = "Neuravic" | "Communication" | "Files and documents" | "Planning" | "Design" | "Security" | "Monitoring and data";

export interface CatalogTool {
  name: string;
  description: string;
  category: ToolCategory;
  licence: ToolLicence;
  /** Opens this screen of the client portal. */
  tab?: ClientTab;
  /** Staff roles that can use it; everyone when missing. */
  roles?: StaffRole[];
}

export const CATALOG: CatalogTool[] = [
  { name: "Client portal", description: "Projects, requests, activity and members for client organisations.", category: "Neuravic", licence: "closed", tab: "projects" },
  { name: "Enquiries", description: "Contact-form enquiries from the website.", category: "Neuravic", licence: "closed", tab: "leads", roles: ["admin", "sales"] },
  { name: "Organisations", description: "Create client organisations and invite their first owner.", category: "Neuravic", licence: "closed", tab: "organisations", roles: ["admin"] },
  { name: "Mattermost", description: "Team chat with channels and threads.", category: "Communication", licence: "open" },
  { name: "Slack", description: "Team chat with channels and threads.", category: "Communication", licence: "closed" },
  { name: "Zoom", description: "Video meetings and webinars.", category: "Communication", licence: "closed" },
  { name: "Nextcloud", description: "Shared files, calendars and contacts you host yourself.", category: "Files and documents", licence: "open" },
  { name: "Microsoft 365", description: "Mail, documents and spreadsheets.", category: "Files and documents", licence: "closed" },
  { name: "Notion", description: "Notes, wikis and project pages.", category: "Files and documents", licence: "closed" },
  { name: "Git", description: "Version control for code.", category: "Planning", licence: "open" },
  { name: "Jira", description: "Plan and track work in sprints.", category: "Planning", licence: "closed" },
  { name: "Penpot", description: "Design and prototyping in the browser.", category: "Design", licence: "open" },
  { name: "Figma", description: "Interface design and prototyping.", category: "Design", licence: "closed" },
  { name: "Bitwarden", description: "Password manager for teams.", category: "Security", licence: "open" },
  { name: "1Password", description: "Password manager for teams.", category: "Security", licence: "closed" },
  { name: "Keycloak", description: "Single sign-on and user management.", category: "Security", licence: "open" },
  { name: "Grafana", description: "Dashboards for system health.", category: "Monitoring and data", licence: "open" },
  { name: "Metabase", description: "Questions and charts from your data.", category: "Monitoring and data", licence: "open" },
];

export const TOOL_CATEGORIES: ToolCategory[] = ["Neuravic", "Communication", "Files and documents", "Planning", "Design", "Security", "Monitoring and data"];
