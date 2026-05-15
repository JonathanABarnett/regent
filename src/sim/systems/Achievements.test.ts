import { describe, expect, it } from "vitest";
import { World } from "../World";
import { Achievements } from "./Achievements";
import { makeEvent } from "../events/EventSchema";

function makeAchievements(w: World, alreadyUnlocked: Record<string, string> = {}) {
  const unlocks: Array<{ id: string; title: string; description: string }> = [];
  const ach = new Achievements(w, w.journal, alreadyUnlocked, (id, title, description) =>
    unlocks.push({ id, title, description }),
  );
  return { ach, unlocks };
}

describe("Achievements", () => {
  it("definitions list is non-empty and stable", () => {
    const defs = Achievements.definitions();
    expect(defs.length).toBeGreaterThan(10);
    expect(defs.every((d) => d.id && d.title && d.description && d.check)).toBe(true);
  });

  it("counters increment for courier / forge / storm events", () => {
    const w = new World({ seed: 42 });
    const { ach } = makeAchievements(w);
    w.publish(makeEvent("courier", { source: "internal" }));
    w.publish(makeEvent("forge", { source: "internal" }));
    w.publish(makeEvent("storm", { source: "internal" }));
    expect(ach.totalCouriers).toBe(1);
    expect(ach.totalForges).toBe(1);
    expect(ach.totalStorms).toBe(1);
  });

  it("evaluate unlocks first_courier after one courier", () => {
    const w = new World({ seed: 42 });
    const { ach, unlocks } = makeAchievements(w);
    w.publish(makeEvent("courier", { source: "internal" }));
    ach.evaluate(0);
    expect(unlocks.some((u) => u.id === "first_courier")).toBe(true);
  });

  it("doesn't double-unlock an already-unlocked achievement", () => {
    const w = new World({ seed: 42 });
    const { ach, unlocks } = makeAchievements(w, {
      first_courier: new Date().toISOString(),
    });
    w.publish(makeEvent("courier", { source: "internal" }));
    ach.evaluate(0);
    expect(unlocks.some((u) => u.id === "first_courier")).toBe(false);
  });

  it("evaluate is safe with no events", () => {
    const w = new World({ seed: 42 });
    const { ach, unlocks } = makeAchievements(w);
    ach.evaluate(0);
    // Some achievements (day_7, year_1) don't require any events
    // and may unlock immediately if the day counter is >= threshold.
    // For a brand-new world, day=1 so neither fires.
    expect(unlocks.length).toBe(0);
  });

  it("unlocks day_7 once world.state.day >= 7", () => {
    const w = new World({ seed: 42 });
    const { ach, unlocks } = makeAchievements(w);
    w.state.day = 7;
    ach.evaluate(0);
    expect(unlocks.some((u) => u.id === "day_7")).toBe(true);
  });

  it("vault_3 unlocks after 3 artifacts", () => {
    const w = new World({ seed: 42 });
    const { ach, unlocks } = makeAchievements(w);
    w.treasury.acquire("gem");
    w.treasury.acquire("scroll");
    w.treasury.acquire("relic");
    ach.evaluate(0);
    expect(unlocks.some((u) => u.id === "vault_3")).toBe(true);
  });

  it("succession_2 unlocks when generation hits 2", () => {
    const w = new World({ seed: 42 });
    const { ach, unlocks } = makeAchievements(w);
    w.succession.state.generation = 2;
    ach.evaluate(0);
    expect(unlocks.some((u) => u.id === "succession_2")).toBe(true);
  });

  it("first_building unlocks after any custom build appears in structures", () => {
    const w = new World({ seed: 42 });
    const { ach, unlocks } = makeAchievements(w);
    w.map.structures.push({
      id: "watchtower_test",
      kind: "watchtower",
      name: "Watchtower",
      pos: { x: 5, y: 5 },
      size: { x: 2, y: 2 },
    });
    ach.evaluate(0);
    expect(unlocks.some((u) => u.id === "first_building")).toBe(true);
  });

  it("recordMarriage / recordBirth / recordDeath bump counters", () => {
    const w = new World({ seed: 42 });
    const { ach } = makeAchievements(w);
    ach.recordMarriage();
    ach.recordBirth();
    ach.recordDeath();
    expect(ach.totalMarriages).toBe(1);
    expect(ach.totalBirths).toBe(1);
    expect(ach.totalDeaths).toBe(1);
  });

  it("includes at least one hidden achievement, and they unlock the same way", () => {
    const defs = Achievements.definitions();
    const hidden = defs.filter((d) => d.hidden);
    expect(hidden.length).toBeGreaterThan(0);
    // Hidden achievements must still satisfy the AchievementDef contract.
    for (const d of hidden) {
      expect(d.id).toBeTruthy();
      expect(d.title).toBeTruthy();
      expect(d.description).toBeTruthy();
      expect(typeof d.check).toBe("function");
    }
  });

  it("hidden_century unlocks at day 100", () => {
    const w = new World({ seed: 42 });
    const { ach, unlocks } = makeAchievements(w);
    w.state.day = 100;
    ach.evaluate(0);
    expect(unlocks.some((u) => u.id === "hidden_century")).toBe(true);
  });

  it("hidden_no_storms requires day>=7 AND zero storms", () => {
    const w = new World({ seed: 42 });
    const { ach, unlocks } = makeAchievements(w);
    w.state.day = 7;
    ach.evaluate(0);
    expect(unlocks.some((u) => u.id === "hidden_no_storms")).toBe(true);

    // With a storm recorded, it should NOT unlock on a fresh achievements instance.
    const w2 = new World({ seed: 42 });
    const { ach: ach2, unlocks: u2 } = makeAchievements(w2);
    w2.publish(makeEvent("storm", { source: "internal" }));
    w2.state.day = 7;
    ach2.evaluate(0);
    expect(u2.some((u) => u.id === "hidden_no_storms")).toBe(false);
  });
});
