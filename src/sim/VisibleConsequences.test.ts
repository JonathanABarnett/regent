import { describe, expect, it } from "vitest";
import { World } from "./World";
import { raiseHomestead } from "./systems/Homestead";
import { takeNpcLife } from "./systems/Mortality";

/**
 * "Choices visibly + permanently change the world" — the root fix for
 * "nothing I do matters." Welcoming a family raises a cottage that stays on
 * the map; a hard first-reign call can cost a named villager their life,
 * leaving a grave by the keep.
 */

describe("raiseHomestead", () => {
  it("places a homestead structure near the castle", () => {
    const w = new World({ seed: 7 });
    const before = w.map.structures.filter((s) => s.kind === "homestead").length;
    const cottage = raiseHomestead(w, "Marlow");
    expect(cottage).not.toBeNull();
    expect(cottage!.kind).toBe("homestead");
    expect(cottage!.name).toContain("Marlow");
    const after = w.map.structures.filter((s) => s.kind === "homestead").length;
    expect(after).toBe(before + 1);
    // It registers a landmark (so the journal entry can navigate to it).
    expect(w.map.landmarks.has(cottage!.id)).toBe(true);
    // Footprint is walkable.
    const t = w.map.tiles[cottage!.pos.y * w.map.width + cottage!.pos.x];
    expect(t?.walkable).toBe(true);
  });
});

describe("takeNpcLife", () => {
  it("removes a named villager and plants a grave", () => {
    const w = new World({ seed: 7 });
    const victim = w.npcs.find((n) => n.role !== "monarch" && !!n.name)!;
    const popBefore = w.npcs.length;
    const gravesBefore = w.map.structures.filter((s) => s.kind === "grave").length;
    const name = takeNpcLife(w, victim.id, "A test loss.");
    expect(name).toBe(victim.name);
    expect(w.npcs.find((n) => n.id === victim.id)).toBeUndefined();
    expect(w.npcs.length).toBe(popBefore - 1);
    expect(w.map.structures.filter((s) => s.kind === "grave").length).toBe(gravesBefore + 1);
  });

  it("refuses to take the monarch", () => {
    const w = new World({ seed: 7 });
    const monarchId = w.spawnMonarch("Rex");
    const popBefore = w.npcs.length;
    expect(takeNpcLife(w, monarchId, "should not happen")).toBeNull();
    expect(w.npcs.length).toBe(popBefore);
  });

  it("returns null for an unknown id", () => {
    const w = new World({ seed: 7 });
    expect(takeNpcLife(w, "ghost", "x")).toBeNull();
  });
});

describe("Welcome Petition raises a real home", () => {
  it("the 'home' option puts a cottage on the map", () => {
    const w = new World({ seed: 11 });
    w.consequences.proposeWelcomePetitionNow();
    const dec = w.decisions.current();
    expect(dec).toBeTruthy();
    expect(dec!.options.some((o) => o.id === "home")).toBe(true);
    const before = w.map.structures.filter((s) => s.kind === "homestead").length;
    w.decisions.resolve(dec!.id, "home");
    const after = w.map.structures.filter((s) => s.kind === "homestead").length;
    expect(after).toBe(before + 1);
  });

  it("declining changes no structures", () => {
    const w = new World({ seed: 11 });
    w.consequences.proposeWelcomePetitionNow();
    const dec = w.decisions.current()!;
    const before = w.map.structures.length;
    w.decisions.resolve(dec.id, "decline");
    expect(w.map.structures.length).toBe(before);
  });
});

describe("Recurring court decisions steward the world too", () => {
  it("welcoming a wanderer raises a real cottage and adds a villager", () => {
    // The gate-petition archetype is one of ~10 random court decisions;
    // search seeds for one whose first proposed matter offers "welcome".
    for (let seed = 1; seed <= 120; seed++) {
      const w = new World({ seed });
      w.quests.proposeCheckInMatter();
      const dec = w.decisions.current();
      const welcome = dec?.options.find((o) => o.id === "welcome");
      if (!welcome) continue;
      const homesteadsBefore = w.map.structures.filter((s) => s.kind === "homestead").length;
      const popBefore = w.npcs.length;
      w.decisions.resolve(dec!.id, "welcome");
      // A cottage rose AND a soul arrived — a recurring decision left a
      // permanent, visible mark, not just journal prose.
      expect(w.map.structures.filter((s) => s.kind === "homestead").length).toBe(homesteadsBefore + 1);
      expect(w.npcs.length).toBe(popBefore + 1);
      return;
    }
    throw new Error("no gate-petition decision surfaced across 120 seeds");
  });
});

