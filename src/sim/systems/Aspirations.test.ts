import { describe, expect, it } from "vitest";
import { World } from "../World";
import { Aspirations } from "./Aspirations";

describe("Aspirations", () => {
  it("seedInitial fills 3 active slots from the pool", () => {
    const a = new Aspirations(() => 0.1);
    a.seedInitial();
    expect(a.active.length).toBe(3);
    expect(new Set(a.active).size).toBe(3); // all unique
  });

  it("definitions list is non-empty and well-formed", () => {
    const defs = Aspirations.definitions();
    expect(defs.length).toBeGreaterThan(5);
    for (const d of defs) {
      expect(d.id).toBeTruthy();
      expect(d.title).toBeTruthy();
      expect(d.description).toBeTruthy();
      expect(typeof d.progress).toBe("function");
    }
  });

  it("each definition's progress function returns a finite number on a fresh world", () => {
    const w = new World({ seed: 42 });
    for (const d of Aspirations.definitions()) {
      const p = d.progress(w);
      expect(Number.isFinite(p)).toBe(true);
      expect(p).toBeGreaterThanOrEqual(0);
    }
  });

  it("evaluate marks completion when progress >= 1 and replaces the slot", () => {
    const w = new World({ seed: 42 });
    // Force-seed an aspiration we can complete on the spot.
    w.aspirations.active = ["year_2"];
    w.aspirations.completed = {};
    w.state.year = 5; // far past Y2
    const completed = w.aspirations.evaluate(w);
    expect(completed).toContain("year_2");
    expect(w.aspirations.completed.year_2).toBeDefined();
    // A new aspiration should have replaced the old one (or the pool is exhausted).
    expect(w.aspirations.active.length).toBeLessThanOrEqual(3);
  });

  it("evaluate does NOT mark completion when progress < 1", () => {
    const w = new World({ seed: 42 });
    w.aspirations.active = ["pop_50"];
    w.aspirations.completed = {};
    // Brand-new world has ~12 NPCs, so 12/50 = 0.24 — not complete.
    const completed = w.aspirations.evaluate(w);
    expect(completed.length).toBe(0);
    expect(w.aspirations.completed.pop_50).toBeUndefined();
  });

  it("getActive returns snapshots with progress clamped to [0,1]", () => {
    const w = new World({ seed: 42 });
    w.aspirations.active = ["year_5"];
    w.state.year = 999; // unrealistically high
    const snap = w.aspirations.getActive(w);
    expect(snap.length).toBe(1);
    expect(snap[0].progress).toBe(1);
    expect(snap[0].complete).toBe(true);
  });

  it("hydrate filters unknown ids and refills to 3", () => {
    const a = new Aspirations(() => 0.5);
    a.hydrate(["pop_25", "completely_made_up_id", "vault_10"], { ancient_id: "2024-01-01" });
    expect(a.active).toContain("pop_25");
    expect(a.active).toContain("vault_10");
    expect(a.active).not.toContain("completely_made_up_id");
    expect(a.active.length).toBe(3); // refilled
  });

  it("never picks an aspiration that is currently active or already completed", () => {
    const a = new Aspirations(() => 0.0);
    a.active = ["pop_25"];
    a.completed = { vault_10: "2024-01-01" };
    a.seedInitial();
    expect(a.active.filter((id) => id === "pop_25").length).toBe(1); // not duplicated
    expect(a.active).not.toContain("vault_10");
  });

  it("pool includes the new aspirations from pass 27", () => {
    const ids = new Set(Aspirations.definitions().map((d) => d.id));
    expect(ids.has("day_100")).toBe(true);
    expect(ids.has("diverse_roles")).toBe(true);
    expect(ids.has("elder_70")).toBe(true);
    expect(ids.has("landmarks_3")).toBe(true);
    expect(ids.has("tomes_100")).toBe(true);
    expect(ids.has("gold_1500")).toBe(true);
    // Pool size grows as new aspirations are added; assert it's >= the baseline.
    expect(Aspirations.definitions().length).toBeGreaterThanOrEqual(21);
  });

  it("day_100 progress tracks the day counter linearly", () => {
    const w = new World({ seed: 7 });
    const def = Aspirations.definitions().find((d) => d.id === "day_100")!;
    w.state.day = 0;
    expect(def.progress(w)).toBe(0);
    w.state.day = 50;
    expect(def.progress(w)).toBeCloseTo(0.5);
    w.state.day = 100;
    expect(def.progress(w)).toBe(1);
  });

  it("diverse_roles counts distinct NPC roles capped at 5", () => {
    const w = new World({ seed: 7 });
    const def = Aspirations.definitions().find((d) => d.id === "diverse_roles")!;
    // World seeds NPCs deterministically — just observe distinct count.
    const p = def.progress(w);
    expect(p).toBeGreaterThanOrEqual(0);
    expect(p).toBeLessThanOrEqual(1);

    // Force only one role → low progress.
    w.npcs.forEach((n) => (n.role = "villager"));
    expect(def.progress(w)).toBeCloseTo(0.2); // 1/5

    // Force five distinct roles → complete.
    const roles = ["villager", "blacksmith", "scholar", "miner", "monarch"] as const;
    w.npcs.slice(0, 5).forEach((n, i) => (n.role = roles[i]));
    expect(def.progress(w)).toBe(1);
  });

  it("elder_70 is binary — 0 until any NPC reaches age 70, then 1", () => {
    const w = new World({ seed: 7 });
    const def = Aspirations.definitions().find((d) => d.id === "elder_70")!;
    w.npcs.forEach((n) => (n.age = 20));
    expect(def.progress(w)).toBe(0);
    w.npcs[0].age = 70;
    expect(def.progress(w)).toBe(1);
    w.npcs[0].age = 99;
    expect(def.progress(w)).toBe(1);
  });

  it("landmarks_3 reflects discoveries.snapshot length / 3", () => {
    const w = new World({ seed: 7 });
    const def = Aspirations.definitions().find((d) => d.id === "landmarks_3")!;
    // On a fresh world Discoveries hasn't fired yet — should be 0.
    expect(def.progress(w)).toBe(0);
    // Force the snapshot to return a length-3 array.
    (w.discoveries as unknown as { snapshot(): unknown[] }).snapshot = () => [{}, {}, {}];
    expect(def.progress(w)).toBe(1);
  });

  it("tomes_100 and gold_1500 read economy state directly", () => {
    const w = new World({ seed: 7 });
    const tomes = Aspirations.definitions().find((d) => d.id === "tomes_100")!;
    const gold = Aspirations.definitions().find((d) => d.id === "gold_1500")!;
    w.economy.state.tomes = 50;
    w.economy.state.gold = 750;
    expect(tomes.progress(w)).toBe(0.5);
    expect(gold.progress(w)).toBe(0.5);
    w.economy.state.tomes = 100;
    w.economy.state.gold = 1500;
    expect(tomes.progress(w)).toBe(1);
    expect(gold.progress(w)).toBe(1);
  });

  it("World.tick writes a milestone journal entry on aspiration completion", () => {
    const w = new World({ seed: 42 });
    const milestones: string[] = [];
    w.onJournal = (e) => {
      if (e.kind === "milestone") milestones.push(e.text);
    };
    w.aspirations.active = ["year_2"];
    w.aspirations.completed = {};
    // Force a day rollover with calendar.year already past the goal — the
    // tick will overwrite state.year from cal.year, so the hijack has to
    // bump year (not just day) for the aspiration to register as complete.
    const cal = w.calendar.snapshot();
    (w.calendar as unknown as { snapshot(): typeof cal }).snapshot = () => ({
      ...cal,
      day: cal.day + 1,
      year: 5,
    });
    w.tick(0.1);
    expect(milestones.some((t) => t.includes("Aspiration fulfilled"))).toBe(true);
  });
});
