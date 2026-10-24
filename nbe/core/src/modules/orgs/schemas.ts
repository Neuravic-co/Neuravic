import { z } from "zod";
import { ORG_ROLES } from "../../db/schema";

export const slugSchema = z
  .string()
  .trim()
  .toLowerCase()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "Use lowercase letters, numbers and dashes")
  .min(2)
  .max(60);

export const createOrgSchema = z.object({
  name: z.string().trim().min(2).max(120),
  slug: slugSchema.optional(),
  /** Invites this person as the first owner. */
  ownerEmail: z.string().trim().toLowerCase().email().max(254).optional(),
});

export const addMemberSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  role: z.enum(ORG_ROLES).default("member"),
  name: z.string().trim().min(1).max(120).optional(),
});

export const changeRoleSchema = z.object({ role: z.enum(ORG_ROLES) });

export const slugify = (name: string) =>
  name
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 60) || "org";
