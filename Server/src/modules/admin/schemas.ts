import { z } from "zod";
import { STAFF_ROLES } from "../../db/schema";

export const inviteStaffSchema = z.object({
  email: z.string().trim().toLowerCase().email().max(254),
  name: z.string().trim().min(1).max(120).optional(),
  staffRole: z.enum(STAFF_ROLES),
});

export const updateUserSchema = z
  .object({
    name: z.string().trim().min(1).max(120).optional(),
    status: z.enum(["active", "disabled"]).optional(),
    staffRole: z.enum(STAFF_ROLES).nullable().optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field");

export const listUsersQuery = z.object({
  staff: z.enum(["true", "false"]).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const auditQuery = z.object({
  action: z.string().max(80).optional(),
  orgId: z.string().max(40).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});
