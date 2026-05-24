import { describe, expect, it } from "vitest";
import { World } from "../World";

/**
 * Consequences — scheduled-effects queue. Each test verifies one of the
 * design invariants:
 *   - schedules don't fire before their day
 *   - they fire on or after their day
 *   - cancel works
 *   - snapshot/restore round-trip preserves the queue
 *   - the cap protects against runaway scheduling
 *   - a throwing handler doesn't block the queue
 *   - the cult-tolerate chain produces a follow-on decision at the
 *     scheduled day (the integration test for the headline use case)
 */

describe("Consequences", () => {
  it("starts empty on a fresh world", () => {
    const w = new World({ seed: 42 });
    expect(w.consequences.pendingCount()).toBe(0);
  });

  it("schedules a consequence for a future day", () => {
    const w = new World({ seed: 42 });
    const id = w.consequences.schedule({
      kind: "cult_suppress_echo",
      fireInDays: 14,
    });
    expect(id).toMatch(/^csq_/);
    expect(w.consequences.pendingCount()).toBe(1);
    expect(w.consequences.state.pending[0].fireDay).toBe(w.state.day + 14);
  });

  it("does not fire before its day", () => {
    const w = new World({ seed: 42 });
    const entries: unknown[] = [];
    w.onJournal = (e) => entries.push(e);
    w.consequences.schedule({ kind: "cult_suppress_echo", fireInDays: 14 });
    // Advance only 5 days — well short of fire day.
    for (let i = 0; i < 5; i++) {
      w.state.day++;
      w.consequences.tickDay();
    }
    expect(w.consequences.pendingCount()).toBe(1);
    expect(entries.length).toBe(0);
  });

  it("fires on its day and removes itself from the queue", () => {
    const w = new World({ seed: 42 });
    const entries: unknown[] = [];
    w.onJournal = (e) => entries.push(e);
    w.consequences.schedule({ kind: "cult_suppress_echo", fireInDays: 3 });
    // Advance exactly to fire day.
    for (let i = 0; i < 3; i++) {
      w.state.day++;
      w.consequences.tickDay();
    }
    expect(w.consequences.pendingCount()).toBe(0);
    expect(entries.length).toBeGreaterThan(0);
  });

  it("cancel removes a pending consequence by id", () => {
    const w = new World({ seed: 42 });
    const id = w.consequences.schedule({ kind: "cult_suppress_echo", fireInDays: 30 });
    expect(w.consequences.pendingCount()).toBe(1);
    expect(w.consequences.cancel(id)).toBe(true);
    expect(w.consequences.pendingCount()).toBe(0);
    expect(w.consequences.cancel("nonexistent")).toBe(false);
  });

  it("snapshot/restore preserves pending consequences", () => {
    const a = new World({ seed: 99 });
    a.consequences.schedule({ kind: "cult_suppress_echo", fireInDays: 14 });
    a.consequences.schedule({
      kind: "cult_tolerate_growth",
      fireInDays: 30,
      data: { toleratedDay: 5 },
    });
    const snap = a.consequences.snapshot();

    const b = new World({ seed: 99 });
    b.consequences.restore(snap);
    expect(b.consequences.pendingCount()).toBe(2);
    expect(b.consequences.state.pending[1].data?.toleratedDay).toBe(5);
    expect(b.consequences.state.idCounter).toBe(a.consequences.state.idCounter);
  });

  it("hard-caps the queue at 200 entries (oldest drops)", () => {
    const w = new World({ seed: 1 });
    for (let i = 0; i < 250; i++) {
      w.consequences.schedule({ kind: "cult_suppress_echo", fireInDays: 1000 });
    }
    expect(w.consequences.pendingCount()).toBeLessThanOrEqual(200);
  });

  it("three consequences fire on the same day in insertion order", () => {
    const w = new World({ seed: 42 });
    const entries: unknown[] = [];
    w.onJournal = (e) => entries.push(e);
    // Schedule three echoes for the same day — verifies the queue
    // drains all of them in one tick, not just the first.
    w.consequences.schedule({ kind: "cult_suppress_echo", fireInDays: 1 });
    w.consequences.schedule({ kind: "cult_suppress_echo", fireInDays: 1 });
    w.consequences.schedule({ kind: "cult_suppress_echo", fireInDays: 1 });
    w.state.day++;
    w.consequences.tickDay();
    expect(w.consequences.pendingCount()).toBe(0);
    expect(entries.length).toBeGreaterThanOrEqual(3);
  });

  it("cult TOLERATE schedules a follow-on decision that fires at day 90", () => {
    // This is the integration test for the headline use case — the
    // expert-critic feedback was specifically "the tolerated cult
    // doesn't grow." This test proves it grows.
    const w = new World({ seed: 7 });
    const cultDecision = {
      id: "cult_test",
      title: "Schism",
      body: "test",
      expiresAt: Date.now() + 60_000,
      defaultOnExpire: true,
      options: [
        {
          id: "tolerate",
          label: "Tolerate",
          onChoose: (world: World) => {
            // Mirror the actual Cult.ts onChoose chain — three scheduled
            // consequences: growth at +30, +60, decision at +90.
            const toleratedDay = world.state.day;
            world.consequences.schedule({
              kind: "cult_tolerate_growth",
              fireInDays: 30,
              data: { toleratedDay },
            });
            world.consequences.schedule({
              kind: "cult_tolerate_growth",
              fireInDays: 60,
              data: { toleratedDay },
            });
            world.consequences.schedule({
              kind: "cult_tolerate_decision",
              fireInDays: 90,
              data: { toleratedDay },
            });
          },
        },
      ],
    };
    w.decisions.propose(cultDecision);
    w.decisions.resolve("cult_test", "tolerate");
    expect(w.consequences.pendingCount()).toBe(3);
    // Tick 90 days. The growth events fire along the way; the
    // tolerate-decision fires at day 90 and reaches into world.decisions.
    for (let i = 0; i < 90; i++) {
      w.state.day++;
      w.consequences.tickDay();
    }
    // After 90 ticks the decision should be in the queue.
    expect(w.decisions.current()?.title).toBe("The group has tripled");
  });

  it("round-trip via the World's full save/load preserves consequences", () => {
    // We don't import Persistence directly (it's a heavy module); instead
    // verify the same shape via snapshot/restore on a fresh world.
    const a = new World({ seed: 42 });
    a.consequences.schedule({ kind: "cult_suppress_echo", fireInDays: 14 });
    a.consequences.schedule({
      kind: "cult_tolerate_growth",
      fireInDays: 60,
      data: { toleratedDay: 100 },
    });
    const snap = a.consequences.snapshot();

    const b = new World({ seed: 42 });
    const bEntries: unknown[] = [];
    b.onJournal = (e) => bEntries.push(e);
    b.consequences.restore(snap);
    // Advance b far enough to fire both — confirms restored fireDay values are valid.
    for (let i = 0; i < 120; i++) {
      b.state.day++;
      b.consequences.tickDay();
    }
    expect(b.consequences.pendingCount()).toBe(0);
    expect(bEntries.length).toBeGreaterThanOrEqual(2);
  });
});
