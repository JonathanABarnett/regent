import { describe, it, expect } from "vitest";
import { World } from "../World";
import { Chronicle } from "./Chronicle";
import type { ReignSummary } from "./MonarchLegacy";

function summary(generation: number, name = "Aldric"): ReignSummary {
  return {
    name,
    epithet: "the Steady",
    context: "natural",
    generation,
    reignDays: 100,
    seasons: "2 years",
    population: 12,
    reputation: "steady",
    vaultSize: 3,
    dynastyStreak: 1,
    moodTier: "content",
    headline: "A reign of quiet years.",
  };
}

describe("Chronicle", () => {
  it("records a reign as a chapter numbered one behind the new generation", () => {
    const c = new Chronicle();
    const ch = c.record(summary(2), 1, 14); // gen 2 = the founding reign (gen 1) just ended
    expect(ch.chapter).toBe(1);
    expect(ch.name).toBe("Aldric");
    expect(ch.startYear).toBe(1);
    expect(ch.endYear).toBe(14);
    expect(c.count()).toBe(1);
  });

  it("accumulates chapters oldest→newest", () => {
    const c = new Chronicle();
    c.record(summary(2, "A"), 1, 10);
    c.record(summary(3, "B"), 10, 22);
    expect(c.chapters().map((x) => x.name)).toEqual(["A", "B"]);
    expect(c.chapters().map((x) => x.chapter)).toEqual([1, 2]);
  });

  it("caps at 100 chapters, keeping the most recent", () => {
    const c = new Chronicle();
    for (let g = 2; g <= 110; g++) c.record(summary(g, `M${g}`), g, g + 5);
    expect(c.count()).toBe(100);
    expect(c.chapters()[0].chapter).toBe(10); // dropped chapters 1–9
  });

  it("snapshot/hydrate round-trips and ignores junk", () => {
    const c = new Chronicle();
    c.record(summary(2, "A"), 1, 10);
    const c2 = new Chronicle();
    c2.hydrate(c.snapshot());
    expect(c2.chapters()).toEqual(c.chapters());

    c2.hydrate({ chapters: [42, null, { name: 123 }] }); // all invalid
    expect(c2.count()).toBe(0);
    c2.hydrate(null);
    expect(c2.count()).toBe(0);
  });
});

describe("succession records into the chronicle", () => {
  it("a natural death adds a chapter to world.chronicle", () => {
    const w = new World({ seed: 4 });
    const castle = w.map.structures.find((s) => s.kind === "castle")!;
    const center = { x: castle.pos.x + 1, y: castle.pos.y + 1 };
    const mk = (id: string, role: "monarch" | "villager", name: string, age: number, seed: number) => ({
      id, role, name, age,
      pos: { ...center }, prevPos: { ...center }, facing: "s" as const,
      homeId: castle.id, workId: castle.id, activity: "idle" as const,
      path: [], activityTimer: 1, seed,
    });
    w.pushNpc(mk("npc_king", "monarch", "Aldric", 82, 1));
    w.pushNpc(mk("npc_heir", "villager", "Bryn", 30, 2));

    expect(w.chronicle.count()).toBe(0);
    (w.succession as unknown as { succeed: (m: unknown) => void }).succeed(
      w.npcs.find((n) => n.id === "npc_king"),
    );
    expect(w.chronicle.count()).toBe(1);
    expect(w.chronicle.chapters()[0].name).toBe("Aldric");
  });
});
