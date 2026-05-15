import { describe, expect, it } from "vitest";
import { World } from "../World";

describe("Construction", () => {
  it("starts with no active build", () => {
    const w = new World({ seed: 42 });
    expect(w.construction.active).toBeNull();
  });

  it("doesn't propose builds before day 5 cooldown", () => {
    const w = new World({ seed: 42 });
    // tick a few days; nothing should be active yet
    w.construction.tick();
    expect(w.construction.active).toBeNull();
  });

  it("hydrate restores an active build", () => {
    const w = new World({ seed: 42 });
    w.construction.hydrate({
      kind: "watchtower",
      startedDay: 3,
      finishesOnDay: 7,
      pos: { x: 10, y: 10 },
    });
    expect(w.construction.active?.kind).toBe("watchtower");
    expect(w.construction.active?.finishesOnDay).toBe(7);
  });

  it("doesn't allow two active builds simultaneously", () => {
    const w = new World({ seed: 42 });
    w.construction.hydrate({
      kind: "watchtower",
      startedDay: 0,
      finishesOnDay: 10,
      pos: { x: 5, y: 5 },
    });
    // direct startBuild fails because active is set
    const def = {
      kind: "mill" as const,
      label: "Mill",
      size: { x: 2, y: 2 },
      buildDays: 5,
      goldCost: 1,
      pitch: "test",
      onFinish: () => {},
    };
    const ok = w.construction.startBuild(def);
    expect(ok).toBe(false);
  });

  it("startBuild fails when gold insufficient", () => {
    const w = new World({ seed: 42 });
    w.economy.state.gold = 5;
    const def = {
      kind: "watchtower" as const,
      label: "Watchtower",
      size: { x: 2, y: 2 },
      buildDays: 4,
      goldCost: 30,
      pitch: "",
      onFinish: () => {},
    };
    const ok = w.construction.startBuild(def);
    expect(ok).toBe(false);
  });

  it("startBuild deducts cost and sets active build", () => {
    const w = new World({ seed: 42 });
    w.economy.state.gold = 100;
    const def = {
      kind: "watchtower" as const,
      label: "Watchtower",
      size: { x: 2, y: 2 },
      buildDays: 4,
      goldCost: 30,
      pitch: "",
      onFinish: () => {},
    };
    const ok = w.construction.startBuild(def);
    expect(ok).toBe(true);
    expect(w.economy.state.gold).toBe(70);
    expect(w.construction.active?.kind).toBe("watchtower");
  });
});
