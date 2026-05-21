import type { World } from "../World";
import type { Journal } from "./Journal";
import type { Vec2 } from "../types";

/**
 * Fog-of-war expansion system.
 *
 * The overworld is generated at full size (192×128 for new games) but
 * initially only the area within INITIAL_RADIUS tiles of the castle is
 * revealed. As in-world days pass, scouts push the frontier outward by one
 * tile every EXPAND_EVERY_DAYS, gradually exposing terrain, structures, and
 * landmarks that were always there — waiting to be found.
 *
 * The renderer dims unexplored tiles to a dark navy so terrain silhouettes
 * are legible but the biome is unreadable. Players can pan into the fog and
 * see that something is there; they just can't tell what.
 *
 * Persistence: only the current radius integer is saved. On restore the full
 * explored mask is recomputed by scanning all tiles — O(n), called once per
 * load. The map is deterministic so the mask is losslessly recoverable.
 */

/** In-world days between each 1-tile frontier advance. */
const EXPAND_EVERY_DAYS = 7;

/** Starting reveal radius around the castle center in tiles. */
export const INITIAL_REVEAL_RADIUS = 28;

/** Prose fired when the frontier expands but no new structure enters it. */
const EXPANSION_LINES: readonly string[] = [
  "Scouts pushed further into the eastern wilds, returning with rough maps and tales of undisturbed forest.",
  "An expedition set out at dawn and came back at dusk with news: more land, more roads unmade.",
  "The kingdom's borders advanced quietly — with a cartographer's ink and a guard's tired boots.",
  "New territory was charted to the north. Three of the scouts were surprised by a stream the old maps had missed.",
  "Surveyors swept the western hills and filed their report: 'More hills. Excellent hills, however.'",
  "The old boundary marker was moved. The kingdom is larger than it was yesterday.",
  "Explorers returned from uncharted land with mud on their boots and a rolled map under each arm.",
  "The frontier advanced today by some unrecorded distance. The chronicle notes it as 'sufficient'.",
  "A small party mapped the land beyond the known roads. They were gone a week. Nobody worried. Much.",
  "The kingdom's edge moved further than it had ever been before. The cartographer ordered new paper.",
  "Scouts returned with charcoal sketches of ridgelines no one living had seen before.",
  "The map on the council chamber wall was updated again. Each addition looks smaller than the one before it.",
  "A surveying party reached land the kingdom had never officially claimed. They planted a flag and walked home.",
  "The frontier watch reported new ground to the south — gentle, unhurried, not yet named.",
  "Scouts found a pass through the western hills the old maps had only marked as 'probable'. It is confirmed.",
  "New land was recorded in the kingdom ledger today under the heading: 'as yet unnamed but ours.'",
];

export class Exploration {
  private _radius: number;
  /** Tile-space center of the castle (or map center if no castle exists). */
  private readonly castleCenter: Vec2;
  private lastExpandDay = -1;

  get radius(): number { return this._radius; }

  constructor(
    private world: World,
    private journal: Journal,
    initialRadius = INITIAL_REVEAL_RADIUS,
  ) {
    const castle = world.map.structures.find((s) => s.kind === "castle");
    this.castleCenter = castle
      ? {
          x: castle.pos.x + Math.floor(castle.size.x / 2),
          y: castle.pos.y + Math.floor(castle.size.y / 2),
        }
      : { x: Math.floor(world.map.width / 2), y: Math.floor(world.map.height / 2) };

    this._radius = initialRadius;
    // Apply initial reveal without journal noise (this is startup, not discovery).
    this._applyRadius(initialRadius);
  }

  /**
   * Re-apply a saved radius (silent — no journal entries).
   * Called from Persistence.applySave().
   */
  restore(savedRadius: number): void {
    this._radius = Math.max(INITIAL_REVEAL_RADIUS, savedRadius);
    this._applyRadius(this._radius);
  }

  snapshot(): number { return this._radius; }

  /** Called once per in-world day from World.tick(). */
  tick(): void {
    const day = this.world.state.day;
    if (this.lastExpandDay < 0) {
      this.lastExpandDay = day;
      return;
    }
    if (day - this.lastExpandDay < EXPAND_EVERY_DAYS) return;
    this.lastExpandDay = day;
    this._expand();
  }

  // ── private ────────────────────────────────────────────────────────────────

  private _expand(): void {
    const map = this.world.map;
    const maxRadius = Math.floor(Math.min(map.width, map.height) / 2) - 2;
    if (this._radius >= maxRadius) return;

    const prevRadius = this._radius;
    this._radius += 1;
    this._applyRadius(this._radius);

    // Were any structures newly enclosed by the frontier?
    const newStructures = map.structures.filter((s) => {
      const cx = s.pos.x + s.size.x / 2;
      const cy = s.pos.y + s.size.y / 2;
      const dx = cx - this.castleCenter.x;
      const dy = cy - this.castleCenter.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      return dist <= this._radius && dist > prevRadius;
    });

    if (newStructures.length > 0) {
      const names = newStructures.map((s) => s.name).join(" and ");
      this.journal.write(
        `Scouts charted new lands at the frontier — and found ${names} among them, long overlooked.`,
        "event",
        newStructures[0].id,
      );
    } else {
      // Rotate through the prose pool; use radius as index so the same
      // expansion step always produces the same line under a given seed.
      const line = EXPANSION_LINES[this._radius % EXPANSION_LINES.length];
      this.journal.write(line, "event");
    }
  }

  /**
   * Mark all tiles within `radius` tiles of the castle center as explored.
   * This is additive — tiles already explored are never un-explored.
   */
  private _applyRadius(radius: number): void {
    const { width, height, tiles } = this.world.map;
    const cx = this.castleCenter.x;
    const cy = this.castleCenter.y;
    const r2 = radius * radius;

    // Only scan the bounding box of the circle to keep this O(r²) not O(map).
    const x0 = Math.max(0, Math.floor(cx - radius));
    const x1 = Math.min(width - 1, Math.ceil(cx + radius));
    const y0 = Math.max(0, Math.floor(cy - radius));
    const y1 = Math.min(height - 1, Math.ceil(cy + radius));

    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r2) {
          const t = tiles[y * width + x];
          if (t) t.explored = true;
        }
      }
    }
  }
}
