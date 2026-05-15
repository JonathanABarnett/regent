import { describe, expect, it } from "vitest";
import { validateSave, SAVE_VERSION, type SaveData } from "./Persistence";

const GOOD: SaveData = {
  version: SAVE_VERSION,
  savedAt: new Date().toISOString(),
  foundedAtMs: Date.now(),
  kingdomName: "Aurelia",
  monarchName: "King Elden",
  totalLifetimeSec: 60,
  seed: 12345,
  simTime: 100,
  weather: "clear",
  loadFactor: 0.3,
  npcs: [
    {
      id: "npc_0",
      role: "villager",
      name: "Roan",
      pos: { x: 10, y: 20 },
      facing: "s",
      homeId: "highkeep",
      workId: "highkeep",
      seed: 42,
    },
  ],
};

describe("Persistence.validateSave", () => {
  it("returns null for non-objects", () => {
    expect(validateSave(null)).toBeNull();
    expect(validateSave(undefined)).toBeNull();
    expect(validateSave("nope")).toBeNull();
    expect(validateSave(123)).toBeNull();
    expect(validateSave([])).toBeNull();
  });

  it("returns null for future-version saves with no migration path", () => {
    expect(validateSave({ ...GOOD, version: 99 })).toBeNull();
  });

  it("migrates a v0 save forward to current version", () => {
    // A minimal-shape v0 save: missing succession, artifacts, construction,
    // aspirations, journal — the fields v0 didn't have.
    const v0Save = {
      version: 0,
      savedAt: new Date().toISOString(),
      foundedAtMs: Date.now(),
      kingdomName: "OldKingdom",
      monarchName: "Old King",
      totalLifetimeSec: 100,
      seed: 99,
      simTime: 50,
      weather: "clear",
      loadFactor: 0.2,
      npcs: [
        {
          id: "npc_v0_0",
          role: "villager",
          name: "Roan",
          pos: { x: 5, y: 5 },
          facing: "s",
          homeId: "highkeep",
          workId: "highkeep",
          seed: 1,
          // intentionally no age, no trait, no parentIds
        },
      ],
    };
    const v = validateSave(v0Save);
    expect(v).not.toBeNull();
    expect(v!.version).toBe(1);
    expect(v!.kingdomName).toBe("OldKingdom");
    expect(v!.succession?.generation).toBe(1);
    expect(v!.npcs[0].age).toBe(30); // defaulted by v0→v1 migration
    expect(v!.aspirations?.active).toEqual([]);
    expect(v!.aspirations?.completed).toEqual({});
  });

  it("accepts a good save and round-trips identity", () => {
    const v = validateSave(GOOD);
    expect(v).not.toBeNull();
    expect(v!.kingdomName).toBe("Aurelia");
    expect(v!.monarchName).toBe("King Elden");
    expect(v!.npcs[0].id).toBe("npc_0");
  });

  it("drops NPCs with unknown roles", () => {
    const tampered = {
      ...GOOD,
      npcs: [
        GOOD.npcs[0],
        { ...GOOD.npcs[0], id: "npc_evil", role: "sysadmin" },
      ],
    };
    const v = validateSave(tampered)!;
    expect(v.npcs).toHaveLength(1);
    expect(v.npcs[0].id).toBe("npc_0");
  });

  it("caps NPC roster at 500", () => {
    const bomb = {
      ...GOOD,
      npcs: Array.from({ length: 10_000 }, (_, i) => ({
        ...GOOD.npcs[0],
        id: `npc_${i}`,
      })),
    };
    const v = validateSave(bomb)!;
    expect(v.npcs.length).toBe(500);
  });

  it("clamps NaN/Infinity positions to 0", () => {
    const evil = {
      ...GOOD,
      npcs: [{ ...GOOD.npcs[0], pos: { x: NaN, y: Infinity } }],
    };
    const v = validateSave(evil)!;
    expect(v.npcs[0].pos).toEqual({ x: 0, y: 0 });
  });

  it("strips control chars from text fields", () => {
    const evil = {
      ...GOOD,
      kingdomName: "Aur" + String.fromCharCode(0x00) + "elia" + String.fromCharCode(0x07),
      monarchName: "Eld" + String.fromCharCode(0x1b) + "en",
    };
    const v = validateSave(evil)!;
    expect(v.kingdomName).toBe("Aurelia");
    expect(v.monarchName).toBe("Elden");
  });

  it("clamps loadFactor outside [0,1]", () => {
    const high = validateSave({ ...GOOD, loadFactor: 99 })!;
    const low = validateSave({ ...GOOD, loadFactor: -5 })!;
    expect(high.loadFactor).toBe(1);
    expect(low.loadFactor).toBe(0);
  });

  it("rejects future-dated foundedAtMs beyond 1 day", () => {
    const future = Date.now() + 30 * 86_400_000; // 30 days in the future
    const v = validateSave({ ...GOOD, foundedAtMs: future })!;
    expect(v.foundedAtMs).toBeLessThanOrEqual(Date.now() + 86_400_000);
  });

  it("rejects ancient foundedAtMs before 2020-01-01", () => {
    const v = validateSave({ ...GOOD, foundedAtMs: -1 })!;
    expect(v.foundedAtMs).toBeGreaterThanOrEqual(1_577_836_800_000);
  });

  it("clamps NPC age to [0, 200]", () => {
    const v = validateSave({
      ...GOOD,
      npcs: [{ ...GOOD.npcs[0], age: 99999 }],
    })!;
    expect(v.npcs[0].age).toBe(200);
  });

  it("caps journal at 5000 entries", () => {
    const huge = {
      ...GOOD,
      journal: Array.from({ length: 10_000 }, (_, i) => ({
        id: `j_${i}`,
        day: 1,
        year: 1,
        season: "spring",
        text: "entry",
        kind: "event" as const,
      })),
    };
    const v = validateSave(huge)!;
    expect(v.journal?.length).toBe(5000);
  });

  it("drops journal entries with unknown kind", () => {
    const v = validateSave({
      ...GOOD,
      journal: [
        { id: "j_1", day: 1, year: 1, season: "spring", text: "ok", kind: "event" },
        { id: "j_2", day: 1, year: 1, season: "spring", text: "evil", kind: "hack" },
      ],
    })!;
    expect(v.journal?.length).toBe(1);
    expect(v.journal?.[0].id).toBe("j_1");
  });

  it("caps achievements at 200", () => {
    const achievements: Record<string, string> = {};
    for (let i = 0; i < 500; i++) achievements[`a_${i}`] = "2024-01-01";
    const v = validateSave({ ...GOOD, achievements })!;
    expect(Object.keys(v.achievements!).length).toBeLessThanOrEqual(200);
  });

  it("preserves achievement-key character cap", () => {
    const v = validateSave({
      ...GOOD,
      achievements: { ["A".repeat(500)]: "2024-01-01", ok: "2024" },
    })!;
    // long key is dropped, short one remains
    expect(v.achievements!.ok).toBeDefined();
    expect(Object.keys(v.achievements!).every((k) => k.length <= 64)).toBe(true);
  });

  it("preserves parentIds on a child NPC", () => {
    const v = validateSave({
      ...GOOD,
      npcs: [
        GOOD.npcs[0],
        {
          ...GOOD.npcs[0],
          id: "npc_child",
          parentIds: ["npc_0", "npc_partner"],
        },
      ],
    })!;
    expect(v.npcs.find((n) => n.id === "npc_child")?.parentIds).toEqual([
      "npc_0",
      "npc_partner",
    ]);
  });

  it("caps parentIds at 2 entries (no chain of imaginary ancestors)", () => {
    const v = validateSave({
      ...GOOD,
      npcs: [
        {
          ...GOOD.npcs[0],
          id: "npc_child",
          parentIds: ["a", "b", "c", "d", "e"],
        },
      ],
    })!;
    expect(v.npcs[0].parentIds?.length).toBeLessThanOrEqual(2);
  });

  it("drops non-string parentIds entries silently", () => {
    const v = validateSave({
      ...GOOD,
      npcs: [
        {
          ...GOOD.npcs[0],
          id: "npc_child",
          parentIds: [42, null, "real_parent", { hack: true }],
        },
      ],
    })!;
    // Only the string entry survives (and only up to 2 total).
    const ids = v.npcs[0].parentIds ?? [];
    expect(ids.every((s) => typeof s === "string")).toBe(true);
    expect(ids).toContain("real_parent");
  });
});
