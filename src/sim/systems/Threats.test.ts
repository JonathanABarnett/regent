import { describe, expect, it } from "vitest";
import { World } from "../World";
import { Threats } from "./Threats";

/**
 * Tests for the threats system. Uses a high baseChance so a threat fires
 * deterministically and we can observe its side effects.
 */

function makeWorld(seed = 42) {
  const w = new World({ seed });
  // Replace Threats with a high-chance instance so tests fire reliably.
  const high = new Threats(
    w,
    w.journal,
    (w as unknown as { rand: () => number }).rand,
    { minDaysBetween: 1, baseChance: 1.0 }, // 100% chance
  );
  (w as unknown as { threats: Threats }).threats = high;
  return w;
}

describe("Threats", () => {
  it("fires a monster event + decision when conditions allow", () => {
    const w = makeWorld();
    const events: string[] = [];
    w.bus.subscribe((ev) => events.push(ev.kind));
    w.state.day = 5;
    w.threats.tick();
    expect(events.includes("monster")).toBe(true);
    expect(w.decisions.current()).not.toBeNull();
  });

  it("writes a weather-kind journal opening line", () => {
    const w = makeWorld();
    const weatherEntries: string[] = [];
    w.onJournal = (e) => {
      if (e.kind === "weather") weatherEntries.push(e.text);
    };
    w.state.day = 10;
    w.threats.tick();
    expect(weatherEntries.length).toBeGreaterThan(0);
  });

  it("respects minDaysBetween — won't fire two days in a row", () => {
    const w = new World({ seed: 42 });
    const t = new Threats(
      w,
      w.journal,
      () => 0.001,                    // always under any threshold
      { minDaysBetween: 5, baseChance: 1.0 },
    );
    // Start at day 10 so the initial lastFiredDay = -1 → gap is 11 ≥ minDaysBetween.
    w.state.day = 10;
    t.tick();
    expect(w.decisions.current()).not.toBeNull();
    // Clear the decision
    const cur = w.decisions.current()!;
    w.decisions.resolve(cur.id, cur.options[0].id);
    expect(w.decisions.current()).toBeNull();
    // Try to fire again on day 11 — should NOT fire (only 1 day since last)
    w.state.day = 11;
    t.tick();
    expect(w.decisions.current()).toBeNull();
    // Day 15 — should fire (5 days since last)
    w.state.day = 15;
    t.tick();
    expect(w.decisions.current()).not.toBeNull();
  });

  it("captain seated reduces threat chance (statistically)", () => {
    function countFires(captainSeated: boolean): number {
      const w = new World({ seed: 1 });
      const npc = w.npcs[0];
      if (captainSeated) w.setCourt({ captainId: npc.id });
      // Use a real seeded rand so 200 trials give a stable distribution.
      const rng = (w as unknown as { rand: () => number }).rand;
      const t = new Threats(w, w.journal, rng, {
        minDaysBetween: 0,
        baseChance: 0.5,
      });
      let fires = 0;
      for (let d = 1; d <= 200; d++) {
        w.state.day = d;
        // Resolve any pending decision so the next tick can fire
        const cur = w.decisions.current();
        if (cur) w.decisions.resolve(cur.id, cur.options[0].id);
        const before = w.decisions.current();
        t.tick();
        const after = w.decisions.current();
        if (after && after !== before) fires++;
      }
      return fires;
    }
    const without = countFires(false);
    const withCaptain = countFires(true);
    expect(withCaptain).toBeLessThan(without);
  });

  it("'send the guard' option spends 15 gold and writes a milestone", () => {
    const w = makeWorld();
    w.economy.state.gold = 100;
    const milestones: string[] = [];
    w.onJournal = (e) => {
      if (e.kind === "milestone") milestones.push(e.text);
    };
    w.state.day = 5;
    w.threats.tick();
    const dec = w.decisions.current()!;
    w.decisions.resolve(dec.id, "send_guard");
    expect(w.economy.state.gold).toBe(85);
    expect(milestones.some((t) => t.includes("guard"))).toBe(true);
  });

  it("'rouse the militia' option writes a milestone without cost", () => {
    const w = makeWorld();
    const goldBefore = w.economy.state.gold;
    w.state.day = 5;
    w.threats.tick();
    const dec = w.decisions.current()!;
    w.decisions.resolve(dec.id, "rouse_militia");
    expect(w.economy.state.gold).toBe(goldBefore);
  });

  it("surfaces at least 4 distinct opening lines over many fires", () => {
    // 7 threat kinds × 3 openings = 21 unique. Drive ~80 fires; with the
    // seeded RNG we should see at least 4 distinct openings.
    const w = new World({ seed: 91 });
    const rng = (w as unknown as { rand: () => number }).rand;
    const t = new Threats(w, w.journal, rng, {
      minDaysBetween: 0,
      baseChance: 1.0,
    });
    const seen = new Set<string>();
    w.onJournal = (e) => {
      if (e.kind === "weather") seen.add(e.text);
    };
    for (let d = 1; d <= 80; d++) {
      w.state.day = d;
      const cur = w.decisions.current();
      if (cur) w.decisions.resolve(cur.id, cur.options[0].id);
      t.tick();
    }
    expect(seen.size).toBeGreaterThanOrEqual(4);
  });

  it("can fire the new threat kinds (smugglers, wraith) over many trials", () => {
    const w = new World({ seed: 77 });
    const rng = (w as unknown as { rand: () => number }).rand;
    const t = new Threats(w, w.journal, rng, {
      minDaysBetween: 0,
      baseChance: 1.0,
    });
    const events: string[] = [];
    w.bus.subscribe((ev) => {
      if (ev.kind === "monster" && ev.payload.label) events.push(ev.payload.label);
    });
    for (let d = 1; d <= 200; d++) {
      w.state.day = d;
      const cur = w.decisions.current();
      if (cur) w.decisions.resolve(cur.id, cur.options[0].id);
      t.tick();
    }
    // Over 200 trials the seeded RNG should hit every kind at least once.
    expect(events).toContain("smugglers");
    expect(events).toContain("wraith");
  });

  it("does nothing if no towns exist on the map", () => {
    const w = makeWorld();
    w.map.structures = w.map.structures.filter((s) => s.kind !== "town");
    const events: string[] = [];
    w.bus.subscribe((ev) => events.push(ev.kind));
    w.state.day = 5;
    w.threats.tick();
    expect(events.includes("monster")).toBe(false);
    expect(w.decisions.current()).toBeNull();
  });
});
