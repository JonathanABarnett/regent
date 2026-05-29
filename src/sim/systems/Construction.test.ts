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

  // ── Player-facing "Rule" panel accessors ────────────────────────────

  it("listConstructibleOptions reflects affordability against live economy", () => {
    const w = new World({ seed: 42 });
    w.economy.state.gold = 35; // enough for watchtower (30), not mill (60)
    w.economy.state.ironwork = 0;
    w.economy.state.tomes = 0;
    const opts = w.construction.listConstructibleOptions();
    const watchtower = opts.find((o) => o.kind === "watchtower");
    const mill = opts.find((o) => o.kind === "mill");
    expect(watchtower?.affordable).toBe(true);
    expect(mill?.affordable).toBe(false); // 60 gold + 4 ironwork
    // Returned data is plain (no closures) — safe for React.
    expect(typeof watchtower?.label).toBe("string");
    expect(watchtower).not.toHaveProperty("onFinish");
  });

  it("startBuildByKind starts a build the player can afford", () => {
    const w = new World({ seed: 42 });
    w.economy.state.gold = 100;
    const ok = w.construction.startBuildByKind("watchtower");
    expect(ok).toBe(true);
    expect(w.construction.active?.kind).toBe("watchtower");
    expect(w.economy.state.gold).toBe(70);
  });

  it("startBuildByKind refuses when one is already building", () => {
    const w = new World({ seed: 42 });
    w.economy.state.gold = 1000;
    expect(w.construction.startBuildByKind("watchtower")).toBe(true);
    expect(w.construction.startBuildByKind("mill")).toBe(false);
  });

  it("startBuildByKind returns false for an unknown kind", () => {
    const w = new World({ seed: 42 });
    w.economy.state.gold = 1000;
    // @ts-expect-error — deliberately passing an invalid kind
    expect(w.construction.startBuildByKind("castle")).toBe(false);
  });

  it("activeBuildInfo reports label + days left, null when idle", () => {
    const w = new World({ seed: 42 });
    expect(w.construction.activeBuildInfo()).toBeNull();
    w.economy.state.gold = 100;
    w.construction.startBuildByKind("watchtower");
    const info = w.construction.activeBuildInfo();
    expect(info?.label).toBe("Watchtower");
    expect(info?.daysLeft).toBeGreaterThan(0);
  });
});
