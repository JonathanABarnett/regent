import { Container, Graphics } from "pixi.js";
import type { World } from "../../sim/World";
import type { Structure, StructureKind } from "../../sim/types";

const T = 32;

// ── Colors ────────────────────────────────────────────────────────────────────

const COLOR_AMBER = 0xffb347;   // warm amber — most windows
const COLOR_FORGE = 0xff6820;   // orange-red — forge opening
const COLOR_LIBRARY = 0xfff5cc; // cool off-white — library tall windows
const COLOR_CHIMNEY = 0xff4400; // deep red — forge chimney

// ── Window definitions ────────────────────────────────────────────────────────

interface GlowDef {
  /** tile-space offset from structure top-left (fractional) */
  dx: number;
  dy: number;
  color: number;
  /** override inner/mid/outer radii; defaults to standard window radii */
  radii?: [number, number, number];
}

const WINDOW_DEFS: Partial<Record<StructureKind, GlowDef[]>> = {
  castle: [
    { dx: 0.7, dy: 1.2, color: COLOR_AMBER },
    { dx: 1.7, dy: 1.2, color: COLOR_AMBER },
    { dx: 2.7, dy: 1.2, color: COLOR_AMBER },
  ],
  town: [
    { dx: 0.6, dy: 0.8, color: COLOR_AMBER },
    { dx: 1.4, dy: 0.8, color: COLOR_AMBER },
  ],
  library: [
    { dx: 0.5, dy: 0.7, color: COLOR_LIBRARY },
    { dx: 1.5, dy: 0.7, color: COLOR_LIBRARY },
  ],
  forge: [
    // Main forge opening (drawn with forge intensity multiplier in update)
    { dx: 0.8, dy: 1.0, color: COLOR_FORGE },
    // Chimney glow — smaller radii
    { dx: 1.2, dy: 0.2, color: COLOR_CHIMNEY, radii: [3, 6, 10] },
  ],
  mine: [
    { dx: 0.5, dy: 0.8, color: COLOR_AMBER },
  ],
  watchtower: [
    // Narrow slit — default radii are fine; the narrowness is implied by position
    { dx: 0.5, dy: 0.6, color: COLOR_AMBER },
  ],
  mill: [
    { dx: 0.5, dy: 0.6, color: COLOR_AMBER },
  ],
  shrine: [
    { dx: 0.5, dy: 0.6, color: COLOR_AMBER },
  ],
  astronomers_tower: [
    { dx: 0.5, dy: 0.6, color: COLOR_AMBER },
  ],
};

// Default radii for a standard window glow (inner, mid, outer)
const DEFAULT_RADII: [number, number, number] = [4, 9, 16];

// ── Intensity helpers ─────────────────────────────────────────────────────────

/**
 * Returns a [0, 1] night-light intensity for the given in-world hour (0..24).
 *
 *  hour 5→8   ramp down  1→0
 *  hour 8→17  full day   0
 *  hour 17→20 ramp up    0→1
 *  hour 20→29 (wraps) peak night  1  (covers 20..24 and 0..5 via mod 24)
 */
function nightIntensity(hour: number): number {
  const h = ((hour % 24) + 24) % 24; // normalise to [0, 24)

  if (h >= 8 && h < 17) return 0;           // full daytime — no glow
  if (h >= 17 && h < 20) return (h - 17) / 3; // dusk ramp-up
  if (h >= 5 && h < 8)   return 1 - (h - 5) / 3; // dawn ramp-down
  return 1;                                  // peak night (20..24 and 0..5)
}

// ── Layer ─────────────────────────────────────────────────────────────────────

export class NightLightsLayer {
  readonly container: Container;
  private g: Graphics;

  constructor(private world: World) {
    this.container = new Container();
    this.container.label = "night-lights";
    this.container.eventMode = "none";
    this.container.sortableChildren = false;

    this.g = new Graphics();
    this.container.addChild(this.g);
  }

  update(hour: number): void {
    const baseIntensity = nightIntensity(hour);

    this.g.clear();

    // Nothing to draw during full daylight.
    if (baseIntensity === 0) return;

    const { structures } = this.world.map;
    const npcs = this.world.npcs;

    for (const structure of structures) {
      const defs = WINDOW_DEFS[structure.kind];
      if (!defs) continue;

      // ── Occupied check ───────────────────────────────────────────────────
      const isOccupied = this._isOccupied(structure, npcs);
      if (!isOccupied) continue;

      // ── Per-structure intensity ──────────────────────────────────────────
      let intensity = baseIntensity;

      const isForge = structure.kind === "forge";

      if (isForge) {
        // Flicker: sin wave keyed to current wall-clock time + structure id length
        intensity *= 0.85 + 0.15 * Math.sin(Date.now() * 0.007 + structure.id.length);

        // Extra brightness when an active blacksmith works here
        const hasActiveSmith = npcs.some(
          (n) => n.role === "blacksmith" && n.workId === structure.id
        );
        if (hasActiveSmith) {
          intensity = Math.min(1, intensity * 1.4);
        }
      }

      // ── Draw each glow spot ──────────────────────────────────────────────
      const originX = structure.pos.x * T;
      const originY = structure.pos.y * T;

      for (const def of defs) {
        const px = originX + def.dx * T;
        const py = originY + def.dy * T;
        const [ri, rm, ro] = def.radii ?? DEFAULT_RADII;

        // Draw 3 concentric circles to approximate a soft gradient glow.
        // Outer → inner so the brighter centre paints on top.
        this.g.circle(px, py, ro).fill({ color: def.color, alpha: intensity * 0.08 });
        this.g.circle(px, py, rm).fill({ color: def.color, alpha: intensity * 0.22 });
        this.g.circle(px, py, ri).fill({ color: def.color, alpha: intensity * 0.55 });
      }
    }
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  /**
   * A structure "has lights on" if:
   * - It is a castle (monarch always present), OR
   * - At least one NPC has homeId or workId matching this structure.
   */
  private _isOccupied(structure: Structure, npcs: typeof this.world.npcs): boolean {
    if (structure.kind === "castle") return true;
    return npcs.some(
      (n) => n.homeId === structure.id || n.workId === structure.id
    );
  }
}
