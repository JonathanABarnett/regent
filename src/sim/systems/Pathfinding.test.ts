import { describe, expect, it } from "vitest";
import { findPath } from "./Pathfinding";
import type { OverworldMap } from "../Map";

/**
 * Build a small synthetic map purely in-memory so tests stay fast.
 * 'X' = wall, '.' = walkable.
 */
function makeMap(rows: string[]): OverworldMap {
  const height = rows.length;
  const width = rows[0].length;
  const tiles = [];
  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const ch = rows[y][x];
      tiles.push({
        kind: ch === "X" ? ("mountain" as const) : ("plain" as const),
        walkable: ch !== "X",
        variant: 0,
        elevation: 0.5,
      });
    }
  }
  return {
    width,
    height,
    tiles,
    structures: [],
    landmarks: new Map(),
  };
}

describe("Pathfinding", () => {
  it("finds a straight path on an open map", () => {
    const m = makeMap(["....", "....", "...."]);
    const path = findPath(m, { x: 0, y: 0 }, { x: 3, y: 2 });
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(0);
    const last = path![path!.length - 1];
    expect(last).toEqual({ x: 3, y: 2 });
  });

  it("returns null when goal is unreachable", () => {
    const m = makeMap([
      "....",
      "XXXX",
      "....",
    ]);
    const path = findPath(m, { x: 0, y: 0 }, { x: 0, y: 2 });
    expect(path).toBeNull();
  });

  it("returns empty path when start equals goal", () => {
    const m = makeMap(["..."]);
    const path = findPath(m, { x: 1, y: 0 }, { x: 1, y: 0 });
    expect(path).toEqual([]);
  });

  it("routes around obstacles", () => {
    const m = makeMap([
      ".....",
      "..X..",
      "..X..",
      "..X..",
      ".....",
    ]);
    const path = findPath(m, { x: 0, y: 2 }, { x: 4, y: 2 });
    expect(path).not.toBeNull();
    expect(path!.length).toBeGreaterThan(4); // not a straight line
  });

  it("does not crash with out-of-bounds start or goal", () => {
    const m = makeMap(["....."]);
    // start OOB
    expect(() => findPath(m, { x: -5, y: 0 }, { x: 2, y: 0 })).not.toThrow();
    // goal OOB — A* will iterate but won't find a node
    expect(() => findPath(m, { x: 0, y: 0 }, { x: 99, y: 99 })).not.toThrow();
  });

  it("respects the iteration cap (gracefully returns null on huge unreachable goals)", () => {
    // 40x40 with a single goal blocked by walls — make sure we don't infinite-loop
    const rows = Array.from({ length: 40 }, (_, y) =>
      Array.from({ length: 40 }, (_, x) => (y === 20 ? "X" : ".")).join(""),
    );
    const m = makeMap(rows);
    const path = findPath(m, { x: 0, y: 0 }, { x: 39, y: 39 }, 50);
    expect(path).toBeNull();
  });
});
