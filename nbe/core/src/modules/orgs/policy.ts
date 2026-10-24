import { forbidden, notFound } from "../../lib/errors";
import type { Actor, OrgRole } from "../auth/actor";

export const ROLE_RANK: Record<OrgRole, number> = { viewer: 1, member: 2, admin: 3, owner: 4 };

/**
 * The caller's effective role in an org.
 * Staff admins act as owners everywhere and delivery staff as admins;
 * sales staff have no portal access. Clients only have their memberships.
 */
export function effectiveRole(actor: Actor, orgId: string): OrgRole | null {
  const staff = actor.user.staffRole;
  if (staff === "admin") return "owner";
  if (staff === "delivery") return "admin";
  return actor.memberships.get(orgId) ?? null;
}

/**
 * Throws 404 for non-members (so org ids cannot be probed) and 403 when the
 * caller is a member with too little privilege. Returns the effective role.
 */
export function requireOrgRole(actor: Actor, orgId: string, minimum: OrgRole): OrgRole {
  const role = effectiveRole(actor, orgId);
  if (!role) throw notFound("Organisation not found");
  if (ROLE_RANK[role] < ROLE_RANK[minimum]) throw forbidden();
  return role;
}

export function isStaffWithPortalAccess(actor: Actor): boolean {
  return actor.user.staffRole === "admin" || actor.user.staffRole === "delivery";
}
