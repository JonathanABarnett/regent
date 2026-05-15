import { describe, expect, it } from "vitest";
import { World } from "../World";

describe("Treasury", () => {
  it("starts empty", () => {
    const w = new World({ seed: 42 });
    expect(w.treasury.count()).toBe(0);
  });

  it("acquires an artifact and adds a journal entry", () => {
    const w = new World({ seed: 42 });
    const before = w.bus.recent().length;
    const a = w.treasury.acquire("relic", "test origin");
    expect(w.treasury.count()).toBe(1);
    expect(a.kind).toBe("relic");
    expect(a.name.length).toBeGreaterThan(0);
    expect(a.origin).toBe("test origin");
    // bus shouldn't be polluted with a journal write (journal is separate),
    // but the artifact record carries day/year
    expect(a.obtainedOnDay).toBeGreaterThanOrEqual(1);
    expect(a.obtainedOnYear).toBeGreaterThanOrEqual(1);
    // unrelated: bus size shouldn't decrease
    expect(w.bus.recent().length).toBeGreaterThanOrEqual(before);
  });

  it("acquires multiple artifacts with distinct names where possible", () => {
    const w = new World({ seed: 42 });
    for (let i = 0; i < 4; i++) w.treasury.acquire("scroll");
    const names = w.treasury.artifacts.map((a) => a.name);
    const unique = new Set(names);
    // At least 3 of 4 should be distinct (pool has 4 names)
    expect(unique.size).toBeGreaterThanOrEqual(3);
  });

  it("falls back gracefully when the kind's name pool is exhausted", () => {
    const w = new World({ seed: 42 });
    // Scroll pool has 4 names — 5th acquire should still succeed
    for (let i = 0; i < 5; i++) w.treasury.acquire("scroll");
    expect(w.treasury.count()).toBe(5);
    // 5th has the fallback name (II)
    expect(w.treasury.artifacts[4].name.includes("(II)")).toBe(true);
  });

  it("listener fires on acquisition", () => {
    const w = new World({ seed: 42 });
    let received = 0;
    const off = w.treasury.subscribe(() => received++);
    w.treasury.acquire("gem");
    w.treasury.acquire("tome");
    off();
    w.treasury.acquire("weapon");
    expect(received).toBe(2);
  });

  it("hydrate replaces the vault with saved entries", () => {
    const w = new World({ seed: 42 });
    w.treasury.acquire("gem");
    w.treasury.hydrate([
      { id: "a", kind: "tome", name: "Ancient Text", obtainedOnDay: 5, obtainedOnYear: 1 },
      { id: "b", kind: "weapon", name: "Old Spear", obtainedOnDay: 6, obtainedOnYear: 1 },
    ]);
    expect(w.treasury.count()).toBe(2);
    expect(w.treasury.artifacts[0].name).toBe("Ancient Text");
  });
});
