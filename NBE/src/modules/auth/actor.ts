import type { InferSelectModel } from "drizzle-orm";
import type { schema } from "../../db";

export type User = InferSelectModel<typeof schema.users>;
export type OrgRole = (typeof import("../../db/schema").ORG_ROLES)[number];

/** The authenticated caller, resolved from the session cookie. */
export interface Actor {
  user: User;
  /** Org id to role for client memberships. */
  memberships: Map<string, OrgRole>;
  sessionId: string;
  sessionRenewalSeconds?: number;
  sessionCreatedAt?: number;
  mfaRequired?: boolean;
}
