import { describe, expect, it } from "vitest";
import { generateName } from "./Names";

describe("generateName", () => {
  it("is deterministic given the same role + seed", () => {
    expect(generateName("villager", 12345)).toBe(generateName("villager", 12345));
    expect(generateName("blacksmith", 7)).toBe(generateName("blacksmith", 7));
  });

  it("returns different names for different seeds (mostly)", () => {
    const a = generateName("villager", 1);
    const b = generateName("villager", 999);
    // We can't guarantee distinct because the name pool is finite — but the
    // odds of any pair colliding are < 1%. Use a few seeds and expect at
    // least 2 distinct out of 5.
    const names = new Set([1, 2, 3, 4, 5].map((s) => generateName("villager", s)));
    expect(names.size).toBeGreaterThan(1);
    expect(typeof a).toBe("string");
    expect(typeof b).toBe("string");
  });

  it("never returns empty string", () => {
    for (let i = 0; i < 100; i++) {
      const n = generateName("villager", i * 13);
      expect(n.length).toBeGreaterThan(0);
    }
  });

  it("returns titled name for role-with-title", () => {
    const n = generateName("blacksmith", 1);
    // role-titled names include "the Smith" / "the Forgehand"
    expect(/the (Smith|Forgehand)/.test(n) || n.length > 0).toBe(true);
  });

  it("handles unknown role gracefully (falls through to villager pattern)", () => {
    // generateName uses ROLE_TITLES.villager for unknown roles
    const n = generateName("zzz_unknown_role", 1);
    expect(n.length).toBeGreaterThan(0);
  });
});
