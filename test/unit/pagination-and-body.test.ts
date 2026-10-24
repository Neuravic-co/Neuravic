import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { AppError } from "../../nbe/core/src/lib/errors";
import { readBoundedBody } from "../../nbe/core/src/lib/body";
import { encodeCursor, toPage } from "../../nbe/core/src/lib/pagination";

const rows = (n: number) => Array.from({ length: n }, (_, i) => ({ id: `id${i}`, createdAt: 1000 - i }));

describe("pagination", () => {
  it("returns everything and no cursor when the page is not full", () => {
    const page = toPage(rows(3), 5);
    assert.equal(page.items.length, 3);
    assert.equal(page.nextCursor, null);
  });

  it("trims the probe row and points the cursor at the last returned row", () => {
    const page = toPage(rows(6), 5);
    assert.equal(page.items.length, 5);
    assert.equal(page.nextCursor, encodeCursor(page.items[4]!));
  });

  it("gives different cursors to different rows", () => {
    assert.notEqual(encodeCursor({ id: "a", createdAt: 1 }), encodeCursor({ id: "b", createdAt: 1 }));
  });
});

const request = (body: BodyInit | null, headers: Record<string, string> = {}) =>
  new Request("http://localhost/x", { method: "POST", body, headers, duplex: "half" } as RequestInit);

describe("bounded request bodies", () => {
  it("reads a body within the limit", async () => {
    const bytes = await readBoundedBody(request("hello"), 10);
    assert.equal(new TextDecoder().decode(bytes), "hello");
  });

  it("returns an empty buffer when there is no body", async () => {
    assert.equal((await readBoundedBody(new Request("http://localhost/x"), 10)).byteLength, 0);
  });

  it("refuses a body over the limit with 413, counting real bytes", async () => {
    await assert.rejects(readBoundedBody(request("x".repeat(11)), 10), (error) => error instanceof AppError && error.status === 413);
  });

  it("refuses an honest oversized Content-Length before reading", async () => {
    await assert.rejects(readBoundedBody(request("tiny", { "content-length": "999999" }), 10), (error) => error instanceof AppError && error.status === 413);
  });

  it("refuses a malformed Content-Length", async () => {
    await assert.rejects(readBoundedBody(request("tiny", { "content-length": "12abc" }), 10), (error) => error instanceof AppError && error.status === 400);
  });

  it("stops an endless stream instead of buffering it", async () => {
    const endless = new ReadableStream<Uint8Array>({ pull(controller) { controller.enqueue(new Uint8Array(1024)); } });
    await assert.rejects(readBoundedBody(request(endless), 4096), (error) => error instanceof AppError && error.status === 413);
  });
});
