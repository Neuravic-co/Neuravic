import { AppError, badRequest } from "./errors";

/** Enforce the limit on actual bytes, even when Content-Length is absent or dishonest. */
export async function readBoundedBody(request: Request, maxBytes: number): Promise<ArrayBuffer> {
  const declared = request.headers.get("content-length");
  const tooLarge = () => new AppError(413, "payload_too_large", "Request body is too large");
  if (declared !== null) {
    if (!/^\d+$/.test(declared)) throw badRequest("Invalid Content-Length");
    if (Number(declared) > maxBytes) throw tooLarge();
  }
  if (!request.body) return new ArrayBuffer(0);

  const reader = request.body.getReader();
  const signal = request.signal;
  const abort = () => { void reader.cancel().catch(() => {}); };
  signal.addEventListener("abort", abort, { once: true });
  const chunks: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) {
        // Do not wait on cancellation of an attacker-controlled source.
        void reader.cancel().catch(() => {});
        throw tooLarge();
      }
      chunks.push(value);
    }
  } finally {
    signal.removeEventListener("abort", abort);
    reader.releaseLock();
  }
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    result.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return result.buffer;
}
