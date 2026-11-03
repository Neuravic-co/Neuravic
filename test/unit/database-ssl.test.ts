import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { databaseSsl } from "../../nbe/core/src/db/ssl";

const PEM = "-----BEGIN CERTIFICATE-----\nMIIB\n-----END CERTIFICATE-----";

describe("database TLS", () => {
  it("leaves TLS to the connection string when no CA is set", () => {
    assert.equal(databaseSsl({}), undefined);
    assert.equal(databaseSsl({ DATABASE_CA_CERT: "   " }), undefined);
  });

  it("verifies the server against the given CA", () => {
    assert.deepEqual(databaseSsl({ DATABASE_CA_CERT: PEM }), { ca: PEM, rejectUnauthorized: true });
  });

  it("accepts a single-line value with escaped line breaks", () => {
    assert.equal(databaseSsl({ DATABASE_CA_CERT: PEM.replace(/\n/g, "\\n") })?.ca, PEM);
  });

  it("refuses a value that is not a certificate", () => {
    assert.throws(() => databaseSsl({ DATABASE_CA_CERT: "not a cert" }), /PEM certificate/);
  });
});
