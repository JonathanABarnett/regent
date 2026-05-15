import { describe, expect, it } from "vitest";
import { World } from "../World";
import { NarrativeDirector } from "./NarrativeDirector";
import { makeEvent } from "../events/EventSchema";

/**
 * The narrative director injects flavor events when the world has been
 * quiet (no external/non-narrative events recently). Tested by manipulating
 * its internal timer and observing the bus.
 */

function forceTimer(d: NarrativeDirector, nextFireIn: number, quietSeconds: number) {
  const internal = d as unknown as { nextFireIn: number; quietSeconds: number };
  internal.nextFireIn = nextFireIn;
  internal.quietSeconds = quietSeconds;
}

describe("NarrativeDirector", () => {
  it("doesn't fire if it's not yet time", () => {
    const w = new World({ seed: 42 });
    const before = w.bus.recent().length;
    forceTimer(w.director, 100, 100);
    w.director.tick(1);
    expect(w.bus.recent().length).toBe(before);
  });

  it("fires when the timer is due AND the world has been quiet", () => {
    const w = new World({ seed: 42 });
    forceTimer(w.director, 0, 100);
    w.director.tick(0.1);
    // At least one narrative-source event should appear soon
    const recent = w.bus.recent();
    expect(recent.some((e) => e.source === "narrative")).toBe(true);
  });

  it("skips firing when the world has been noisy", () => {
    const w = new World({ seed: 42 });
    // Trigger an external event — this resets quietSeconds to 0
    w.publish(
      makeEvent("courier", {
        source: "github",
        payload: { from: "rivermouth", to: "highkeep", label: "real event" },
      }),
    );
    const beforeCount = w.bus.recent().filter((e) => e.source === "narrative").length;
    forceTimer(w.director, 0, 0); // quietSeconds=0 → too noisy
    w.director.tick(0.1);
    const afterCount = w.bus.recent().filter((e) => e.source === "narrative").length;
    expect(afterCount).toBe(beforeCount);
  });

  it("subscribes to the bus and resets quiet timer on external events", () => {
    const w = new World({ seed: 42 });
    const internal = w.director as unknown as { quietSeconds: number };
    internal.quietSeconds = 100;
    w.publish(
      makeEvent("forge", {
        source: "github",
        payload: { structure: "ironhearth", label: "real" },
      }),
    );
    expect(internal.quietSeconds).toBe(0);
  });

  it("internal/narrative events do NOT reset the quiet timer", () => {
    const w = new World({ seed: 42 });
    const internal = w.director as unknown as { quietSeconds: number };
    internal.quietSeconds = 100;
    w.publish(makeEvent("courier", { source: "internal" }));
    expect(internal.quietSeconds).toBe(100);
  });

  it("re-schedules nextFireIn after a successful fire", () => {
    const w = new World({ seed: 42 });
    forceTimer(w.director, 0, 100);
    w.director.tick(0.1);
    const internal = w.director as unknown as { nextFireIn: number };
    expect(internal.nextFireIn).toBeGreaterThan(0);
  });

  it("doesn't throw if no structures exist for a chosen flavor kind", () => {
    const w = new World({ seed: 42 });
    // Wipe structures to simulate an exotic map
    w.map.structures.length = 0;
    forceTimer(w.director, 0, 100);
    expect(() => w.director.tick(0.1)).not.toThrow();
  });

  it("courier flavor never emits a self-loop event (from === to)", () => {
    const w = new World({ seed: 42 });
    // Strip down to one town + one castle so the picker has minimal choice
    w.map.structures = w.map.structures.filter(
      (s) => s.kind === "town" || s.kind === "castle",
    );
    // Drive many fires to be sure no edge case slips through
    const seen: Array<{ from?: string; to?: string }> = [];
    for (let i = 0; i < 80; i++) {
      forceTimer(w.director, 0, 100);
      w.director.tick(0.1);
    }
    for (const ev of w.bus.recent()) {
      if (ev.kind === "courier" && ev.source === "narrative") {
        seen.push({ from: ev.payload.from, to: ev.payload.to });
      }
    }
    expect(seen.length).toBeGreaterThan(0);
    for (const s of seen) {
      expect(s.from).toBeTruthy();
      expect(s.to).toBeTruthy();
      expect(s.from).not.toBe(s.to);
    }
  });

  it("courier flavor degrades gracefully when only a single structure exists", () => {
    const w = new World({ seed: 42 });
    // Single structure — no valid courier route possible
    w.map.structures = w.map.structures.filter((s) => s.kind === "castle").slice(0, 1);
    forceTimer(w.director, 0, 100);
    expect(() => {
      for (let i = 0; i < 30; i++) {
        forceTimer(w.director, 0, 100);
        w.director.tick(0.1);
      }
    }).not.toThrow();
    // No courier event should have been emitted because there's no destination
    const couriers = w.bus
      .recent()
      .filter((ev) => ev.kind === "courier" && ev.source === "narrative");
    expect(couriers.length).toBe(0);
  });

  it("over many fires, surfaces a variety of label strings", () => {
    const w = new World({ seed: 42 });
    const labels = new Set<string>();
    for (let i = 0; i < 200; i++) {
      forceTimer(w.director, 0, 100);
      w.director.tick(0.1);
    }
    for (const ev of w.bus.recent()) {
      if (ev.source !== "narrative") continue;
      if (ev.payload.label) labels.add(ev.payload.label);
    }
    // Expect meaningful variety — at least 5 distinct labels in 200 fires.
    expect(labels.size).toBeGreaterThanOrEqual(5);
  });
});
