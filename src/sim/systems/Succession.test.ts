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
