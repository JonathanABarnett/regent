import type { OverworldMap } from "../Map";
import { isWalkable } from "../Map";
import type { Vec2 } from "../types";

interface Node {
  x: number;
  y: number;
  g: number;
  f: number;
  parent: Node | null;
}

const NEIGHBOR_DX = [1, -1, 0, 0];
const NEIGHBOR_DY = [0, 0, 1, -1];

/**
 * Tile-based A*. Returns a path (excluding the start tile) or null if unreachable.
 * Capped iterations keep this cheap when called from many entities each tick.
 */
export function findPath(
  map: OverworldMap,
  start: Vec2,
  goal: Vec2,
  maxIter = 15_000,
): Vec2[] | null {
  if (start.x === goal.x && start.y === goal.y) return [];
  const open = new Map<number, Node>();
  const closed = new Set<number>();
  const key = (x: number, y: number) => y * map.width + x;
  const heuristic = (x: number, y: number) =>
    Math.abs(x - goal.x) + Math.abs(y - goal.y);

  const startNode: Node = {
    x: start.x,
    y: start.y,
    g: 0,
    f: heuristic(start.x, start.y),
    parent: null,
  };
  open.set(key(start.x, start.y), startNode);

  let iter = 0;
  while (open.size > 0 && iter++ < maxIter) {
    let bestKey = -1;
    let best: Node | null = null;
    for (const [k, node] of open) {
      if (!best || node.f < best.f) {
        best = node;
        bestKey = k;
      }
    }
    if (!best) break;
    open.delete(bestKey);
    closed.add(bestKey);

    if (best.x === goal.x && best.y === goal.y) {
      const path: Vec2[] = [];
      let cur: Node | null = best;
      while (cur && cur.parent) {
        path.push({ x: cur.x, y: cur.y });
        cur = cur.parent;
      }
      path.reverse();
      return path;
    }

    for (let i = 0; i < 4; i++) {
      const nx = best.x + NEIGHBOR_DX[i];
      const ny = best.y + NEIGHBOR_DY[i];
      const k = key(nx, ny);
      if (closed.has(k)) continue;
      const isGoal = nx === goal.x && ny === goal.y;
      if (!isGoal && !isWalkable(map, nx, ny)) continue;
      const g = best.g + 1;
      const existing = open.get(k);
      if (existing && existing.g <= g) continue;
      open.set(k, {
        x: nx,
        y: ny,
        g,
        f: g + heuristic(nx, ny),
        parent: best,
      });
    }
  }
  return null;
}
