import { eq } from "drizzle-orm";
import type { Db } from "../../db";
import { schema } from "../../db";
import { notFound } from "../../lib/errors";

export async function loadProject(db: Db, id: string) {
  const [project] = await db.select().from(schema.projects).where(eq(schema.projects.id, id)).limit(1);
  if (!project) throw notFound("Project not found");
  return project;
}

export async function loadRequest(db: Db, id: string) {
  const [request] = await db.select().from(schema.requests).where(eq(schema.requests.id, id)).limit(1);
  if (!request) throw notFound("Request not found");
  return request;
}
