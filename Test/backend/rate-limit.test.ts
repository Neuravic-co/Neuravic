import { describe, expect, it } from "vitest";
import { DbRateLimiter } from "../../NBE/src/lib/rate-limit";
import { runMaintenance } from "../../NBE/src/modules/maintenance/service";
import { makeTestApp } from "./helpers";

describe("database rate limiter", () => {
  it("allows up to the limit inside a window, then refuses", async () => {
    const { deps } = await makeTestApp();
    const limiter = new DbRateLimiter(deps.db);
    const now = 1_000_000_000_000;
    const results = [];
    for (let i = 0; i < 4; i++) results.push(await limiter.hit("k", 3, 60, now));
    expect(results).toEqual([true, true, true, false]);
  });

  it("counts keys separately and starts fresh in the next window", async () => {
    const { deps } = await makeTestApp();
    const limiter = new DbRateLimiter(deps.db);
    const now = 1_000_000_000_000;
    expect(await limiter.hit("a", 1, 60, now)).toBe(true);
    expect(await limiter.hit("a", 1, 60, now)).toBe(false);
    expect(await limiter.hit("b", 1, 60, now)).toBe(true);
    expect(await limiter.hit("a", 1, 60, now + 61_000)).toBe(true);
  });

  it("counts correctly when hits arrive at the same time", async () => {
    const { deps } = await makeTestApp();
    const limiter = new DbRateLimiter(deps.db);
    const now = 1_000_000_000_000;
    const results = await Promise.all(Array.from({ length: 10 }, () => limiter.hit("burst", 4, 60, now)));
    expect(results.filter(Boolean)).toHaveLength(4);
  });

  it("removes expired windows during maintenance", async () => {
    const { deps } = await makeTestApp();
    const limiter = new DbRateLimiter(deps.db);
    await limiter.hit("old", 5, 60, 1_000_000_000_000);
    const report = await runMaintenance({ ...deps, now: () => 1_000_000_000_000 + 3_600_000 });
    expect(report.rateLimitsRemoved).toBe(1);
  });
});
