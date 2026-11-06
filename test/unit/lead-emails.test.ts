import assert from "node:assert/strict";
import { describe, it } from "node:test";
import { acknowledgementText, teamText } from "../../nbe/src/modules/leads/emails";

describe("lead emails", () => {
  it("greets the visitor by first name", () => {
    assert.match(acknowledgementText("Sara Ahmed", []), /^Hi Sara,/);
  });

  it("falls back to a neutral greeting without a name", () => {
    assert.match(acknowledgementText("", []), /^Hi there,/);
  });

  it("describes the approach for each chosen service", () => {
    const text = acknowledgementText("Sara", ["ai", "ops"]);
    assert.match(text, /AI systems:/);
    assert.match(text, /Operations:/);
    assert.doesNotMatch(text, /Software:/);
    assert.doesNotMatch(text, /Product design:/);
  });

  it("leaves out the approach section when no service is chosen", () => {
    assert.doesNotMatch(acknowledgementText("Sara", []), /how we will approach/);
  });

  it("lists readable service names for the team", () => {
    const text = teamText("id1", "Sara", "sara@example.com", "Acme", ["software", "product"], "Hello there, this is a message");
    assert.match(text, /Interested in: Software, Product design/);
    assert.match(text, /Hello there, this is a message$/);
  });

  it("says when no service was chosen", () => {
    assert.match(teamText("id1", "Sara", "sara@example.com", "-", [], "A message that is long enough"), /Interested in: not specified/);
  });
});
