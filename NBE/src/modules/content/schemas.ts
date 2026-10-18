import { z } from "zod";
import { CONTENT_KINDS } from "../../db/schema";

const text = (max: number) => z.string().trim().min(1).max(max);

/** Shape of `data` for each content kind. Unknown keys are rejected. */
export const contentDataSchemas = {
  service: z.object({ number: text(4), title: text(120), description: text(500) }).strict(),
  process: z.object({ number: text(4), title: text(120), description: text(500) }).strict(),
  project: z
    .object({
      number: text(4),
      name: text(80),
      eyebrow: text(120),
      title: text(160),
      description: text(500),
      surface: z.enum(["ink", "slate"]),
    })
    .strict(),
  team: z
    .object({ number: text(4), city: text(60), name: text(120).nullable(), role: text(120).nullable() })
    .strict(),
  company: z
    .object({
      name: text(80),
      headline: text(200),
      about: text(1000),
      locations: z.array(z.object({ city: text(60), country: text(60) }).strict()).max(10),
      contactEmail: z.string().email(),
    })
    .strict(),
} satisfies Record<(typeof CONTENT_KINDS)[number], z.ZodTypeAny>;

/** URL segment to stored kind. */
export const KIND_BY_SEGMENT = {
  services: "service",
  projects: "project",
  process: "process",
  team: "team",
  company: "company",
} as const;
export type Segment = keyof typeof KIND_BY_SEGMENT;

export const upsertContentSchema = z.object({
  data: z.record(z.string(), z.unknown()),
  position: z.number().int().min(0).max(1000).default(0),
  published: z.boolean().default(true),
});

export const slugParam = z
  .string()
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/)
  .max(60);
