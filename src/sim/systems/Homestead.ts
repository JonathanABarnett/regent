import type { World } from "../World";
import type { Structure, Vec2 } from "../types";

/**
 * Raise a villager's home — the visible, permanent proof that a player's
 * choice changed the world. When the crown welcomes a family in, a cottage
 * rises by the keep and STAYS on the map (and in the save). This is the
 * answer to "nothing I do matters": a decision that leaves a mark you can
 * point at.
 *
 * Placement mirrors plantGrave: spiral out from the castle on plain/hill,
 * close enough to read as "by the keep" (radius 3 first, then 8), 2×2
 * footprint, no overlap. Returns the placed structure, or null if the land
 * is too crowded to fit one.
 */
export function raiseHomestead(world: World, familyName: string): Structure | null {
  const castle = world.map.structures.find((s) => s.kind === "castle");
  if (!castle) return null;

  const center: Vec2 = {
    x: castle.pos.x + Math.floor(castle.size.x / 2),
    y: castle.pos.y + Math.floor(castle.size.y / 2),
  };
  const size: Vec2 = { x: 2, y: 2 };
  const spot = _findHomesteadSpot(world, center, size, 3) ?? _findHomesteadSpot(world, center, size, 8);
  if (!spot) return null;

  const id = `homestead_${world.state.day}_${world.map.structures.length}`;
  const structure: Structure = {
    id,
    kind: "homestead",
    name: `the ${familyName} cottage`,
    pos: spot,
    size,
  };
  // Mark the footprint walkable so NPCs can path to/around it.
  for (let dy = 0; dy < size.y; dy++) {
    for (let dx = 0; dx < size.x; dx++) {
      const t = world.map.tiles[(spot.y + dy) * world.map.width + (spot.x + dx)];
      if (t) t.walkable = true;
    }
  }
  world.map.structures.push(structure);
  world.map.landmarks.set(id, {
    x: spot.x + Math.floor(size.x / 2),
    y: spot.y + Math.floor(size.y / 2),
  });
  return structure;
}

function _findHomesteadSpot(world: World, center: Vec2, size: Vec2, radius: number): Vec2 | null {
  const { width, height, tiles, structures } = world.map;
  for (let r = 2; r <= radius; r++) {
    for (let dy = -r; dy <= r; dy++) {
      for (let dx = -r; dx <= r; dx++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue; // ring only
        const x = center.x + dx;
        const y = center.y + dy;
        // Bounds with room for the full footprint.
        if (x < 1 || y < 1 || x + size.x >= width - 1 || y + size.y >= height - 1) continue;
        let ok = true;
        for (let fy = 0; fy < size.y && ok; fy++) {
          for (let fx = 0; fx < size.x; fx++) {
            const tile = tiles[(y + fy) * width + (x + fx)];
            if (!tile?.walkable) { ok = false; break; }
            if (tile.kind !== "plain" && tile.kind !== "hill") { ok = false; break; }
            const taken = structures.some(
              (s) => x + fx >= s.pos.x && x + fx < s.pos.x + s.size.x &&
                     y + fy >= s.pos.y && y + fy < s.pos.y + s.size.y,
            );
            if (taken) { ok = false; break; }
          }
        }
        if (ok) return { x, y };
      }
    }
  }
  return null;
}
