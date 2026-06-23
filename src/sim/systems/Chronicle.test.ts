import { describe, it, expect } from "vitest";
import { World } from "../World";
import { Chronicle, reignTitle } from "./Chronicle";
import type { ReignSummary } from "./MonarchLegacy";

function summary(generation: number, name = "Aldric"): ReignSummary {
  return {
    name,
    epithet: "the Steady",
    title: "",
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

describe("reignTitle (era naming)", () => {
  const base = {
    context: "natural" as const, reignDays: 100, reputation: "steady",
    moodTier: "content", festivals: 0, wars: 0,
  };

  it("names the era by defining events first", () => {
    expect(reignTitle({ ...base, context: "usurper" })).toBe("The Broken Crown");
    expect(reignTitle({ ...base, context: "uprising" })).toBe("The People's Turn");
    expect(reignTitle({ ...base, wars: 2 })).toBe("The War Years");
    expect(reignTitle({ ...base, festivals: 3 })).toBe("The Glad Years");
    // events beat character: a beloved monarch through war still gets War Years
    expect(reignTitle({ ...base, wars: 3, reputation: "beloved" })).toBe("The War Years");
  });

  it("falls back to shape, then standing, then quiet", () => {
    expect(reignTitle({ ...base, reignDays: 300 })).toBe("The Long Peace");
    expect(reignTitle({ ...base, reignDays: 5 })).toBe("A Brief Candle");
    expect(reignTitle({ ...base, reputation: "feared" })).toBe("The Hard Years");
    expect(reignTitle({ ...base, reputation: "beloved" })).toBe("The Golden Years");
    expect(reignTitle({ ...base, moodTier: "anxious" })).toBe("The Anxious Years");
    expect(reignTitle(base)).toBe("The Quiet Years");
  });
});

describe("Chronicle event tally", () => {
  it("counts events toward the reign, titles the chapter, and resets on record", () => {
    const c = new Chronicle();
    c.noteEvent("monster");
    c.noteEvent("monster");
    c.noteEvent("festival");
    expect(c.currentTheme()).toEqual({ festivals: 1, wars: 2 });
    const ch = c.record(summary(2), 1, 14);
    expect(ch.title).toBe("The War Years");
    expect(c.currentTheme()).toEqual({ festivals: 0, wars: 0 });
  });

  it("persists the in-progress tally across snapshot/hydrate", () => {
    const c = new Chronicle();
    c.noteEvent("festival");
    c.noteEvent("celebration");
    const c2 = new Chronicle();
    c2.hydrate(c.snapshot());
    expect(c2.currentTheme()).toEqual({ festivals: 2, wars: 0 });
  });
});

describe("Chronicle highlights", () => {
  it("captures milestone/life beats and records up to 3, in reading order", () => {
    const c = new Chronicle();
    c.noteBeat("system noise", "system"); // ignored
    c.noteBeat("A wedding at the keep.", "life");
    c.noteBeat("The cult was put down.", "milestone");
    c.noteBeat("A festival lit the square.", "milestone");
    c.noteBeat("rain came", "weather"); // ignored
    const ch = c.record(summary(2), 1, 14);
    // Top 3 by rank were all selected (only 3 eligible), shown chronologically.
    expect(ch.highlights).toEqual([
      "A wedding at the keep.",
      "The cult was put down.",
      "A festival lit the square.",
    ]);
    // Beats reset for the next reign.
    expect(c.record(summary(3), 14, 20).highlights).toEqual([]);
  });

  it("prefers milestones when there are more than three beats", () => {
    const c = new Chronicle();
    c.noteBeat("life 1", "life");
    c.noteBeat("MILE 1", "milestone");
    c.noteBeat("life 2", "life");
    c.noteBeat("MILE 2", "milestone");
    c.noteBeat("MILE 3", "milestone");
    // The three milestones win selection; displayed in insertion order.
    expect(c.record(summary(2), 1, 14).highlights).toEqual(["MILE 1", "MILE 2", "MILE 3"]);
  });

  it("persists in-progress beats across snapshot/hydrate", () => {
    const c = new Chronicle();
    c.noteBeat("A birth in the keep.", "life");
    const c2 = new Chronicle();
    c2.hydrate(c.snapshot());
    expect(c2.record(summary(2), 1, 14).highlights).toEqual(["A birth in the keep."]);
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
