import { z } from "zod";
import { LEAD_STATUSES } from "../../db/schema";

export const SERVICE_INTERESTS = ["ai", "software", "product", "ops"] as const;

/** Body of POST /leads. Mirrors the "Start a project" intent on the website. */
export const createLeadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().email().max(254),
  company: z.string().trim().max(160).optional(),
  message: z.string().trim().min(10).max(4000),
  serviceInterest: z.array(z.enum(SERVICE_INTERESTS)).max(SERVICE_INTERESTS.length).default([]),
  budgetBand: z.string().trim().max(60).optional(),
  source: z.string().trim().max(60).default("website"),
  consent: z.literal(true, { errorMap: () => ({ message: "Consent is required" }) }),
  turnstileToken: z.string().max(2048).optional(),
  /** Honeypot. Real users never fill this in. */
  website: z.string().max(200).optional(),
});
export type CreateLeadInput = z.infer<typeof createLeadSchema>;

export const leadStatusSchema = z.enum(LEAD_STATUSES);

export const listLeadsQuery = z.object({
  status: leadStatusSchema.optional(),
  cursor: z.string().max(200).optional(),
  limit: z.coerce.number().int().min(1).max(100).default(25),
});

export const updateLeadSchema = z.object({ status: leadStatusSchema });
export const leadNoteSchema = z.object({ body: z.string().trim().min(1).max(4000) });
