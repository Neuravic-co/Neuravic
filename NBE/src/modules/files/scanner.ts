import { and, asc, eq, lte, sql } from "drizzle-orm";
import { runBatch, schema } from "../../db";
import type { Deps } from "../../deps";
import { readBoundedBody } from "../../lib/body";
import { sha256Hex } from "../../lib/crypto";
import { AppError } from "../../lib/errors";
import { auditInsert } from "../audit/audit";

export interface MalwareScanner {
  scan(data: ArrayBuffer, sha256: string): Promise<"clean" | "infected">;
}

/** Enforce a deadline even if a private binding does not honor AbortSignal. */
export async function withScanDeadline<T>(task: (signal: AbortSignal) => Promise<T>, ms = 10_000): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race([
      task(controller.signal),
      new Promise<never>((_, reject) => { timer = setTimeout(() => { controller.abort(); reject(new Error("scan_timeout")); }, ms); }),
    ]);
  } finally { clearTimeout(timer); }
}

/** Private binding only. No client-chosen URL, public callback, filename or tenant data. */
export class ServiceMalwareScanner implements MalwareScanner {
  constructor(private readonly service: Pick<Fetcher, "fetch">) {}
  async scan(data: ArrayBuffer, sha256: string): Promise<"clean" | "infected"> {
    return withScanDeadline(async (signal) => {
    const result = await this.service.fetch("https://scanner.internal/scan", {
      method: "POST", body: data, redirect: "error", signal,
      headers: { "content-type": "application/octet-stream", "x-content-sha256": sha256 },
    });
    if (!result.ok || !result.headers.get("content-type")?.startsWith("application/json")) {
      await result.body?.cancel(); throw new Error("scan_unavailable");
    }
    const bytes = await readBoundedBody(new Request("https://scanner.internal/verdict", { method: "POST", body: result.body, signal, duplex: "half" } as RequestInit), 1024);
    const verdict: unknown = JSON.parse(new TextDecoder().decode(bytes));
    if (!verdict || typeof verdict !== "object" || !("sha256" in verdict) || verdict.sha256 !== sha256 ||
      !("status" in verdict) || (verdict.status !== "clean" && verdict.status !== "infected")) throw new Error("invalid_scan_verdict");
    return verdict.status as "clean" | "infected";
    });
  }
}

/** Basic type spoofing defence. A matching signature does not establish that content is safe. */
export function validateFileSignature(data: ArrayBuffer, mime: string) {
  const bytes = new Uint8Array(data);
  const starts = (...signature: number[]) => signature.every((b, i) => bytes[i] === b);
  const valid = mime === "application/pdf" ? starts(37, 80, 68, 70, 45) :
    mime === "image/png" ? starts(137, 80, 78, 71, 13, 10, 26, 10) :
    mime === "image/jpeg" ? starts(255, 216, 255) :
    mime === "image/webp" ? starts(82, 73, 70, 70) && String.fromCharCode(...bytes.slice(8, 12)) === "WEBP" :
    mime.includes("openxmlformats") ? starts(80, 75, 3, 4) :
    (mime === "text/plain" || mime === "text/csv") && !bytes.includes(0);
  if (!valid) throw new AppError(415, "file_type_mismatch", "File content does not match the declared type");
  if (mime.startsWith("text/")) {
    try { new TextDecoder("utf-8", { fatal: true, ignoreBOM: false }).decode(data); }
    catch { throw new AppError(415, "file_type_mismatch", "Text files must use UTF-8"); }
  }
}

/** Bounded cron work with leases and retry backoff; every error keeps bytes quarantined. */
export async function scanPendingFiles(deps: Deps, fileId?: string) {
  if (!deps.scanner || !deps.blobs) return 0;
  const now = deps.now();
  const pending = and(eq(schema.files.scanState, "pending"), lte(schema.files.nextScanAt, now));
  const rows = await deps.db.select().from(schema.files).where(fileId ? and(pending, eq(schema.files.id, fileId)) : pending).orderBy(asc(schema.files.nextScanAt)).limit(fileId ? 1 : 5);
  let scanned = 0;
  for (const file of rows) {
    const lease = deps.now() + 60_000;
    const [claimed] = await deps.db.update(schema.files).set({ nextScanAt: lease }).where(and(pending, eq(schema.files.id, file.id), eq(schema.files.nextScanAt, file.nextScanAt))).returning({ id: schema.files.id });
    if (!claimed) continue;
    const ownsLease = and(eq(schema.files.id, file.id), eq(schema.files.scanState, "pending"), eq(schema.files.nextScanAt, lease));
    try {
      const blob = await deps.blobs.get(file.storageKey);
      if (!blob) throw new Error("scan_blob_missing");
      const bytes = await readBoundedBody(new Request("https://storage.internal/file", { method: "POST", body: blob.body, duplex: "half" } as RequestInit), deps.config.maxUploadBytes);
      if (bytes.byteLength !== file.size || await sha256Hex(bytes) !== file.sha256) throw new Error("scan_blob_changed");
      const state = await withScanDeadline(() => deps.scanner!.scan(bytes, file.sha256));
      if (state !== "clean" && state !== "infected") throw new Error("invalid_scan_verdict");
      await runBatch(deps.db, [
        deps.db.update(schema.files).set({ scanState: state, scanAttempts: file.scanAttempts + 1 }).where(ownsLease),
        auditInsert(deps.db, { orgId: file.orgId, action: `file.scan_${state}`, targetType: "file", targetId: file.id }, deps.now(), null, sql`changes() > 0`),
      ]);
      scanned++;
    } catch {
      await deps.db.update(schema.files).set({ scanAttempts: file.scanAttempts + 1, nextScanAt: deps.now() + Math.min(3_600_000, 60_000 * 2 ** Math.min(file.scanAttempts, 6)) }).where(ownsLease);
      deps.log.warn("file_scan_failed", { fileId: file.id });
    }
  }
  return scanned;
}
