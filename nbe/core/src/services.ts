import type { MountRoutes } from "./app";
import { adminRoutes } from "./modules/admin/routes";
import { authRoutes, meRoutes } from "./modules/auth/routes";
import { contentRoutes } from "./modules/content/routes";
import { leadsRoutes } from "./modules/leads/routes";
import { orgsRoutes } from "./modules/orgs/routes";
import { portalRoutes } from "./modules/portal/routes";
import { privacyAdminRoutes, privacyRoutes } from "./modules/privacy/routes";
import { jwksRoutes, ssoRoutes } from "./modules/sso/routes";

/** The routes each backend service owns. Services mount their own; a single-process host mounts them all. */

/** Accounts: sign-up, login, sessions, staff MFA, the profile, privacy requests and single sign-on tokens. */
export const mountAuth: MountRoutes = (api, root) => {
  api.route("/auth", authRoutes);
  api.route("/me", meRoutes);
  api.route("/me/privacy", privacyRoutes);
  api.route("/admin/privacy-requests", privacyAdminRoutes);
  api.route("/token", ssoRoutes);
  root.route("/.well-known/jwks.json", jwksRoutes);
};

/** The client portal: organisations, members, projects, requests, approvals, comments and activity. */
export const mountPortal: MountRoutes = (api) => {
  api.route("/orgs", orgsRoutes);
  api.route("/", portalRoutes);
};

/** The public side of the company: website enquiries (leads) and the editable site content. */
export const mountLeads: MountRoutes = (api) => {
  api.route("/leads", leadsRoutes);
  api.route("/content", contentRoutes);
};

/** Staff tools: overview, users, staff accounts, audit log, security status and site content editing. */
export const mountAdmin: MountRoutes = (api) => {
  api.route("/admin", adminRoutes);
};

/** Everything except file hosting and the dev mailbox, for hosts that run the backend as one process. */
export const mountAll: MountRoutes = (api, root) => {
  mountAuth(api, root);
  mountAdmin(api, root);
  mountLeads(api, root);
  mountPortal(api, root);
};
