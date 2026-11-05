import { z } from "zod";

export const SERVICE_INTERESTS = ["ai", "software", "product", "ops"] as const;

export const createLeadSchema = z.object({
  name: z.string().trim().min(1).max(120),
  email: z.string().trim().toLowerCase().pipe(z.email().max(254)),
  company: z.string().trim().max(160).optional(),
  message: z.string().trim().min(10).max(4000),
  serviceInterest: z.array(z.enum(SERVICE_INTERESTS)).max(SERVICE_INTERESTS.length).default([]),
  consent: z.literal(true, { error: "Consent is required" }),
  website: z.string().max(200).optional(),
  turnstileToken: z.string().max(2048).optional(),
});

export type CreateLeadInput = z.infer<typeof createLeadSchema>;
