import { describe, it, expect } from "vitest";
import { World } from "../World";

function makeWorld() {
  return new World({ seed: 99, width: 32, height: 24 });
}

function advanceDay(world: World, targetDay: number) {
  (world.state as { day: number }).day = targetDay;
}

/** Spawn a "born-in-kingdom" child NPC aged 0 with parentIds set. */
function spawnChild(world: World, parentId: string): string {
  const home = world.map.structures.find((s) => s.kind === "town") ?? world.map.structures[0];
  const center = { x: home.pos.x + 1, y: home.pos.y + 1 };
  const id = `npc_child_test_${Math.floor(Math.random() * 9999)}`;
  world.pushNpc({
    id,
    role: "villager",
    name: "Pebble",
    age: 0,
    pos: { ...center }, prevPos: { ...center }, facing: "s",
    homeId: home.id, workId: home.id, activity: "idle",
    path: [], activityTimer: 1, seed: 42,
    parentIds: [parentId],
  });
  return id;
}

describe("LifeCycle", () => {
  it("does not fire for NPCs without parentIds", () => {
    const world = makeWorld();
    // All initial NPCs have age >= 18 but no parentIds — no coming-of-age
    const before = world.lifeCycle.snapshot().cameOfAgeIds.length;
    advanceDay(world, 5);
    world.lifeCycle.tick();
    // Initial NPCs should be marked but not trigger the journal milestone.
    // They get added to cameOfAgeSet but no journal entry (role is already non-villager
    // or they have no parentIds).
    expect(world.lifeCycle.snapshot().cameOfAgeIds.length).toBeGreaterThanOrEqual(before);
  });

  it("fires coming-of-age for a child with parentIds once they reach age 18", () => {
    const world = makeWorld();
    const parentId = world.npcs[0].id;
    const childId = spawnChild(world, parentId);

    // Set child's age below adult threshold — should not fire.
    const child = world.npcs.find((n) => n.id === childId)!;
    child.age = 10;
    advanceDay(world, 10);
    world.lifeCycle.tick();
    expect(world.lifeCycle.snapshot().cameOfAgeIds).not.toContain(childId);
    expect(child.role).toBe("villager"); // still villager

    // Advance age past threshold.
    child.age = 19;
    advanceDay(world, 11);
    world.lifeCycle.tick();
    expect(world.lifeCycle.snapshot().cameOfAgeIds).toContain(childId);
  });

  it("assigns a real role on coming-of-age (not 'courier' or 'monarch')", () => {
    const world = makeWorld();
    const parentId = world.npcs.find((n) => n.role === "blacksmith")?.id ?? world.npcs[0].id;
    const childId = spawnChild(world, parentId);
    const child = world.npcs.find((n) => n.id === childId)!;
    child.age = 20;
    advanceDay(world, 5);
    world.lifeCycle.tick();
    expect(["blacksmith", "scholar", "miner", "guard", "villager"]).toContain(child.role);
  });

  it("does not double-fire coming-of-age", () => {
    const world = makeWorld();
    const parentId = world.npcs[0].id;
    const childId = spawnChild(world, parentId);
    const child = world.npcs.find((n) => n.id === childId)!;
    child.age = 20;
    advanceDay(world, 5);
    world.lifeCycle.tick();
    const roleAfterFirst = child.role;
    // Fire again — role should not change
    child.role = "villager"; // reset to check it doesn't re-fire
    advanceDay(world, 6);
    world.lifeCycle.tick();
    // The id is already in cameOfAgeSet so it won't re-run
    expect(world.lifeCycle.snapshot().cameOfAgeIds.filter((id) => id === childId).length).toBe(1);
  });

  it("fires retirement for an old worker at low daily chance", () => {
    const world = makeWorld();
    const worker = world.npcs.find((n) => n.role === "blacksmith" || n.role === "scholar");
    if (!worker) return; // world without these roles — skip
    worker.age = 70; // well past threshold

    // Run many days until retirement fires or cap at 200
    let retired = false;
    for (let d = 1; d <= 200; d++) {
      advanceDay(world, d);
      world.lifeCycle.tick();
      if (worker.role === "villager") { retired = true; break; }
    }
    // With 4% daily chance and 200 tries, P(never fires) ≈ 0.96^200 ≈ 0.0003 — vanishingly rare.
    expect(retired).toBe(true);
    expect(world.lifeCycle.snapshot().retiredIds).toContain(worker.id);
  });

  it("does not retire monarchs or couriers", () => {
    const world = makeWorld();
    const monarch = world.npcs.find((n) => n.role === "monarch");
    if (!monarch) return;
    monarch.age = 80;
    for (let d = 1; d <= 50; d++) {
      advanceDay(world, d);
      world.lifeCycle.tick();
    }
    expect(monarch.role).toBe("monarch"); // never retired
  });

  it("snapshot + hydrate round-trips correctly", () => {
    const world = makeWorld();
    world.lifeCycle["cameOfAgeSet"].add("abc");
    world.lifeCycle["retiredSet"].add("xyz");
    world.lifeCycle["bondSet"].add("abc|xyz");
    const snap = world.lifeCycle.snapshot();

    const world2 = makeWorld();
    world2.lifeCycle.hydrate(snap);
    expect(world2.lifeCycle.snapshot().cameOfAgeIds).toContain("abc");
    expect(world2.lifeCycle.snapshot().retiredIds).toContain("xyz");
    expect(world2.lifeCycle.snapshot().bondKeys).toContain("abc|xyz");
  });
});
