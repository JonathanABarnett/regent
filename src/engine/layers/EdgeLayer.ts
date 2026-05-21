import { Container, Graphics } from "pixi.js";
import { tileAt } from "../../sim/Map";
import type { OverworldMap } from "../../sim/Map";
import type { TileKind } from "../../sim/types";

const T = 32; // tile size in pixels

// ── Elevation ranking ─────────────────────────────────────────────────────────

/** Higher value casts shadow onto lower-ranked neighbors. */
const ELEVATION: Record<TileKind, number> = {
  ocean:    0,
  coast:    1,
  river:    1,
  plain:    2,
  forest:   3,
  hill:     4,
  mountain: 5,
  snow:     5,
};

// ── Shadow strip definition ────────────────────────────────────────────────────

/**
 * Four 1-px wide strips drawn from the edge inward, each darker at the edge
 * and fading to near-transparent. Drawn with color 0x000000.
 */
const SHADOW_ALPHA = [0.28, 0.18, 0.10, 0.04] as const;
const SHADOW_COLOR = 0x000000;

/** Foam fringe drawn on ocean tiles adjacent to coast. */
const FOAM_ALPHA  = 0.15;
const FOAM_COLOR  = 0xffffff;

// ── Helper types ──────────────────────────────────────────────────────────────

/** Cardinal directions and their (dx, dy) neighbor offset. */
const DIRS = [
  { name: "N", dx:  0, dy: -1 },
  { name: "W", dx: -1, dy:  0 },
  { name: "S", dx:  0, dy:  1 },
  { name: "E", dx:  1, dy:  0 },
] as const;

type Dir = (typeof DIRS)[number]["name"];

// ── Layer ─────────────────────────────────────────────────────────────────────

/**
 * EdgeLayer — draws subtle shadow gradient strips at tile boundaries where
 * different biomes meet, creating the illusion of terrain height/depth
 * without needing separate transition sprites.
 *
 * Shadow rule: when a neighbor tile has a HIGHER elevation rank, draw a
 * 4-strip gradient shadow along the shared edge of the current tile:
 *
 *   N neighbor higher → shadow strips along the TOP  of this tile (y-rows 0..3 from top)
 *   W neighbor higher → shadow strips along the LEFT of this tile (x-cols 0..3 from left)
 *   S neighbor higher → shadow strips along the BOTTOM of this tile (y-rows 31..28 from bottom)
 *   E neighbor higher → shadow strips along the RIGHT  of this tile (x-cols 31..28 from right)
 *
 * Foam rule: when the current tile is `ocean` and a neighbor is `coast`,
 * draw a 1-px white strip at alpha 0.15 along that shared edge.
 *
 * zIndex = 50 — sits above the tile layer (0) and below structures (100).
 * eventMode = "none" — purely decorative; never intercepts pointer events.
 */
export class EdgeLayer {
  readonly container: Container;
  private g: Graphics;
  /**
   * Last viewport used for drawing. Biome edges are static (the map never
   * changes) so we only need to redraw when the visible region changes.
   * Resolution: 1 tile — sub-tile camera movement doesn't shift which edges
   * are on screen, so we skip any pan smaller than 1 tile.
   */
  private lastKey = "";

  constructor(private map: OverworldMap) {
    this.container = new Container();
    this.container.label = "edge-layer";
    this.container.eventMode = "none";
    this.container.zIndex = 50;
    this.container.sortableChildren = false;

    this.g = new Graphics();
    this.container.addChild(this.g);
  }

  /**
   * Clear and redraw all visible edge effects — but ONLY when the tile-snapped
   * viewport has changed since the last draw. Biome edges are derived from the
   * static tile map, so the same visible region always produces the same pixels.
   * At 60 fps this avoids ~59 wasted g.clear()+redraw cycles per second.
   */
  update(minX: number, minY: number, maxX: number, maxY: number): void {
    // Snap to integer tiles so minor sub-tile camera drift doesn't retrigger.
    const key = `${Math.floor(minX)},${Math.floor(minY)},${Math.ceil(maxX)},${Math.ceil(maxY)}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.g.clear();

    const x0 = Math.max(0, Math.floor(minX) - 1);
    const y0 = Math.max(0, Math.floor(minY) - 1);
    const x1 = Math.min(this.map.width  - 1, Math.ceil(maxX) + 1);
    const y1 = Math.min(this.map.height - 1, Math.ceil(maxY) + 1);

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const tile = tileAt(this.map, tx, ty);
        if (!tile) continue;

        const selfElev = ELEVATION[tile.kind];
        const isOcean  = tile.kind === "ocean";

        for (const dir of DIRS) {
          const nx = tx + dir.dx;
          const ny = ty + dir.dy;
          const neighbor = tileAt(this.map, nx, ny);
          if (!neighbor) continue;

          const neighElev = ELEVATION[neighbor.kind];

          // ── Shadow strips ────────────────────────────────────────────────
          if (neighElev > selfElev) {
            this._drawShadowStrips(tx, ty, dir.name);
          }

          // ── Foam fringe ──────────────────────────────────────────────────
          if (isOcean && neighbor.kind === "coast") {
            this._drawFoamStrip(tx, ty, dir.name);
          }
        }
      }
    }
  }

  // ── Private drawing helpers ───────────────────────────────────────────────

  /**
   * Draw 4 × 1-px shadow strips along the given edge of tile (tx, ty).
   *
   * For N/S edges the strips are horizontal lines; for W/E they are vertical.
   * Each strip steps 1 px inward from the edge, with decreasing alpha.
   */
  private _drawShadowStrips(tx: number, ty: number, edge: Dir): void {
    const px = tx * T; // pixel origin of this tile
    const py = ty * T;

    for (let i = 0; i < SHADOW_ALPHA.length; i++) {
      const alpha = SHADOW_ALPHA[i];

      let rx: number, ry: number, rw: number, rh: number;

      switch (edge) {
        case "N":
          // strip i rows down from the top edge
          rx = px;     ry = py + i; rw = T; rh = 1;
          break;
        case "W":
          // strip i cols right from the left edge
          rx = px + i; ry = py;     rw = 1; rh = T;
          break;
        case "S":
          // strip i rows up from the bottom edge
          rx = px;     ry = py + (T - 1 - i); rw = T; rh = 1;
          break;
        case "E":
          // strip i cols left from the right edge
          rx = px + (T - 1 - i); ry = py; rw = 1; rh = T;
          break;
      }

      this.g.rect(rx, ry, rw, rh).fill({ color: SHADOW_COLOR, alpha });
    }
  }

  /**
   * Draw a single 1-px white foam strip along the given edge of tile (tx, ty).
   * Used for ocean tiles adjacent to coast to suggest breaking surf.
   */
  private _drawFoamStrip(tx: number, ty: number, edge: Dir): void {
    const px = tx * T;
    const py = ty * T;

    let rx: number, ry: number, rw: number, rh: number;

    switch (edge) {
      case "N": rx = px;         ry = py;           rw = T; rh = 1; break;
      case "W": rx = px;         ry = py;           rw = 1; rh = T; break;
      case "S": rx = px;         ry = py + (T - 1); rw = T; rh = 1; break;
      case "E": rx = px + (T-1); ry = py;           rw = 1; rh = T; break;
    }

    this.g.rect(rx, ry, rw, rh).fill({ color: FOAM_COLOR, alpha: FOAM_ALPHA });
  }
}