describe("Every court decision is a steward's choice (hints + stakes)", () => {
  // Drive a single early-game court decision deterministically by seed.
  function earlyDecision(seed: number) {
    const w = new World({ seed });
    w.quests.proposeCheckInMatter();
    return { w, dec: w.decisions.current() };
  }
  // Force a late-game court decision (normally gated to year >= 2).
  function lateDecision(seed: number) {
    const w = new World({ seed });
    (w.quests as unknown as { proposeLateGameDecision(): void }).proposeLateGameDecision();
    return { w, dec: w.decisions.current() };
  }

  it("every option of every court decision carries a plain-English hint", () => {
    const titles = new Set<string>();
    for (let seed = 1; seed <= 200; seed++) {
      for (const { dec } of [earlyDecision(seed), lateDecision(seed)]) {
        if (!dec) continue;
        titles.add(dec.title);
        for (const opt of dec.options) {
          // No blind picks — the charter's core-loop requirement: every
          // option states its consequence in plain English before you choose.
          expect((opt.hint ?? "").trim().length, `${dec.title} / ${opt.label}`).toBeGreaterThan(0);
        }
      }
    }
    // The sweep must actually exercise archetype variety, or a regression
    // that stops proposing decisions could pass this test silently.
    expect(titles.size).toBeGreaterThanOrEqual(8);
  });

  it("collecting the levy dips mood; waiving it lifts mood", () => {
    for (let seed = 1; seed <= 400; seed++) {
      if (earlyDecision(seed).dec?.title !== "The treasury proposes a levy") continue;

      const taxed = earlyDecision(seed);
      taxed.w.decisions.resolve(taxed.dec!.id, "tax");
      expect(taxed.w.mood.state.score).toBeLessThan(0); // the people feel it

      const waived = earlyDecision(seed);
      waived.w.decisions.resolve(waived.dec!.id, "decline");
      expect(waived.w.mood.state.score).toBeGreaterThan(0); // goodwill rises
      return;
    }
    throw new Error("no tax-levy decision surfaced across 400 seeds");
  });
});

describe("First-reign fever dilemma", () => {
  function fireFever(seed: number): World {
    const w = new World({ seed });
    w.consequences.schedule({ kind: "first_fever", fireInDays: 1 });
    w.state.day += 1;
    w.consequences.tickDay();
    return w;
  }

  it("schedules and proposes the fever decision", () => {
    const w = fireFever(3);
    const dec = w.decisions.current();
    expect(dec?.id.startsWith("first_fever")).toBe(true);
    expect(dec!.options.map((o) => o.id).sort()).toEqual(["hold_back", "send_healer"]);
  });

  it("'hold back' permanently kills the named villager and plants a grave", () => {
    const w = fireFever(3);
    const dec = w.decisions.current()!;
    const popBefore = w.npcs.length;
    const gravesBefore = w.map.structures.filter((s) => s.kind === "grave").length;
    w.decisions.resolve(dec.id, "hold_back");
    expect(w.npcs.length).toBe(popBefore - 1);
    expect(w.map.structures.filter((s) => s.kind === "grave").length).toBe(gravesBefore + 1);
  });

  it("'send healer' keeps everyone alive (default-on-expire path is the safe one)", () => {
    const w = fireFever(3);
    const dec = w.decisions.current()!;
    // The safe option must be options[0] so a timeout/default never kills.
    expect(dec.options[0].id).toBe("send_healer");
    const popBefore = w.npcs.length;
    w.decisions.resolve(dec.id, "send_healer");
    expect(w.npcs.length).toBe(popBefore);
  });
});
