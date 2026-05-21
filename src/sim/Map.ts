import { createNoise2D } from "simplex-noise";
import type { Tile, TileKind, Structure, Vec2 } from "./types";

export interface MapConfig {
  width: number;
  height: number;
  seed: number;
}

export interface OverworldMap {
  width: number;
  height: number;
  tiles: Tile[];
  structures: Structure[];
  /** named anchor points to refer to in events ("scriptorium", "highkeep", …) */
  landmarks: Map<string, Vec2>;
}

export function tileAt(map: OverworldMap, x: number, y: number): Tile | null {
  if (x < 0 || y < 0 || x >= map.width || y >= map.height) return null;
  return map.tiles[y * map.width + x];
}

export function isWalkable(map: OverworldMap, x: number, y: number): boolean {
  const t = tileAt(map, x, y);
  return !!t && t.walkable;
}

function mulberry32(seed: number) {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6D2B79F5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function generateMap(cfg: MapConfig): OverworldMap {
  const { width, height, seed } = cfg;
  const rand = mulberry32(seed);
  // simplex-noise 4.x takes a deterministic random function
  const elev = createNoise2D(rand);
  const moist = createNoise2D(rand);
  const detail = createNoise2D(rand);

  const tiles: Tile[] = new Array(width * height);
  const fbm = (n: ReturnType<typeof createNoise2D>, x: number, y: number, oct = 4) => {
    let amp = 1, freq = 1, sum = 0, norm = 0;
    for (let i = 0; i < oct; i++) {
      sum += amp * n(x * freq * 0.04, y * freq * 0.04);
      norm += amp;
      amp *= 0.5;
      freq *= 2;
    }
    return sum / norm;
  };

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const e = (fbm(elev, x, y) + 1) * 0.5; // 0..1
      const m = (fbm(moist, x, y, 3) + 1) * 0.5;
      const d = detail(x * 0.3, y * 0.3);
      let kind: TileKind;
      let walkable = true;
      if (e < 0.32) {
        kind = "ocean";
        walkable = false;
      } else if (e < 0.36) {
        kind = "coast";
      } else if (e > 0.78) {
        kind = "snow";
        walkable = false;
      } else if (e > 0.66) {
        kind = "mountain";
        walkable = false;
      } else if (e > 0.55) {
        kind = "hill";
      } else if (m > 0.55) {
        kind = "forest";
      } else {
        kind = "plain";
      }
      tiles[y * width + x] = {
        kind,
        walkable,
        variant: Math.floor((d + 1) * 2) % 4,
        elevation: e,
        // Exploration system marks tiles explored once the frontier expands to them.
        explored: false,
      };
    }
  }

  // carve a meandering river from a high point to the coast
  carveRiver(tiles, width, height, rand);

  // place structures on plains away from water
  const landmarks = new Map<string, Vec2>();
  const structures: Structure[] = [];
  const placements: Array<{ kind: Structure["kind"]; name: string; key: string; size: Vec2 }> = [
    { kind: "castle", name: "Highkeep", key: "highkeep", size: { x: 4, y: 3 } },
    { kind: "town", name: "Rivermouth", key: "rivermouth", size: { x: 3, y: 2 } },
    { kind: "town", name: "Greenholm", key: "greenholm", size: { x: 3, y: 2 } },
    { kind: "library", name: "Scriptorium", key: "scriptorium", size: { x: 2, y: 2 } },
    { kind: "forge", name: "Ironhearth", key: "ironhearth", size: { x: 2, y: 2 } },
    { kind: "mine", name: "Deeprock", key: "deeprock", size: { x: 2, y: 2 } },
  ];

  // After placing the castle, keep all other structures within MAX_CLUSTER_DIST
  // tiles so NPCs can always reach their workplaces. On large maps (320×200)
  // unconstrained placement can scatter the forge/mine 100+ tiles away.
  const MAX_CLUSTER_DIST = 45;
  let castleAnchor: { x: number; y: number } | null = null;

  for (const p of placements) {
    const spot = findFlatSpot(
      tiles, width, height, p.size, rand, structures,
      p.kind === "castle" ? null : castleAnchor,
      MAX_CLUSTER_DIST,
    );
    if (!spot) continue;
    // mark footprint as walkable (interior counts as path entrance)
    for (let dy = 0; dy < p.size.y; dy++) {
      for (let dx = 0; dx < p.size.x; dx++) {
        const t = tiles[(spot.y + dy) * width + (spot.x + dx)];
        if (t) t.walkable = true;
      }
    }
    const id = p.key;
    structures.push({ id, kind: p.kind, name: p.name, pos: spot, size: p.size });
    const cx = spot.x + Math.floor(p.size.x / 2);
    const cy = spot.y + Math.floor(p.size.y / 2);
    landmarks.set(id, { x: cx, y: cy });
    if (p.kind === "castle") castleAnchor = { x: cx, y: cy };
  }

  return { width, height, tiles, structures, landmarks };
}

function carveRiver(
  tiles: Tile[],
  w: number,
  h: number,
  rand: () => number,
) {
  // start near top edge, walk toward bottom-right with jitter
  let x = Math.floor(w * 0.3);
  let y = 2;
  for (let step = 0; step < w + h; step++) {
    if (x < 0 || y < 0 || x >= w || y >= h) break;
    const idx = y * w + x;
    const t = tiles[idx];
    if (t.kind === "ocean") break;
    t.kind = "river";
    t.walkable = false;
    if (rand() < 0.5) x += 1;
    else y += 1;
    if (rand() < 0.15) x += rand() < 0.5 ? -1 : 1;
  }
}

/**
 * Find a flat walkable spot for a structure. When `anchor` + `maxDist` are
 * provided the spot must be within that radius (tries constrained first,
 * then falls back to unconstrained so we never silently drop a structure).
 */
function findFlatSpot(
  tiles: Tile[],
  w: number,
  h: number,
  size: Vec2,
  rand: () => number,
  existing: Structure[],
  anchor: { x: number; y: number } | null = null,
  maxDist = Infinity,
  attempts = 800,
): Vec2 | null {
  const minDistSq = 9 * 9;
  const maxDistSq = maxDist * maxDist;

  const isValid = (x: number, y: number): boolean => {
    // footprint tiles must all be plain or hill
    for (let dy = 0; dy < size.y; dy++) {
      for (let dx = 0; dx < size.x; dx++) {
        const t = tiles[(y + dy) * w + (x + dx)];
        if (!t) return false;
        if (t.kind !== "plain" && t.kind !== "hill") return false;
      }
    }
    // must not be too close to existing structures
    for (const s of existing) {
      const dx = s.pos.x - x;
      const dy = s.pos.y - y;
      if (dx * dx + dy * dy < minDistSq) return false;
    }
    return true;
  };

  // First pass: constrained (within maxDist of anchor).
  if (anchor && isFinite(maxDist)) {
    for (let i = 0; i < attempts; i++) {
      const x = 2 + Math.floor(rand() * (w - size.x - 4));
      const y = 2 + Math.floor(rand() * (h - size.y - 4));
      const ax = anchor.x - (x + size.x / 2);
      const ay = anchor.y - (y + size.y / 2);
      if (ax * ax + ay * ay > maxDistSq) continue;
      if (isValid(x, y)) return { x, y };
    }
  }

  // Unconstrained fallback (always try so structures don't silently vanish).
  for (let i = 0; i < attempts; i++) {
    const x = 2 + Math.floor(rand() * (w - size.x - 4));
    const y = 2 + Math.floor(rand() * (h - size.y - 4));
    if (isValid(x, y)) return { x, y };
  }
  return null;
}
