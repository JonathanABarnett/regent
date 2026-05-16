import { describe, expect, it } from "vitest";
import { World } from "../World";
import { History, HISTORY_MAX_DAYS } from "./History";

describe("History", () => {
  it("captures one snapshot per call when day differs", () => {
    const w = new World({ seed: 42 });
    w.state.day = 1;
    w.history.capture(w);
    w.state.day = 2;
    w.history.capture(w);
    expect(w.history.snapshots.length).toBe(2);
  });

  it("is idempotent within the same day", () => {
    const w = new World({ seed: 42 });
    w.state.day = 5;
    w.history.capture(w);
    w.history.capture(w);
    w.history.capture(w);
    expect(w.history.snapshots.length).toBe(1);
  });

  it("captures population, gold, vault, tomes from the live world", () => {
    const w = new World({ seed: 42 });
    w.economy.state.gold = 123;
    w.economy.state.tomes = 17;
    w.treasury.acquire("relic", "test");
    w.state.day = 7;
    w.history.capture(w);
    const last = w.history.snapshots[w.history.snapshots.length - 1];
    expect(last.population).toBe(w.npcs.length);
    expect(last.gold).toBe(123);
    expect(last.vault).toBe(1);
    expect(last.tomes).toBe(17);
  });

  it("series('tomes') returns the tomes column", () => {
    const w = new World({ seed: 42 });
    for (let d = 1; d <= 5; d++) {
      w.state.day = d;
      w.economy.state.tomes = d * 3;
      w.history.capture(w);
    }
    const series = w.history.series("tomes");
    expect(series).toEqual([3, 6, 9, 12, 15]);
  });

  it("hydrate defaults tomes=0 for entries written before the field existed", () => {
    const h = new History();
    // Old-shape entries (no tomes field) — back-compat path
    h.hydrate([
      { day: 1, year: 1, population: 5, gold: 10, vault: 0 },
      { day: 2, year: 1, population: 6, gold: 12, vault: 1 },
    ]);
    expect(h.snapshots.length).toBe(2);
    expect(h.snapshots[0].tomes).toBe(0);
    expect(h.snapshots[1].tomes).toBe(0);
  });

  it("caps retained snapshots at HISTORY_MAX_DAYS", () => {
    const w = new World({ seed: 42 });
    for (let d = 1; d <= HISTORY_MAX_DAYS + 30; d++) {
      w.state.day = d;
      w.history.capture(w);
    }
    expect(w.history.snapshots.length).toBe(HISTORY_MAX_DAYS);
    // Oldest retained should be day 31 (i.e. days 1-30 fell off)
    expect(w.history.snapshots[0].day).toBe(31);
  });

  it("series('population') returns the population column", () => {
    const w = new World({ seed: 42 });
    for (let d = 1; d <= 5; d++) {
      w.state.day = d;
      w.history.capture(w);
    }
    const series = w.history.series("population");
    expect(series.length).toBe(5);
    expect(series.every((n) => typeof n === "number")).toBe(true);
  });

  it("hydrate filters out garbage entries", () => {
    const h = new History();
    h.hydrate([
      { day: 1, year: 1, population: 5, gold: 10, vault: 0 },
      null,
      "not an object",
      { day: -1, year: 1, population: 0, gold: 0, vault: 0 }, // bad day
      { day: 2, year: 1, population: 6, gold: 12, vault: 1 },
      { day: 3, year: "nope", population: 0, gold: 0, vault: 0 }, // bad year (non-finite)
    ]);
    // Only valid entries are kept
    expect(h.snapshots.length).toBe(2);
    expect(h.snapshots.map((s) => s.day)).toEqual([1, 2]);
  });

  it("hydrate clamps to HISTORY_MAX_DAYS even if input is longer", () => {
    const h = new History();
    const huge = Array.from({ length: 500 }, (_, i) => ({
      day: i + 1,
      year: 1,
      population: 5,
      gold: 10,
      vault: 0,
    }));
    h.hydrate(huge);
    expect(h.snapshots.length).toBe(HISTORY_MAX_DAYS);
    // Kept the last 90, so first retained is day 411
    expect(h.snapshots[0].day).toBe(500 - HISTORY_MAX_DAYS + 1);
  });

  it("World.tick captures a snapshot on day rollover", () => {
    const w = new World({ seed: 42 });
    const cal = w.calendar.snapshot();
    (w.calendar as unknown as { snapshot(): typeof cal }).snapshot = () => ({
      ...cal,
      day: cal.day + 1,
    });
    const before = w.history.snapshots.length;
    w.tick(0.1);
    expect(w.history.snapshots.length).toBeGreaterThan(before);
  });
});
