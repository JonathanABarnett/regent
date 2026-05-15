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
});
