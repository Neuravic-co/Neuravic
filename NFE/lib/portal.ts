/** Types and helpers shared by the client portal. They mirror the NBE API responses. */

export type OrgRole = "viewer" | "member" | "admin" | "owner";
export type StaffRole = "admin" | "delivery" | "sales";
export type RequestState = "open" | "approved" | "rejected" | "cancelled" | "completed";
export type RequestType = "access" | "change" | "support" | "other";
export type ProjectStatus = "active" | "paused" | "completed";
export type LeadStatus = "new" | "qualified" | "won" | "lost" | "spam";

/** The screens of the client portal, which staff can also open from the workspace. */
export type ClientTab = "projects" | "requests" | "activity" | "members" | "organisations" | "leads";

export const STAFF_ROLE_LABELS: Record<StaffRole, string> = {
  admin: "Administrator",
  delivery: "Delivery",
  sales: "Sales",
};

/** Where portal support emails go until tickets are stored by the backend. */
export const SUPPORT_EMAIL = "neuravic2026@gmail.com";

export interface Me {
  user: { id: string; email: string; name: string | null; staffRole: StaffRole | null };
  memberships: { orgId: string; name: string; slug: string; role: OrgRole }[];
}

/** The account shown in the portal preview. Every value is sample data. */
export const PREVIEW_ME: Me = {
  user: { id: "preview", email: "sample.user@neuravic.com", name: "Sample User", staffRole: "admin" },
  memberships: [],
};

/** Example personal details for the preview, so the PIMS tab shows how a filled-in profile looks. */
export const PREVIEW_DETAILS: Record<string, string> = {
  Phone: "+971 00 000 0000",
  "Date of birth": "01 Jan 1990",
  Nationality: "Sample country",
  "Home address": "1 Example Street, Dubai",
  "Job title": "Operations lead",
  Department: "Delivery",
  "Employee ID": "NV-0001",
  "Start date": "01 Mar 2025",
  Office: "Dubai",
  Name: "Sample Contact",
  Relationship: "Family",
};

export interface Org {
  id: string;
  name: string;
  slug: string;
  createdAt: number;
}

export interface Project {
  id: string;
  orgId: string;
  name: string;
  description: string | null;
  status: ProjectStatus;
  createdAt: number;
}

export interface PortalRequest {
  id: string;
  projectId: string;
  orgId: string;
  type: RequestType;
  title: string;
  body: string;
  state: RequestState;
  requiredApprovals: number;
  requestedBy: string;
  requesterName: string | null;
  requesterEmail: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface Approval {
  id: string;
  approverId: string;
  approverName: string | null;
  approverEmail: string;
  decision: "approved" | "rejected";
  comment: string | null;
  decidedAt: number;
}

export interface Comment {
  id: string;
  authorId: string;
  authorName: string | null;
  authorEmail: string;
  body: string;
  createdAt: number;
}

export interface FileItem {
  id: string;
  name: string;
  size: number;
  mime: string;
  uploadedBy: string;
  createdAt: number;
}

export interface RequestDetail extends PortalRequest {
  approvals: Approval[];
  comments: Comment[];
  files: FileItem[];
}

export interface Member {
  userId: string;
  email: string;
  name: string | null;
  status: "invited" | "active" | "disabled";
  role: OrgRole;
}

export interface ActivityItem {
  id: string;
  createdAt: number;
  actorId: string | null;
  actorName: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
}

export interface Lead {
  id: string;
  name: string;
  email: string;
  company: string | null;
  message: string;
  serviceInterest: string[];
  budgetBand: string | null;
  status: LeadStatus;
  createdAt: number;
}

export interface LeadNote {
  id: string;
  body: string;
  createdAt: number;
}

const RANK: Record<OrgRole, number> = { viewer: 1, member: 2, admin: 3, owner: 4 };

export const atLeast = (role: OrgRole | null, minimum: OrgRole) => role !== null && RANK[role] >= RANK[minimum];

/** Mirrors the server policy so the UI hides actions the API would refuse. The API still enforces it. */
export function effectiveRole(me: Me, orgId: string): OrgRole | null {
  const staff = me.user.staffRole;
  if (staff === "admin") return "owner";
  if (staff === "delivery") return "admin";
  return me.memberships.find((m) => m.orgId === orgId)?.role ?? null;
}

export const displayName = (name: string | null | undefined, email: string | null | undefined) =>
  name?.trim() || email || "Someone";

const dateTime = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" });
const dateOnly = new Intl.DateTimeFormat("en-GB", { dateStyle: "medium" });
export const formatDateTime = (ms: number) => dateTime.format(new Date(ms));
export const formatDate = (ms: number) => dateOnly.format(new Date(ms));

export function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export const REQUEST_TYPE_LABELS: Record<RequestType, string> = {
  access: "Access",
  change: "Change",
  support: "Support",
  other: "Other",
};

const ACTIVITY_LABELS: Record<string, string> = {
  "org.created": "created the organisation",
  "org.member_invited": "invited a member",
  "org.member_role_changed": "changed a member's role",
  "org.member_removed": "removed a member",
  "project.created": "created a project",
  "project.updated": "updated a project",
  "request.created": "submitted a request",
  "request.approved": "approved a request",
  "request.rejected": "rejected a request",
  "request.cancelled": "cancelled a request",
  "request.completed": "completed a request",
  "comment.added": "commented on a request",
  "file.uploaded": "attached a file",
  "file.deleted": "removed a file",
};

export const describeActivity = (action: string) => ACTIVITY_LABELS[action] ?? action;
