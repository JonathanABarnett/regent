import type { World } from "../World";
import type { Vec2 } from "../types";

/**
 * Regions — player-named labels placed on the world map.
 *
 * The player can right-click any tile (or use a UI panel) to give that
 * region a name — "The Northern Reach", "The Lonely Hills", "Greysward".
 * Names appear on the minimap and can be referenced in journal prose.
 *
 * Each region is a single tile position with a string label. The label
 * radiates outward visually but the data is just a point — keeps it simple.
 */

export interface RegionLabel {
  id: string;
  name: string;
  pos: Vec2;
}

export interface RegionsSnapshot {
  labels: RegionLabel[];
}

export class Regions {
  state: RegionsSnapshot = { labels: [] };

  constructor(private _world: World) {}

  snapshot(): RegionsSnapshot {
    return { labels: this.state.labels.map((l) => ({ ...l, pos: { ...l.pos } })) };
  }

  restore(s: RegionsSnapshot): void {
    this.state.labels = s.labels.map((l) => ({ ...l, pos: { ...l.pos } }));
  }

  /** Add a new label at a tile position. Returns the created label. */
  add(name: string, pos: Vec2): RegionLabel {
    // Cap to keep saves bounded.
    if (this.state.labels.length >= 50) {
      // Drop the oldest one.
      this.state.labels.shift();
    }
    const trimmed = name.trim().slice(0, 60);
    const label: RegionLabel = {
      id: `region_${Date.now()}_${Math.floor(Math.random() * 10000)}`,
      name: trimmed || "Unnamed",
      pos: { x: Math.round(pos.x), y: Math.round(pos.y) },
    };
    this.state.labels.push(label);
    return label;
  }

  /** Remove a label by id. */
  remove(id: string): void {
    this.state.labels = this.state.labels.filter((l) => l.id !== id);
  }

  /** Rename a label in-place. */
  rename(id: string, newName: string): void {
    const l = this.state.labels.find((x) => x.id === id);
    if (l) l.name = newName.trim().slice(0, 60) || l.name;
  }

  list(): readonly RegionLabel[] { return this.state.labels; }
}
