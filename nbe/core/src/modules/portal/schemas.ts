import { z } from "zod";
import { PROJECT_STATUSES, REQUEST_STATES, REQUEST_TYPES } from "../../db/schema";

export const createProjectSchema = z.object({
  name: z.string().trim().min(2).max(120),
  description: z.string().trim().max(2000).optional(),
});

export const updateProjectSchema = z
  .object({
    name: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    status: z.enum(PROJECT_STATUSES).optional(),
  })
  .refine((v) => Object.keys(v).length > 0, "Provide at least one field");

export const createRequestSchema = z.object({
  type: z.enum(REQUEST_TYPES),
  title: z.string().trim().min(3).max(160),
  body: z.string().trim().min(1).max(8000),
  requiredApprovals: z.number().int().min(1).max(3).default(1),
});

export const updateRequestStateSchema = z.object({ state: z.enum(["cancelled", "completed"]) });

export const decisionSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  comment: z.string().trim().max(2000).optional(),
});

export const commentSchema = z.object({ body: z.string().trim().min(1).max(4000) });

export const listRequestsQuery = z.object({
  state: z.enum(REQUEST_STATES).optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});
