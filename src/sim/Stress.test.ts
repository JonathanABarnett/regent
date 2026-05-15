import { describe, expect, it } from "vitest";
import { World, WORLD_CAPS } from "./World";
import { makeEvent } from "./events/EventSchema";
import { mapTwitchSub, mapTwitchBits } from "./events/EventMapper";

/**
 * Long-running simulation stress tests. These are the canary that catches
 * leaks: caps should hold even under continuous spam, no array should
 * grow unbounded, and the sim should remain stable across thousands of
 * ticks.
 *
 * Each test runs in well under a second on a modern machine, so they're
 * safe in the standard test suite.
 */

describe("Stress — long-running sim", () => {
  it("survives 1000 sim ticks at default rate without error", () => {
    const w = new World({ seed: 42 });
    for (let i = 0; i < 1000; i++) {
      expect(() => w.tick(0.1)).not.toThrow();
    }
    // Sim time should advance ~100 in-world seconds
    expect(w.state.time).toBeCloseTo(100, 1);
  });

  it("event bus buffer never exceeds its cap during sustained spam", () => {
    const w = new World({ seed: 42 });
    for (let i = 0; i < 1000; i++) {
      w.publish(
        makeEvent("courier", {
          id: `spam_${i}`,
          source: "internal",
          payload: { from: "rivermouth", to: "highkeep", label: "spam" },
        }),
      );
    }
    // The bus buffer caps at 200
    expect(w.bus.recent().length).toBeLessThanOrEqual(200);
  });

  it("npcs stay capped despite continuous twitch sub flood (5x cap)", () => {
    const w = new World({ seed: 42 });
    for (let i = 0; i < WORLD_CAPS.npcs * 5; i++) {
      w.publish(mapTwitchSub(`sub_${i}`, 1));
    }
    expect(w.npcs.length).toBeLessThanOrEqual(WORLD_CAPS.npcs);
  });

  it("effects stay capped despite continuous spam", () => {
    const w = new World({ seed: 42 });
    for (let i = 0; i < WORLD_CAPS.effects * 5; i++) {
      w.publish(
        makeEvent("forge", {
          id: `e_${i}`,
          source: "inbox",
          duration_ms: 60_000,
          payload: { structure: "ironhearth", label: "spam" },
        }),
      );
    }
    expect(w.effects.length).toBeLessThanOrEqual(WORLD_CAPS.effects);
  });

  it("couriers stay capped despite continuous spam", () => {
    const w = new World({ seed: 42 });
    for (let i = 0; i < WORLD_CAPS.couriers * 5; i++) {
      w.publish(
        makeEvent("courier", {
          id: `c_${i}`,
          source: "github",
          duration_ms: 60_000,
          payload: { from: "rivermouth", to: "highkeep", label: "spam" },
        }),
      );
    }
    expect(w.couriers.length).toBeLessThanOrEqual(WORLD_CAPS.couriers);
  });

  it("treasury cap (200) holds under sustained acquisition", () => {
    const w = new World({ seed: 42 });
    for (let i = 0; i < 500; i++) {
      w.treasury.acquire("treasure", `stress test ${i}`);
    }
    // CAP = 200; older artifacts age out
    expect(w.treasury.artifacts.length).toBeLessThanOrEqual(200);
    expect(w.treasury.artifacts.length).toBeGreaterThan(0);
  });

  it("economy gold can't grow unboundedly via bits flood", () => {
    const w = new World({ seed: 42 });
    const startGold = w.economy.state.gold;
    for (let i = 0; i < 1000; i++) {
      w.publish(mapTwitchBits(`whale_${i}`, 50_000));
    }
    // Each bit event adds bits/10 to gold but it caps at 99999
    expect(w.economy.state.gold).toBeLessThanOrEqual(99999);
    expect(w.economy.state.gold).toBeGreaterThan(startGold);
  });

  it("ticks remain stable after mixed event spam", () => {
    const w = new World({ seed: 42 });
    // Mix of events
    for (let i = 0; i < 200; i++) {
      const r = i % 5;
      if (r === 0) w.publish(makeEvent("courier", { source: "internal" }));
      else if (r === 1) w.publish(makeEvent("forge", { source: "internal" }));
      else if (r === 2) w.publish(makeEvent("storm", { source: "internal" }));
      else if (r === 3) w.publish(makeEvent("celebration", { source: "internal", payload: { label: "x" } }));
      else w.publish(mapTwitchSub(`user_${i}`, 1));
    }
    // Now tick a lot
    for (let i = 0; i < 500; i++) {
      expect(() => w.tick(0.1)).not.toThrow();
    }
    // Everything stayed within caps
    expect(w.npcs.length).toBeLessThanOrEqual(WORLD_CAPS.npcs);
    expect(w.couriers.length).toBeLessThanOrEqual(WORLD_CAPS.couriers);
    expect(w.effects.length).toBeLessThanOrEqual(WORLD_CAPS.effects);
  });

  it("malformed events don't ever cause unhandled throws", () => {
    const w = new World({ seed: 42 });
    const badInputs: unknown[] = [
      null,
      undefined,
      {},
      "string",
      42,
      true,
      { v: 0 },
      { v: 1, kind: "unknown" },
      { v: 1, kind: "courier", intensity: NaN },
      { v: 1, kind: "courier", payload: { meta: { __proto__: {} } } },
      { v: 1, kind: "courier", payload: { label: "A".repeat(100_000) } },
    ];
    for (const input of badInputs) {
      expect(() => w.publishRaw(input)).not.toThrow();
    }
  });

  it("can run 5000 sim ticks without slowing exponentially", () => {
    const w = new World({ seed: 42 });
    const start = performance.now();
    for (let i = 0; i < 5000; i++) {
      w.tick(0.1);
    }
    const elapsed = performance.now() - start;
    // 5000 ticks should complete well under 5 seconds even on slow CI.
    // If we ever blow past this it's a leak/perf regression that needs digging.
    expect(elapsed).toBeLessThan(5000);
  });

  it("journal growth is bounded by in-world days, not by tick count", () => {
    // Regression guard: an earlier version of Quests.tick() wrote the same
    // arc-phase journal line every sim tick (10×/sec) instead of once per
    // phase per arc — producing hundreds of duplicate entries within
    // seconds. Stress tests at the time only checked performance, not
    // journal length, so the bug shipped. This assertion ensures any
    // future "writes every tick" regression in any system surfaces here.
    //
    // The contract: across N sim ticks that DON'T advance the in-world
    // calendar day (state.day stays fixed), no system should produce
    // more than a tiny bounded number of journal entries — and definitely
    // not one per tick.
    const w = new World({ seed: 42 });
    const writes: string[] = [];
    w.onJournal = (e) => writes.push(e.text);

    // Pin the calendar so day-rollover-gated systems can't fire.
    const cal = w.calendar.snapshot();
    (w.calendar as unknown as { snapshot(): typeof cal }).snapshot = () => cal;
    w.state.day = cal.day;
    w.state.year = cal.year;

    // Drive a thousand ticks (~100 sim seconds) on the same in-world day.
    for (let i = 0; i < 1000; i++) {
      w.tick(0.1);
    }
    // Anything more than ~50 entries on one fixed day means a system is
    // writing per-tick rather than per-day or per-event. The real game
    // produces ~3-8 entries per active day under organic play.
    expect(writes.length).toBeLessThan(50);
  });

  it("journal growth scales linearly with in-world days, not with tick count", () => {
    // The same invariant from the other angle: when days DO advance, the
    // journal grows, but at a sane rate. Two runs over the same number of
    // ticks but different day-rollover schedules should produce journal
    // sizes proportional to days elapsed, not ticks elapsed.
    function runSimulatedDays(daysToAdvance: number, ticksPerDay: number): number {
      const w = new World({ seed: 42 });
      let writeCount = 0;
      w.onJournal = () => { writeCount++; };
      // Drive sim with a calendar that bumps day every N ticks.
      const cal0 = w.calendar.snapshot();
      let fakeDay = cal0.day;
      (w.calendar as unknown as { snapshot(): typeof cal0 }).snapshot = () => ({
        ...cal0,
        day: fakeDay,
      });
      for (let d = 0; d < daysToAdvance; d++) {
        fakeDay = cal0.day + d;
        for (let t = 0; t < ticksPerDay; t++) w.tick(0.1);
      }
      return writeCount;
    }
    // Same total ticks, different days. The per-day path should produce more
    // writes than the same-day path (because LifeEvents/Quests advance state),
    // but neither should explode.
    const many = runSimulatedDays(20, 50);  // 20 days, 1000 ticks total
    const few = runSimulatedDays(2, 500);    // 2 days, 1000 ticks total
    expect(many).toBeGreaterThan(few);       // more days = more content
    expect(many).toBeLessThan(20 * 30);      // but bounded — <30/day even busy
    expect(few).toBeLessThan(2 * 30);
  });
});
