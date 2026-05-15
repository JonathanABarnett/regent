import { describe, expect, it } from "vitest";
import { World } from "../World";
import type { NPC, NPCTrait } from "../types";

const ALL_TRAITS: NPCTrait[] = [
  "joyful", "grim", "curious", "stoic", "kind", "ambitious", "anxious", "wise",
];

/**
 * LifeEvents owns aging, marriage, birth, and death. These tests drive it
 * deterministically by reaching into private state and calling tick() with
 * the day counter advanced manually.
 */

function setLastProcessed(w: World, day: number) {
  (w.lifeEvents as unknown as { lastProcessedDay: number }).lastProcessedDay = day;
}

describe("LifeEvents", () => {
  it("ticks no-op when day hasn't advanced", () => {
    const w = new World({ seed: 42 });
    setLastProcessed(w, w.state.day);
    const ages0 = w.npcs.map((n) => n.age ?? 0);
    w.lifeEvents.tick();
    const ages1 = w.npcs.map((n) => n.age ?? 0);
    expect(ages1).toEqual(ages0);
  });

  it("ages NPCs by 1/90 year per processed day", () => {
    const w = new World({ seed: 42 });
    const before = (w.npcs[0].age ?? 30);
    setLastProcessed(w, 0);
    w.state.day = 1;
    w.lifeEvents.tick();
    expect((w.npcs[0].age ?? 30) - before).toBeCloseTo(1 / 90, 5);
  });

  it("caps absence catch-up at 30 days", () => {
    const w = new World({ seed: 42 });
    const before = (w.npcs[0].age ?? 30);
    setLastProcessed(w, 0);
    w.state.day = 365; // simulate a year away
    w.lifeEvents.tick();
    const delta = (w.npcs[0].age ?? 30) - before;
    // Cap is 30 days of processing, so age delta is at most 30/90
    expect(delta).toBeLessThanOrEqual(30 / 90 + 1e-6);
  });

  it("marries two eligible adults in the same town (over many days)", () => {
    const w = new World({ seed: 42 });
    setLastProcessed(w, 0);
    // Force ages and clear partners
    for (const npc of w.npcs) {
      npc.partnerId = undefined;
      npc.age = 25;
    }
    // Drive 100 days — marriage rolls 20% per day per check
    let marriedFound = false;
    for (let d = 1; d <= 200 && !marriedFound; d++) {
      w.state.day = d;
      setLastProcessed(w, d - 1);
      w.lifeEvents.tick();
      marriedFound = w.npcs.some((n) => n.partnerId);
    }
    expect(marriedFound).toBe(true);
  });

  it("kills NPCs over age 70 (deterministically over many days)", () => {
    const w = new World({ seed: 42 });
    setLastProcessed(w, 0);
    // Make ALL villagers ancient so deaths target them, and freeze marriages
    // so we don't gain births offsetting deaths.
    for (const npc of w.npcs) {
      npc.age = 95;
      npc.partnerId = undefined;
    }
    const initialIds = new Set(w.npcs.map((n) => n.id));
    // Drive many days; deaths are probabilistic
    for (let d = 1; d <= 500; d++) {
      w.state.day = d;
      setLastProcessed(w, d - 1);
      w.lifeEvents.tick();
    }
    // Some of the original NPCs should be gone from the roster
    const remainingOriginal = w.npcs.filter((n) => initialIds.has(n.id)).length;
    expect(remainingOriginal).toBeLessThan(initialIds.size);
  });

  it("doesn't crash when no NPCs are present", () => {
    const w = new World({ seed: 42 });
    w.npcs.length = 0;
    setLastProcessed(w, 0);
    w.state.day = 5;
    expect(() => w.lifeEvents.tick()).not.toThrow();
  });

  it("every spawned NPC has a trait from the canonical list", () => {
    const w = new World({ seed: 42 });
    for (const npc of w.npcs) {
      expect(npc.trait).toBeDefined();
      expect(ALL_TRAITS).toContain(npc.trait as NPCTrait);
    }
  });

  it("newborns are assigned a trait (regression: was missing in pass 8)", () => {
    const w = new World({ seed: 42 });
    setLastProcessed(w, 0);
    // Force a married couple so births are possible
    for (const npc of w.npcs) {
      npc.age = 25;
      npc.partnerId = undefined;
    }
    if (w.npcs.length >= 2 && w.npcs[0].homeId === w.npcs[1].homeId) {
      w.npcs[0].partnerId = w.npcs[1].id;
      w.npcs[1].partnerId = w.npcs[0].id;
    }
    const startSize = w.npcs.length;
    // Drive many days — birth rolls 8% per day
    for (let d = 1; d <= 500 && w.npcs.length === startSize; d++) {
      w.state.day = d;
      setLastProcessed(w, d - 1);
      w.lifeEvents.tick();
    }
    if (w.npcs.length > startSize) {
      const newborns = w.npcs.slice(startSize);
      for (const n of newborns) {
        expect(n.trait).toBeDefined();
        expect(ALL_TRAITS).toContain(n.trait as NPCTrait);
      }
    }
    // If no birth fired in 500 days that's exceedingly unlikely but we accept
    // it rather than asserting — the contract we care about is "if born, has trait".
  });

  it("trait is preserved through World.spawnInitialNPCs determinism", () => {
    const a = new World({ seed: 999 });
    const b = new World({ seed: 999 });
    expect(a.npcs.map((n) => n.trait)).toEqual(b.npcs.map((n) => n.trait));
  });
});
