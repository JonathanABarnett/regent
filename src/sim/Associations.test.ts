import { describe, expect, it } from "vitest";
import { associatedBuildingId } from "./Associations";

const SMITH = { role: "blacksmith", homeId: "rivermouth", workId: "ironhearth" };
const SCHOLAR = { role: "scholar", homeId: "highkeep", workId: "scriptorium" };
const VILLAGER = { role: "villager", homeId: "rivermouth", workId: "rivermouth" };
const MONARCH = { role: "monarch", homeId: "highkeep", workId: "highkeep" };
const GUARD = { role: "guard", homeId: "rivermouth", workId: "highkeep" };

describe("associatedBuildingId", () => {
  it("sleeping → home regardless of role", () => {
    expect(associatedBuildingId({ ...SMITH, activity: "sleeping" })).toBe("rivermouth");
    expect(associatedBuildingId({ ...SCHOLAR, activity: "sleeping" })).toBe("highkeep");
    expect(associatedBuildingId({ ...VILLAGER, activity: "sleeping" })).toBe("rivermouth");
  });

  it("working → workId", () => {
    expect(associatedBuildingId({ ...SMITH, activity: "working" })).toBe("ironhearth");
    expect(associatedBuildingId({ ...SCHOLAR, activity: "working" })).toBe("scriptorium");
    expect(associatedBuildingId({ ...GUARD, activity: "working" })).toBe("highkeep");
  });

  it("working with missing workId falls back to home", () => {
    expect(associatedBuildingId({ role: "miner", activity: "working", workId: "", homeId: "rivermouth" }))
      .toBe("rivermouth");
  });

  it("idle for specialists → work (between tasks)", () => {
    expect(associatedBuildingId({ ...SMITH, activity: "idle" })).toBe("ironhearth");
    expect(associatedBuildingId({ ...SCHOLAR, activity: "idle" })).toBe("scriptorium");
    expect(associatedBuildingId({ ...GUARD, activity: "idle" })).toBe("highkeep");
  });

  it("idle for villagers and monarchs → home", () => {
    expect(associatedBuildingId({ ...VILLAGER, activity: "idle" })).toBe("rivermouth");
    expect(associatedBuildingId({ ...MONARCH, activity: "idle" })).toBe("highkeep");
  });

  it("idle for specialists whose home == work → home (the same)", () => {
    expect(associatedBuildingId({
      role: "blacksmith",
      activity: "idle",
      homeId: "ironhearth",
      workId: "ironhearth",
    })).toBe("ironhearth");
  });

  it("celebrating → home (party at the house)", () => {
    expect(associatedBuildingId({ ...VILLAGER, activity: "celebrating" })).toBe("rivermouth");
    expect(associatedBuildingId({ ...SMITH, activity: "celebrating" })).toBe("rivermouth");
  });

  it("walking → null (render outdoors)", () => {
    expect(associatedBuildingId({ ...SMITH, activity: "walking" })).toBeNull();
    expect(associatedBuildingId({ ...VILLAGER, activity: "walking" })).toBeNull();
  });

  it("unknown activity → null", () => {
    expect(associatedBuildingId({ ...SMITH, activity: "wandering" })).toBeNull();
    expect(associatedBuildingId({ ...SMITH, activity: "" })).toBeNull();
  });

  it("empty homeId + walking-equivalent activity → null", () => {
    expect(associatedBuildingId({
      role: "courier",
      activity: "sleeping",
      homeId: "",
      workId: "",
    })).toBeNull();
  });
});
