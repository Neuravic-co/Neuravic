import { eq } from "drizzle-orm";
import { describe, expect, it } from "vitest";
import { schema } from "../../NBE/src/db";
import { drainOutbox, emailJob, RETRY_DELAYS_MS, slackJob } from "../../NBE/src/modules/notifications/outbox";
import { makeTestApp } from "./helpers";

describe("outbox", () => {
  it("sends email and slack jobs once", async () => {
    const { deps, mailer, outbound } = await makeTestApp();
    deps.config.slackWebhookUrl = "https://hooks.test/slack";
    await emailJob(deps.db, 1, { to: "a@test.dev", subject: "Hi", text: "Body" });
    await slackJob(deps.db, 1, "New lead");
    const first = await drainOutbox({ ...deps, now: () => 10 });
    const second = await drainOutbox({ ...deps, now: () => 11 });
    expect(first.sent).toBe(2);
    expect(second.sent).toBe(0);
    expect(mailer.sent).toHaveLength(1);
    expect(outbound[0]?.body).toEqual({ text: "New lead" });
  });

  it("retries with backoff, then marks the job dead", async () => {
    const { deps, mailer } = await makeTestApp();
    mailer.failWith = new Error("provider down");
    await emailJob(deps.db, 0, { to: "a@test.dev", subject: "Hi", text: "Body" });

    let clock = 0;
    for (let attempt = 1; attempt <= RETRY_DELAYS_MS.length + 1; attempt += 1) {
      await drainOutbox({ ...deps, now: () => clock });
      const [job] = await deps.db.select().from(schema.outbox);
      if (attempt <= RETRY_DELAYS_MS.length) {
        expect(job?.state).toBe("pending");
        expect(job?.nextAttemptAt).toBeGreaterThanOrEqual(clock + RETRY_DELAYS_MS[attempt - 1]!);
        expect(job?.nextAttemptAt).toBeLessThanOrEqual(clock + RETRY_DELAYS_MS[attempt - 1]! * 1.2);
        clock = job!.nextAttemptAt;
      } else {
        expect(job?.state).toBe("dead");
      }
    }
  });

  it("does not resend while another drain holds the lease", async () => {
    const { deps, mailer } = await makeTestApp();
    await emailJob(deps.db, 0, { to: "a@test.dev", subject: "Hi", text: "Body" });
    await Promise.all([drainOutbox({ ...deps, now: () => 5 }), drainOutbox({ ...deps, now: () => 5 })]);
    expect(mailer.sent.length).toBeLessThanOrEqual(1);
    const [job] = await deps.db.select().from(schema.outbox).where(eq(schema.outbox.state, "sent"));
    expect(job).toBeTruthy();
  });
});
