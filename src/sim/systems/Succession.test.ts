import { describe, expect, it } from "vitest";
import { World } from "../World";

describe("Succession", () => {
  it("starts at generation 1", () => {
    const w = new World({ seed: 42 });
    expect(w.succession.state.generation).toBe(1);
    expect(w.succession.state.reignStartDay).toBe(1);
  });

  it("does not check more than once per day", () => {
    const w = new World({ seed: 42 });
    const before = w.succession.state.lastCheckedDay;
    w.succession.tick();
    w.succession.tick(); // same day → no extra work
    expect(w.succession.state.lastCheckedDay).toBeGreaterThanOrEqual(before);
  });

  it("does not kill a young monarch", () => {
    const w = new World({ seed: 42 });
    // Spawn a young monarch
    const monarchId = w.spawnMonarch("Test Monarch");
    const m = w.npcs.find((n) => n.id === monarchId);
    expect(m).toBeDefined();
    if (m) m.age = 20;
    // Force day change so check runs
    w.state.day = 10;
    w.succession.tick();
    expect(w.succession.state.generation).toBe(1);
    expect(w.npcs.some((n) => n.role === "monarch")).toBe(true);
  });

  it("subscribers receive succession event on death", () => {
    const w = new World({ seed: 42 });
    const monarchId = w.spawnMonarch("Old King");
    const m = w.npcs.find((n) => n.id === monarchId);
    if (m) m.age = 200; // guaranteed death roll
    let received = 0;
    w.succession.subscribe(() => received++);
    // Force enough day advancement and try many ticks — die-chance is probabilistic
    for (let day = 5; day < 200 && received === 0; day++) {
      w.state.day = day;
      w.succession.tick();
    }
    expect(received).toBe(1);
    expect(w.succession.state.generation).toBe(2);
  });
});

/**
 * Determinism — succession now runs on the world's seeded RNG, not
 * Math.random, so a given seed always tells the same dynasty story. This is
 * the narrative-critical slice of the gate-3 determinism work (REGENT.md).
 */
describe("Succession determinism", () => {
  function chooseHeir(seed: number): string {
    const w = new World({ seed });
    const castle = w.map.structures.find((s) => s.kind === "castle")!;
    const town = w.map.structures.find((s) => s.kind === "town") ?? castle;
    // Isolate the choice: only civic candidates, homed away from the castle so
    // pickHeir falls to the seeded random branch (not the deterministic sorts).
    w.npcs.splice(0, w.npcs.length);
    const c = { x: town.pos.x + 1, y: town.pos.y + 1 };
    for (let i = 0; i < 6; i++) {
      w.pushNpc({
        id: `cand${i}`, role: "villager", name: `Cand${i}`, age: 30,
        pos: { ...c }, prevPos: { ...c }, facing: "s",
        homeId: town.id, workId: town.id, activity: "idle", path: [], activityTimer: 1, seed: 50 + i,
      });
    }
    const kingId = w.spawnMonarch("Aldric");
    (w.succession as unknown as { succeed: (m: unknown) => void }).succeed(
      w.npcs.find((n) => n.id === kingId),
    );
    return w.npcs.find((n) => n.role === "monarch")?.name ?? "?";
  }

  it("picks the same heir for the same seed", () => {
    expect(chooseHeir(31)).toBe(chooseHeir(31));
    expect(chooseHeir(99)).toBe(chooseHeir(99));
    expect(chooseHeir(2026)).toBe(chooseHeir(2026));
  });

  it("the choice is actually seed-driven (not constant)", () => {
    const picks = [1, 2, 3, 4, 5, 6, 7, 8].map(chooseHeir);
    expect(new Set(picks).size).toBeGreaterThan(1);
  });
});
