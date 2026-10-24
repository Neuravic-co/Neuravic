import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { Hono } from "hono";
import { z } from "zod";
import { AppError, isDatabaseGuard, isUniqueViolation } from "../../nbe/core/src/lib/errors";
import { parseJson } from "../../nbe/core/src/lib/validate";

const schema = z.object({ email: z.string().email(), age: z.number().int().min(18) });

function app() {
  const hono = new Hono();
  hono.post("/", async (c) => c.json(await parseJson(c, schema)));
  hono.onError((error, c) => {
    if (error instanceof AppError) return c.json({ code: error.code }, error.status as 400);
    return c.json({ code: "zod" }, 400);
  });
  return hono;
}

const post = (body: string, type = "application/json") =>
  app().request("/", { method: "POST", body, headers: { "content-type": type } });

describe("JSON body validation", () => {
  it("accepts a valid body", async () => {
    const res = await post(JSON.stringify({ email: "a@example.com", age: 30 }));
    assert.equal(res.status, 200);
  });

  it("refuses non-JSON content types (blocks cross-site HTML form posts)", async () => {
    for (const type of ["text/plain", "application/x-www-form-urlencoded", "multipart/form-data"]) {
      const res = await post(JSON.stringify({ email: "a@example.com", age: 30 }), type);
      assert.equal(res.status, 415, type);
    }
  });

  it("accepts JSON with a charset and +json types", async () => {
    assert.equal((await post(JSON.stringify({ email: "a@example.com", age: 30 }), "application/json; charset=utf-8")).status, 200);
    assert.equal((await post(JSON.stringify({ email: "a@example.com", age: 30 }), "application/vnd.api+json")).status, 200);
  });

  it("rejects broken JSON and values that break the schema", async () => {
    assert.equal((await post("{nope")).status, 400);
    assert.equal((await post(JSON.stringify({ email: "not-an-email", age: 30 }))).status, 400);
    assert.equal((await post(JSON.stringify({ email: "a@example.com", age: 17 }))).status, 400);
  });
});

describe("database error recognition", () => {
  it("finds a duplicate-key error even when wrapped", () => {
    const inner = new Error("Duplicate entry 'x' for key 'users_email_unique'");
    assert.equal(isUniqueViolation(new Error("Failed query", { cause: inner })), true);
    assert.equal(isUniqueViolation(new Error("something else")), false);
  });

  it("matches a write-guard marker by name", () => {
    const inner = new Error("last_staff_admin");
    assert.equal(isDatabaseGuard(new Error("wrapper", { cause: inner }), "last_staff_admin"), true);
    assert.equal(isDatabaseGuard(new Error("wrapper", { cause: inner }), "request_not_open"), false);
  });
});
