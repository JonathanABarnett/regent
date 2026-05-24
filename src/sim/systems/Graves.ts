import type { World } from "../World";
import type { Structure, Vec2 } from "../types";

/**
 * Memorial graves — small visual marker structures planted near the castle
 * when a notable named NPC dies.
 *
 * Placement: tries to find an open walkable tile within a 6-tile radius of
 * the castle, preferring tiles that aren't already a structure footprint.
 * If no spot is found within the radius, expands outward to 10 tiles.
 *
 * The grave stores the name of who's buried there in its `name` field, so
 * clicking it (via the structure inspector) can show the memorial.
 *
 * Caps at 80 graves total per kingdom to keep saves bounded and the map
 * uncluttered. Oldest graves are removed first when the cap is hit.
 */

const MAX_GRAVES = 80;

/** Plant a grave marker for `deceasedName`. Returns the placed structure or null. */
export function plantGrave(world: World, deceasedName: string): Structure | null {
  const castle = world.map.structures.find((s) => s.kind === "castle");
  if (!castle) return null;

  const center: Vec2 = {
    x: castle.pos.x + Math.floor(castle.size.x / 2),
    y: castle.pos.y + Math.floor(castle.size.y / 2),
  };
  const spot = _findGraveSpot(world, center, 6) ?? _findGraveSpot(world, center, 10);
  if (!spot) return null;

  // Enforce the cap by removing the oldest grave (first one in the array).
  const existing = world.map.structures.filter((s) => s.kind === "grave");
  if (existing.length >= MAX_GRAVES) {
    const oldest = existing[0];
    const idx = world.map.structures.findIndex((s) => s.id === oldest.id);
    if (idx >= 0) world.map.structures.splice(idx, 1);
    world.map.landmarks.delete(oldest.id);
  }

  const id = `grave_${Date.now()}_${world.map.structures.length}`;
  const structure: Structure = {
    id,
    kind: "grave",
    name: `Grave of ${deceasedName}`,
    pos: spot,
    size: { x: 1, y: 1 },
  };
  world.map.structures.push(structure);
  world.map.landmarks.set(id, { x: spot.x, y: spot.y });
  return structure;
}

function _findGraveSpot(world: World, center: Vec2, radius: number): Vec2 | null {
  const { width, height, tiles, structures } = world.map;
  // Spiral outward from the center.
  for (let r = 2; r <= radius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring only
        const x = center.x + dx;
        const y = center.y + dy;
        if (x < 1 || y < 1 || x >= width - 1 || y >= height - 1) continue;
        const tile = tiles[y * width + x];
        if (!tile?.walkable) continue;
        // Must be on plains/hill — looks weird in a forest or river.
        if (tile.kind !== "plain" && tile.kind !== "hill") continue;
        // Skip if already a structure footprint here.
        const taken = structures.some(
          (s) => x >= s.pos.x && x < s.pos.x + s.size.x &&
                 y >= s.pos.y && y < s.pos.y + s.size.y,
        );
        if (taken) continue;
        return { x, y };
      }
    }
  }
  return null;
}
