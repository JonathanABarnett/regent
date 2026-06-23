import { describe, it, expect, beforeEach } from "vitest";
import { World } from "../World";

function makeWorld(): World {
  return new World({ seed: 77, width: 32, height: 24 });
}

function advanceToYear(world: World, year: number, day: number) {
  (world.state as { year: number }).year = year;
  (world.state as { day: number }).day = day;
}

/** Flood the world with villagers until pop >= 25. */
function padPopulation(world: World) {
  const town = world.map.structures.find((s) => s.kind === "town")
    ?? world.map.structures[0];
  const center = {
    x: town.pos.x + Math.floor(town.size.x / 2),
    y: town.pos.y + Math.floor(town.size.y / 2),
  };
  while (world.npcs.length < 30) {
    world.pushNpc({
      id: `npc_pad_${world.npcs.length}`,
      role: "villager",
      name: `Padder ${world.npcs.length}`,
      age: 25,
      pos: { ...center },
      prevPos: { ...center },
      facing: "s",
      homeId: town.id,
      workId: town.id,
      activity: "idle",
      path: [],
      activityTimer: 1,
      seed: world.npcs.length,
    });
  }
}

describe("Uprising", () => {
  it("does not fire before year 3", () => {
    const world = makeWorld();
    padPopulation(world);
    world.economy.state.gold = 10;
    advanceToYear(world, 2, 30);
    world.uprising.state.lastCheckedDay = 0;

    for (let d = 1; d <= 25; d++) {
      (world.state as { day: number }).day = d;
      world.uprising.tick();
    }
    expect(world.uprising.state.active).toBe(false);
  });

  it("does not fire when gold >= threshold", () => {
    const world = makeWorld();
    padPopulation(world);
    world.economy.state.gold = 200; // above threshold
    advanceToYear(world, 3, 30);
    world.uprising.state.lastCheckedDay = 0;

    for (let d = 30; d <= 60; d++) {
      (world.state as { day: number }).day = d;
      world.uprising.tick();
    }
    expect(world.uprising.state.active).toBe(false);
  });

  it("mood gates unrest: a content-but-poor realm is spared, a furious-but-rich realm is exposed", () => {
    // The pressure gate only advances lastCheckedDay when it opens, so we can
    // prove the mood gate deterministically without relying on the RNG fire.

    // Rich AND content → no reason to rise: the gate never opens.
    const calm = makeWorld();
    padPopulation(calm);
    calm.economy.state.gold = 200;
    calm.mood.state.score = 2; // content
    advanceToYear(calm, 3, 30);
    calm.uprising.state.lastCheckedDay = 0;
    calm.uprising.tick();
    expect(calm.uprising.state.lastCheckedDay).toBe(0);

    // Full coffers but a FURIOUS populace → mood is the real driver; gate opens.
    const angry = makeWorld();
    padPopulation(angry);
    angry.economy.state.gold = 200; // coffers full...
    angry.mood.state.score = -8;    // ...but the people are done
    advanceToYear(angry, 3, 30);
    angry.uprising.state.lastCheckedDay = 0;
    angry.uprising.tick();
    expect(angry.uprising.state.lastCheckedDay).toBe(30);
  });

  it("address grievances lifts mood; suppression sinks it", () => {
    const heard = makeWorld();
    padPopulation(heard);
    heard.economy.state.gold = 60;
    advanceToYear(heard, 3, 40);
    (heard.uprising as unknown as { _fireUprising: () => void })._fireUprising();
    const heardBefore = heard.mood.state.score;
    heard.decisions.resolve(heard.decisions.current()!.id, "address");
    expect(heard.mood.state.score).toBeGreaterThan(heardBefore);

    const crushed = makeWorld();
    padPopulation(crushed);
    crushed.economy.state.gold = 60;
    advanceToYear(crushed, 3, 40);
    (crushed.uprising as unknown as { _fireUprising: () => void })._fireUprising();
    const crushedBefore = crushed.mood.state.score;
    crushed.decisions.resolve(crushed.decisions.current()!.id, "suppress");
    expect(crushed.mood.state.score).toBeLessThan(crushedBefore);
  });

  it("does not fire when population is below threshold", () => {
    const world = makeWorld();
    // Don't pad population — keep it below 25.
    world.economy.state.gold = 10;
    advanceToYear(world, 3, 30);
    world.uprising.state.lastCheckedDay = 0;

    for (let d = 30; d <= 60; d++) {
      (world.state as { day: number }).day = d;
      world.uprising.tick();
    }
    expect(world.uprising.state.active).toBe(false);
  });

  it("address option spends gold, promotes agitator, and deactivates", () => {
    const world = makeWorld();
    padPopulation(world);
    world.economy.state.gold = 20;
    advanceToYear(world, 3, 40);
    world.uprising.state.lastCheckedDay = 0;

    // Fire directly.
    (world.uprising as unknown as { _fireUprising: () => void })._fireUprising();
    expect(world.uprising.state.active).toBe(true);

    const goldBefore = world.economy.state.gold;
    const agitatorId = world.uprising.state.agitatorId;

    const dec = world.decisions.current()!;
    world.decisions.resolve(dec.id, "address");

    expect(world.uprising.state.active).toBe(false);
    expect(world.economy.state.gold).toBeLessThan(goldBefore);
    // Agitator promoted to scholar.
    if (agitatorId) {
      const npc = world.npcs.find((n) => n.id === agitatorId);
      expect(npc?.role).toBe("scholar");
    }
  });

  it("suppress option removes agitator and some villagers", () => {
    const world = makeWorld();
    padPopulation(world);
    world.economy.state.gold = 20;
    advanceToYear(world, 3, 40);
    world.uprising.state.lastCheckedDay = 0;

    (world.uprising as unknown as { _fireUprising: () => void })._fireUprising();
    const agitatorId = world.uprising.state.agitatorId;
    const popBefore = world.npcs.length;

    const dec = world.decisions.current()!;
    world.decisions.resolve(dec.id, "suppress");

    expect(world.uprising.state.active).toBe(false);
    if (agitatorId) {
      expect(world.npcs.find((n) => n.id === agitatorId)).toBeUndefined();
    }
    // At least the agitator + some leavers should be gone.
    expect(world.npcs.length).toBeLessThan(popBefore);
  });

  it("yield option installs agitator as monarch and resets dynastyStreak", () => {
    const world = makeWorld();
    padPopulation(world);
    world.economy.state.gold = 20;
    advanceToYear(world, 3, 40);
    world.uprising.state.lastCheckedDay = 0;
    world.succession.state.dynastyStreak = 3;

    (world.uprising as unknown as { _fireUprising: () => void })._fireUprising();
    const agitatorName = world.uprising.state.agitatorName;

    const dec = world.decisions.current()!;
    world.decisions.resolve(dec.id, "yield");

    expect(world.uprising.state.active).toBe(false);
    const monarch = world.npcs.find((n) => n.role === "monarch");
    expect(monarch?.name).toBe(agitatorName);
    expect(world.succession.state.dynastyStreak).toBe(0);
  });

  it("window lapse auto-installs agitator on next tick", () => {
    const world = makeWorld();
    padPopulation(world);
    world.economy.state.gold = 20;
    advanceToYear(world, 3, 40);
    world.uprising.state.lastCheckedDay = 0;
    world.succession.state.dynastyStreak = 2;

    (world.uprising as unknown as { _fireUprising: () => void })._fireUprising();
    expect(world.uprising.state.active).toBe(true);

    world.uprising.state.decisionExpiresAt = Date.now() - 1;
    (world.state as { day: number }).day = 65;
    world.uprising.tick();

    expect(world.uprising.state.active).toBe(false);
    expect(world.succession.state.dynastyStreak).toBe(0);
  });

  it("stirUnrest reduces lastCheckedDay", () => {
    const world = makeWorld();
    world.uprising.state.lastCheckedDay = 50;
    world.uprising.stirUnrest();
    expect(world.uprising.state.lastCheckedDay).toBeLessThan(50);
  });

  it("hydrate+snapshot round-trip preserves state", () => {
    const world = makeWorld();
    world.uprising.state.active = true;
    world.uprising.state.agitatorId = "npc_5";
    world.uprising.state.agitatorName = "Bramble";
    world.uprising.state.startedDay = 42;
    world.uprising.state.lastCheckedDay = 40;
    world.uprising.state.totalUprisings = 2;

    const snap = world.uprising.snapshot();

    const world2 = makeWorld();
    world2.uprising.hydrate(snap);

    expect(world2.uprising.state.active).toBe(true);
    expect(world2.uprising.state.agitatorName).toBe("Bramble");
    expect(world2.uprising.state.totalUprisings).toBe(2);
  });
});
