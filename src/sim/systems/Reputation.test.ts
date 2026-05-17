import { describe, it, expect } from "vitest";
import { Reputation, REP } from "./Reputation";

describe("Reputation", () => {
  it("starts at 0", () => {
    expect(new Reputation().score).toBe(0);
  });

  it("clamps to [-10, 10]", () => {
    const r = new Reputation();
    for (let i = 0; i < 20; i++) r.adjust(1);
    expect(r.score).toBe(10);
    for (let i = 0; i < 30; i++) r.adjust(-1);
    expect(r.score).toBe(-10);
  });

  it("returns correct descriptor at each band", () => {
    const r = new Reputation();
    r.score = 9; expect(r.descriptor()).toBe("beloved");
    r.score = 5; expect(r.descriptor()).toBe("well-regarded");
    r.score = 0; expect(r.descriptor()).toBe("steady");
    r.score = -5; expect(r.descriptor()).toBe("austere");
    r.score = -9; expect(r.descriptor()).toBe("feared");
  });

  it("isBenevolent / isFeared work correctly", () => {
    const r = new Reputation();
    r.score = 5; expect(r.isBenevolent()).toBe(true); expect(r.isFeared()).toBe(false);
    r.score = -5; expect(r.isBenevolent()).toBe(false); expect(r.isFeared()).toBe(true);
    r.score = 0; expect(r.isBenevolent()).toBe(false); expect(r.isFeared()).toBe(false);
  });

  it("snapshot + hydrate round-trips", () => {
    const r = new Reputation();
    r.score = 7;
    const snap = r.snapshot();
    const r2 = new Reputation();
    r2.hydrate(snap);
    expect(r2.score).toBe(7);
  });

  it("hydrate clamps out-of-range values", () => {
    const r = new Reputation();
    r.hydrate(99);
    expect(r.score).toBe(10);
    r.hydrate(-99);
    expect(r.score).toBe(-10);
  });

  it("hydrate ignores non-numbers", () => {
    const r = new Reputation();
    r.score = 3;
    r.hydrate("hello");
    expect(r.score).toBe(3); // unchanged
  });

  it("REP constants have expected signs", () => {
    expect(REP.generous).toBeGreaterThan(0);
    expect(REP.harsh).toBeLessThan(0);
    expect(REP.neutral).toBe(0);
  });
});
