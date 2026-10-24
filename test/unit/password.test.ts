import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { hashPassword, verifyPassword } from "../../nbe/core/src/lib/password";

describe("password hashing", () => {
  it("accepts the right password and rejects a wrong one", async () => {
    const stored = await hashPassword("correct horse battery");
    assert.equal(await verifyPassword("correct horse battery", stored), true);
    assert.equal(await verifyPassword("correct horse batterY", stored), false);
    assert.equal(await verifyPassword("", stored), false);
  });

  it("never stores the password and uses a different salt every time", async () => {
    const a = await hashPassword("same password 1");
    const b = await hashPassword("same password 1");
    assert.notEqual(a, b);
    assert.ok(!a.includes("same password 1"));
    assert.match(a, /^scrypt\$\d+\$\d+\$\d+\$[\w-]+\$[\w-]+$/);
  });

  it("treats Unicode forms of the same password as equal", async () => {
    const stored = await hashPassword("café password");
    assert.equal(await verifyPassword("café password", stored), true);
  });

  it("refuses an unknown account or a malformed stored value, without throwing", async () => {
    assert.equal(await verifyPassword("anything at all", undefined), false);
    assert.equal(await verifyPassword("anything at all", "not-a-hash"), false);
    assert.equal(await verifyPassword("anything at all", "scrypt$1$2$3$x"), false);
  });
});
