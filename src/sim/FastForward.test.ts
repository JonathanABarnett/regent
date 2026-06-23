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

  it("accumulates matters for the check-in instead of auto-resolving them all, capped at MAX_CHECKIN_DECISIONS", () => {
    // The whole point of a check-in: decisions raised while away WAIT for
    // the player. The replay should never leave the queue larger than the
    // batch cap, and across a long absence it should usually have at least
    // one matter waiting (the court rolls each replayed day).
    let everPending = false;
    for (let seed = 1; seed <= 12; seed++) {
      const w = new World({
        seed,
        minutesPerDay: MIN_PER_DAY,
        foundedAtMs: Date.now() - 6 * REAL_MS_PER_DAY - 1000,
      });
      w.fastForwardDays(6);
      expect(w.decisions.count()).toBeLessThanOrEqual(World.MAX_CHECKIN_DECISIONS);
      if (w.decisions.count() > 0) everPending = true;
    }
    expect(everPending).toBe(true);
  });

  it("overflow beyond the cap is auto-defaulted (court handled the routine business)", () => {
    const w = worldFoundedDaysAgo(5);
    let defaulted = 0;
    // Pre-load more matters than the cap; the replay's capAwayQueue must
    // resolve the oldest overflow to default and keep the newest batch.
    const N = World.MAX_CHECKIN_DECISIONS + 3;
    for (let i = 0; i < N; i++) {
      w.decisions.propose({
        id: `stale_${i}`,
        title: `Matter ${i}`,
        body: "",
        expiresAt: Date.now() + 60_000,
        defaultOnExpire: true,
        options: [{ id: "d", label: "Default", onChoose: () => (defaulted++) }],
      });
    }
    w.fastForwardDays(2);
    expect(w.decisions.count()).toBeLessThanOrEqual(World.MAX_CHECKIN_DECISIONS);
    expect(defaulted).toBeGreaterThanOrEqual(N - World.MAX_CHECKIN_DECISIONS);
    // The oldest ("Matter 0") must have been culled; a newest one survives.
    expect(w.decisions.pendingTitles()).not.toContain("Matter 0");
  });

  it("proposeCheckInMatter raises a decision so a check-in is never empty", () => {
    const w = worldFoundedDaysAgo(2);
    expect(w.decisions.count()).toBe(0);
    w.quests.proposeCheckInMatter();
    expect(w.decisions.count()).toBeGreaterThanOrEqual(1);
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
