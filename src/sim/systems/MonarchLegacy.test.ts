import { describe, it, expect } from "vitest";
import { World } from "../World";
import { reignEpithet, writeMonarchLegacy } from "./MonarchLegacy";
import type { SuccessionEvent } from "./Succession";

/**
 * Reign Summary capstone — the epithet logic + the wiring that surfaces a
 * structured summary on every monarch change, so the modal has something to show.
 */

describe("reignEpithet", () => {
  const base = { context: "natural" as const, reignDays: 100, reputation: "steady", moodTier: "content" };

  it("titles by how the throne was lost first", () => {
    expect(reignEpithet({ ...base, context: "usurper" })).toBe("the Deposed");
    expect(reignEpithet({ ...base, context: "uprising" })).toBe("the Cast Down");
    // ...even for a beloved monarch — how you LOST it dominates.
    expect(reignEpithet({ ...base, context: "usurper", reputation: "beloved" })).toBe("the Deposed");
  });

  it("titles by reign-length extremes", () => {
    expect(reignEpithet({ ...base, reignDays: 5 })).toBe("the Brief");
    expect(reignEpithet({ ...base, reignDays: 400 })).toBe("the Enduring");
  });

  it("titles by standing, then mood, then a steady default", () => {
    expect(reignEpithet({ ...base, reputation: "beloved" })).toBe("the Beloved");
    expect(reignEpithet({ ...base, reputation: "feared" })).toBe("the Iron");
    expect(reignEpithet({ ...base, reputation: "austere" })).toBe("the Stern");
    expect(reignEpithet({ ...base, moodTier: "anxious" })).toBe("the Troubled");
    expect(reignEpithet({ ...base, moodTier: "celebrating" })).toBe("the Generous");
    expect(reignEpithet({ ...base, reignDays: 200 })).toBe("the Steadfast");
    expect(reignEpithet(base)).toBe("the Steady");
  });
});

describe("writeMonarchLegacy", () => {
  it("returns a structured summary alongside the journal/vault prose", () => {
    const w = new World({ seed: 4 });
    const s = writeMonarchLegacy(w, "Aldric", 120, 1, "natural");
    expect(s.name).toBe("Aldric");
    expect(s.reignDays).toBe(120);
    expect(s.context).toBe("natural");
    expect(s.seasons.length).toBeGreaterThan(0);
    expect(s.headline.length).toBeGreaterThan(0);
    expect(s.epithet.length).toBeGreaterThan(0);
    expect(typeof s.population).toBe("number");
  });
});

describe("succession surfaces a reign summary", () => {
  it("announces summary + context on a natural death", () => {
    const w = new World({ seed: 4 });
    const castle = w.map.structures.find((s) => s.kind === "castle")!;
    const center = { x: castle.pos.x + 1, y: castle.pos.y + 1 };
    const mk = (id: string, role: string, name: string, age: number, seed: number) => ({
      id, role: role as "monarch" | "villager", name, age,
      pos: { ...center }, prevPos: { ...center }, facing: "s" as const,
      homeId: castle.id, workId: castle.id, activity: "idle" as const,
      path: [], activityTimer: 1, seed,
    });
    w.pushNpc(mk("npc_king", "monarch", "Aldric", 82, 1));
    w.pushNpc(mk("npc_heir", "villager", "Bryn", 30, 2));

    let ev: SuccessionEvent | null = null;
    w.succession.subscribe((e) => { ev = e; });
    (w.succession as unknown as { succeed: (m: unknown) => void }).succeed(
      w.npcs.find((n) => n.id === "npc_king"),
    );

    expect(ev).not.toBeNull();
    expect(ev!.context).toBe("natural");
    expect(ev!.summary).toBeTruthy();
    expect(ev!.summary!.name).toBe("Aldric");
    expect(ev!.summary!.epithet.length).toBeGreaterThan(0);
  });
});
