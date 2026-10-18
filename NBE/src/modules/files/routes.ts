import { asc, count, eq } from "drizzle-orm";
import { Hono } from "hono";
import type { AppEnv } from "../../app";
import { runBatch, schema } from "../../db";
import { sha256Hex } from "../../lib/crypto";
import { AppError, badRequest, forbidden, notFound } from "../../lib/errors";
import { ulid } from "../../lib/ids";
import { auditInsert } from "../audit/audit";
import { requireActor } from "../auth/middleware";
import { requireOrgRole } from "../orgs/policy";
import { loadRequest } from "../portal/loaders";

/** Attachments on requests. Bytes live in R2; metadata and access control live here. */
export const filesRoutes = new Hono<AppEnv>();

const MAX_FILES_PER_REQUEST = 20;
/** Deliberately excludes SVG, HTML and archives. */
export const ALLOWED_MIME_TYPES = new Set([
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "text/plain",
  "text/csv",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
]);

export function sanitizeFileName(raw: string | undefined): string {
  const base = (raw ?? "").split(/[\\/]/).pop() ?? "";
  // eslint-disable-next-line no-control-regex
  const cleaned = base.replace(/[\u0000-\u001f\u007f"]/g, "").trim().slice(0, 120);
  return cleaned || "file";
}

function requireBlobs(deps: import("../../deps").Deps) {
  if (!deps.blobs) throw new AppError(503, "storage_unavailable", "File storage is not configured");
  return deps.blobs;
}

filesRoutes.put("/requests/:id/files", async (c) => {
  const actor = requireActor(c);
  const deps = c.get("deps");
  const blobs = requireBlobs(deps);
  const request = await loadRequest(deps.db, c.req.param("id"));
  requireOrgRole(actor, request.orgId, "member");
  if (request.state === "cancelled") throw badRequest("Cannot attach files to a cancelled request");

  const mime = (c.req.header("content-type") ?? "").split(";")[0]!.trim().toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mime)) throw new AppError(415, "unsupported_media_type", "This file type is not allowed");

  const declared = Number(c.req.header("content-length") ?? 0);
  if (declared > deps.config.maxUploadBytes) throw new AppError(413, "payload_too_large", "File is too large");
  const data = await c.req.arrayBuffer();
  if (data.byteLength === 0) throw badRequest("File is empty");
  if (data.byteLength > deps.config.maxUploadBytes) throw new AppError(413, "payload_too_large", "File is too large");

  const [{ total: attached } = { total: 0 }] = await deps.db
    .select({ total: count() })
    .from(schema.files)
    .where(eq(schema.files.requestId, request.id));
  if (attached >= MAX_FILES_PER_REQUEST) throw new AppError(409, "conflict", "Too many files on this request");

  const now = deps.now();
  const id = ulid(now);
  const file = {
    id,
    orgId: request.orgId,
    requestId: request.id,
    storageKey: `orgs/${request.orgId}/${id}`,
    name: sanitizeFileName(c.req.query("name")),
    size: data.byteLength,
    mime,
    sha256: await sha256Hex(data),
    scanState: "pending" as const,
    uploadedBy: actor.user.id,
    createdAt: now,
  };

  await blobs.put(file.storageKey, data, mime);
  try {
    await runBatch(deps.db, [
      deps.db.insert(schema.files).values(file),
      auditInsert(deps.db, { actorId: actor.user.id, orgId: request.orgId, action: "file.uploaded", targetType: "file", targetId: id, meta: { size: file.size } }, now),
    ]);
  } catch (error) {
    await blobs.delete(file.storageKey); // do not leave orphaned objects
    throw error;
  }
  const { storageKey: _key, ...publicFile } = file;
  return c.json(publicFile, 201);
});

filesRoutes.get("/requests/:id/files", async (c) => {
  const actor = requireActor(c);
  const deps = c.get("deps");
  const request = await loadRequest(deps.db, c.req.param("id"));
  requireOrgRole(actor, request.orgId, "viewer");
  const rows = await deps.db
    .select({ id: schema.files.id, name: schema.files.name, size: schema.files.size, mime: schema.files.mime, scanState: schema.files.scanState, uploadedBy: schema.files.uploadedBy, createdAt: schema.files.createdAt })
    .from(schema.files)
    .where(eq(schema.files.requestId, request.id))
    .orderBy(asc(schema.files.createdAt));
  return c.json({ items: rows });
});

async function loadFile(deps: import("../../deps").Deps, id: string) {
  const [file] = await deps.db.select().from(schema.files).where(eq(schema.files.id, id)).limit(1);
  if (!file) throw notFound("File not found");
  return file;
}

/** Streams the file through the API so every download is authorised. Always an attachment. */
filesRoutes.get("/files/:id/content", async (c) => {
  const actor = requireActor(c);
  const deps = c.get("deps");
  const blobs = requireBlobs(deps);
  const file = await loadFile(deps, c.req.param("id"));
  requireOrgRole(actor, file.orgId, "viewer");
  if (file.scanState === "infected") throw forbidden("This file was blocked by a security scan");
  const blob = await blobs.get(file.storageKey);
  if (!blob) throw notFound("File content not found");
  return new Response(blob.body, {
    headers: {
      "content-type": blob.contentType,
      "content-length": String(file.size),
      "content-disposition": `attachment; filename="${file.name.replace(/[^\x20-\x7e]/g, "_")}"; filename*=UTF-8''${encodeURIComponent(file.name)}`,
      "cache-control": "private, no-store",
      "x-content-type-options": "nosniff",
    },
  });
});

filesRoutes.delete("/files/:id", async (c) => {
  const actor = requireActor(c);
  const deps = c.get("deps");
  const blobs = requireBlobs(deps);
  const file = await loadFile(deps, c.req.param("id"));
  const role = requireOrgRole(actor, file.orgId, "member");
  const isAdmin = role === "admin" || role === "owner";
  if (file.uploadedBy !== actor.user.id && !isAdmin) throw forbidden();
  const now = deps.now();
  await runBatch(deps.db, [
    deps.db.delete(schema.files).where(eq(schema.files.id, file.id)),
    auditInsert(deps.db, { actorId: actor.user.id, orgId: file.orgId, action: "file.deleted", targetType: "file", targetId: file.id }, now),
  ]);
  // The record is already gone, so a failed object delete must not turn into an error for the caller.
  await blobs.delete(file.storageKey).catch((error) => deps.log.warn("blob_delete_failed", { fileId: file.id, error: String(error) }));
  return c.body(null, 204);
});
