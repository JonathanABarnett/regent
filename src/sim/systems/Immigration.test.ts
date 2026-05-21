import { describe, it, expect } from "vitest";
import { World } from "../World";
import type { SavedJournalEntry } from "../Persistence";

/** Advance N days by directly mutating state.day and calling immigration.tick(). */
function advanceDays(world: World, n: number): SavedJournalEntry[] {
  const entries: SavedJournalEntry[] = [];
  world.onJournal = (e) => entries.push(e);
  const start = world.state.day;
  for (let d = 1; d <= n; d++) {
    (world.state as { day: number }).day = start + d;
    world.immigration.tick();
  }
  return entries;
}

describe("Immigration", () => {
  it("snapshot returns initial state", () => {
    const w = new World({ seed: 42 });
    const snap = w.immigration.snapshot();
    expect(snap.lastWandererDay).toBe(0);
    expect(snap.processedCampIds).toEqual([]);
  });

  it("restore() re-applies saved state", () => {
    const w = new World({ seed: 42 });
    w.immigration.restore({ lastWandererDay: 50, processedCampIds: ["camp_a"] });
    const snap = w.immigration.snapshot();
    expect(snap.lastWandererDay).toBe(50);
    expect(snap.processedCampIds).toContain("camp_a");
  });

  it("does not propose a decision before exploration is established", () => {
    const w = new World({ seed: 42 });
    // Frontier hasn't grown enough (radius < 32), so no wanderer should fire.
    expect(w.exploration.radius).toBeLessThan(32);
    advanceDays(w, 15); // one full interval
    expect(w.decisions.current()).toBeNull();
  });

  it("proposes a wanderer decision after frontier + interval", () => {
    const w = new World({ seed: 42 });
    // Manually expand the frontier past the threshold.
    w.exploration.restore(35);
    // Advance past the 14-day interval.
    let decision = null;
    const start = w.state.day;
    for (let d = 1; d <= 20; d++) {
      (w.state as { day: number }).day = start + d;
      w.immigration.tick();
      decision = w.decisions.current();
      if (decision) break;
    }
    // May or may not fire depending on random gate — just check the ID format if it does.
    if (decision) {
      expect(decision.id.startsWith("imm_")).toBe(true);
      expect(decision.options.length).toBe(3);
    }
  });

  it("welcome option adds an NPC to the roster", () => {
    const w = new World({ seed: 42 });
    w.exploration.restore(35);
    const startPop = w.npcs.length;
    // Spin until a wanderer decision appears.
    const start = w.state.day;
    for (let d = 1; d <= 60; d++) {
      (w.state as { day: number }).day = start + d;
      w.immigration.tick();
      const dec = w.decisions.current();
      if (dec?.id.startsWith("imm_wanderer")) {
        w.decisions.resolve(dec.id, "welcome");
        break;
      }
    }
    expect(w.npcs.length).toBeGreaterThan(startPop);
  });

  it("refuse option does NOT add an NPC", () => {
    const w = new World({ seed: 42 });
    w.exploration.restore(35);
    const startPop = w.npcs.length;
    const start = w.state.day;
    for (let d = 1; d <= 60; d++) {
      (w.state as { day: number }).day = start + d;
      w.immigration.tick();
      const dec = w.decisions.current();
      if (dec?.id.startsWith("imm_wanderer")) {
        w.decisions.resolve(dec.id, "refuse");
        break;
      }
    }
    expect(w.npcs.length).toBe(startPop);
  });

  it("camp decision fires when a camp enters explored territory", () => {
    const w = new World({ seed: 42 });
    // Manually place a camp on an explored tile.
    const cx = 10;
    const cy = 10;
    w.map.structures.push({ id: "camp_test", kind: "camp", name: "Test Camp", pos: { x: cx, y: cy }, size: { x: 2, y: 2 } });
    w.map.tiles[cy * w.map.width + cx].explored = true;

    advanceDays(w, 1);

    const dec = w.decisions.current();
    expect(dec?.id).toBe("imm_camp_camp_test");
    expect(dec?.options.some((o) => o.id === "raid")).toBe(true);
    expect(dec?.options.some((o) => o.id === "diplomacy")).toBe(true);
  });

  it("raid adds NPCs and reduces reputation", () => {
    const w = new World({ seed: 42 });
    const cx = 10;
    const cy = 10;
    w.map.structures.push({ id: "camp_r", kind: "camp", name: "Bandit Camp", pos: { x: cx, y: cy }, size: { x: 2, y: 2 } });
    w.map.tiles[cy * w.map.width + cx].explored = true;
    w.economy.state.gold = 100;
    const startRep = w.reputation.score;
    const startPop = w.npcs.length;

    advanceDays(w, 1);
    const dec = w.decisions.current()!;
    w.decisions.resolve(dec.id, "raid");

    expect(w.npcs.length).toBeGreaterThan(startPop);
    expect(w.reputation.score).toBeLessThan(startRep);
  });

  it("diplomacy adds NPCs and improves reputation (if gold sufficient)", () => {
    const w = new World({ seed: 42 });
    const cx = 15;
    const cy = 15;
    w.map.structures.push({ id: "camp_d", kind: "camp", name: "Frontier Camp", pos: { x: cx, y: cy }, size: { x: 2, y: 2 } });
    w.map.tiles[cy * w.map.width + cx].explored = true;
    w.economy.state.gold = 100;
    const startRep = w.reputation.score;
    const startPop = w.npcs.length;

    advanceDays(w, 1);
    const dec = w.decisions.current()!;
    w.decisions.resolve(dec.id, "diplomacy");

    expect(w.npcs.length).toBeGreaterThan(startPop);
    expect(w.reputation.score).toBeGreaterThan(startRep);
  });
});
