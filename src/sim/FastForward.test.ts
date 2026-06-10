import { describe, expect, it } from "vitest";
import { World } from "./World";
import type { SavedJournalEntry } from "./Persistence";

/**
 * Offline progression — World.fastForwardDays replays missed in-world
 * days at day granularity so a returning player's kingdom actually
 * LIVED while they were gone.
 */

const MIN_PER_DAY = 48;
const REAL_MS_PER_DAY = MIN_PER_DAY * 60 * 1000;

/** A world founded `days` in-world days ago (wall-clock anchored). */
function worldFoundedDaysAgo(days: number): World {
  return new World({
    seed: 42,
    minutesPerDay: MIN_PER_DAY,
    foundedAtMs: Date.now() - days * REAL_MS_PER_DAY - 1000,
  });
}

describe("World.fastForwardDays", () => {
  it("is a no-op for zero or negative days", () => {
    const w = worldFoundedDaysAgo(5);
    const time = w.state.time;
    w.fastForwardDays(0);
    w.fastForwardDays(-3);
    expect(w.state.time).toBe(time);
  });

  it("advances sim time by one day-length per replayed day", () => {
    const w = worldFoundedDaysAgo(5);
    const before = w.state.time;
    w.fastForwardDays(3);
    expect(w.state.time).toBe(before + 3 * MIN_PER_DAY * 60);
  });

  it("lands state.day on the current wall-clock calendar day", () => {
    const w = worldFoundedDaysAgo(5);
    w.fastForwardDays(3);
    expect(w.state.day).toBe(w.calendar.snapshot().day);
  });

  it("writes journal entries stamped with the replayed days, not just today", () => {
    const w = worldFoundedDaysAgo(8);
    const entries: SavedJournalEntry[] = [];
    w.onJournal = (e) => entries.push(e);
    w.fastForwardDays(5);
    expect(entries.length).toBeGreaterThan(0);
    // At least one entry must be stamped before the final day — proof the
    // historical days were walked rather than collapsed into one.
    const finalDay = w.calendar.snapshot().day;
    expect(entries.some((e) => e.day < finalDay)).toBe(true);
  });

  it("runs the economy for the replayed days", () => {
    const w = worldFoundedDaysAgo(5);
    const goldBefore = w.economy.state.gold;
    w.fastForwardDays(3);
    // Default roster includes miners + a blacksmith, so production runs.
    expect(w.economy.state.gold).toBeGreaterThanOrEqual(goldBefore);
  });

  it("auto-defaults decisions from non-final days, keeps the final day's pending", () => {
    const w = worldFoundedDaysAgo(5);
    let defaulted = false;
    // Pre-existing decision (e.g. restored from save) — the player wasn't
    // there to answer it, so the replay must resolve it by default.
    w.decisions.propose({
      id: "stale",
      title: "Stale petition",
      body: "",
      expiresAt: Date.now() + 60_000,
      defaultOnExpire: true,
      options: [{ id: "d", label: "Default", onChoose: () => (defaulted = true) }],
    });
    w.fastForwardDays(3);
    expect(defaulted).toBe(true);
    expect(w.decisions.current()?.id).not.toBe("stale");
  });

  it("ages NPCs through LifeEvents catch-up during the replay", () => {
    const w = worldFoundedDaysAgo(8);
    const agesBefore = w.npcs.map((n) => n.age ?? 0);
    w.fastForwardDays(5);
    const agesAfter = w.npcs.map((n) => n.age ?? 0);
    // Population may change (births/deaths), but survivors aged.
    const aged = agesAfter.some((a, i) => i < agesBefore.length && a > agesBefore[i]);
    expect(aged).toBe(true);
  });
});
