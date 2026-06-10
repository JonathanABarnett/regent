import { Container, Graphics } from "pixi.js";
import { tileAt } from "../../sim/Map";
import type { OverworldMap } from "../../sim/Map";
import type { TileKind, Season } from "../../sim/types";
import { TILE_COLORS } from "../Palette";

const T = 32; // tile size in pixels

// ── Elevation ranking (mirrors EdgeLayer) ─────────────────────────────────────

/** Higher-ranked biome bleeds its ground color into lower-ranked neighbors. */
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

/**
 * Seasonal ground-color overrides for the bleed fringe. The seasonal tile
 * builder repaints plain/forest/hill grounds in autumn/winter, so the fringe
 * must match or a green dither would sit on snow. Keys absent here fall back
 * to TILE_COLORS[kind][0] (the base ground color).
 */
const SEASON_BLEED: Partial<Record<Season, Partial<Record<TileKind, string>>>> = {
  winter: { plain: "#d1d5db", forest: "#d1d5db", hill: "#9ca3af" },
  autumn: { plain: "#92400e", forest: "#78350f" },
};

/** Cardinal directions and their (dx, dy) neighbor offset. */
const DIRS = [
  { dx:  0, dy: -1 }, // N
  { dx: -1, dy:  0 }, // W
  { dx:  0, dy:  1 }, // S
  { dx:  1, dy:  0 }, // E
] as const;

/**
 * TransitionLayer — organic dithered fringes where two biomes meet.
 *
 * The tile map renders as flat 32px color blocks, so every biome boundary
 * is a razor-straight grid line — the single biggest "programmer art"
 * signal in playtests. Classic SNES tilesets solve this with hand-drawn
 * transition tiles; we get the same read procedurally: wherever a
 * higher-elevation biome borders a lower one, scatter dashes + dots of the
 * higher biome's ground color a few pixels into the lower tile. Grass laps
 * over sand, sand shelves into shallows, forest floor feathers into
 * meadow — boundaries become coastlines instead of graph paper.
 *
 * Same draw-on-viewport-change caching strategy as EdgeLayer, with two
 * additions: the cache key includes the season (fringe colors change) and
 * the count of explored tiles in view (fog reveals must trigger a redraw,
 * and fringes are skipped on/next to unexplored tiles so colored pixels
 * never glow on top of the dark fog tint).
 *
 * Inserted immediately after the tile layer (before roads/decor/edge
 * shadows) so everything else draws on top of the fringe.
 */
export class TransitionLayer {
  readonly container: Container;
  private g: Graphics;
  private lastKey = "";

  constructor(private map: OverworldMap) {
    this.container = new Container();
    this.container.label = "transition-layer";
    this.container.eventMode = "none";
    this.container.sortableChildren = false;
    this.g = new Graphics();
    this.container.addChild(this.g);
  }

  update(minX: number, minY: number, maxX: number, maxY: number, season: Season): void {
    const x0 = Math.max(0, Math.floor(minX) - 1);
    const y0 = Math.max(0, Math.floor(minY) - 1);
    const x1 = Math.min(this.map.width  - 1, Math.ceil(maxX) + 1);
    const y1 = Math.min(this.map.height - 1, Math.ceil(maxY) + 1);

    // Cheap explored-count scan so fog-of-war reveals bust the cache even
    // when the camera is stationary. ~2k boolean reads per frame.
    let explored = 0;
    for (let ty = y0; ty <= y1; ty++) {
      const row = ty * this.map.width;
      for (let tx = x0; tx <= x1; tx++) {
        if (this.map.tiles[row + tx].explored) explored++;
      }
    }

    const key = `${x0},${y0},${x1},${y1}|${season}|${explored}`;
    if (key === this.lastKey) return;
    this.lastKey = key;

    this.g.clear();
    const overrides = SEASON_BLEED[season];

    for (let ty = y0; ty <= y1; ty++) {
      for (let tx = x0; tx <= x1; tx++) {
        const tile = tileAt(this.map, tx, ty);
        if (!tile || !tile.explored) continue;
        const selfElev = ELEVATION[tile.kind];

        for (let d = 0; d < DIRS.length; d++) {
          const neighbor = tileAt(this.map, tx + DIRS[d].dx, ty + DIRS[d].dy);
          if (!neighbor || !neighbor.explored) continue;
          if (ELEVATION[neighbor.kind] <= selfElev) continue;
          const color =
            overrides?.[neighbor.kind] ?? TILE_COLORS[neighbor.kind][0];
          this._drawFringe(tx, ty, d, color);
        }
      }
    }
  }

  /**
   * Dithered fringe of `color` along edge `dir` of tile (tx, ty), eating
   * ~6px into the tile: a near-solid dash band at the edge, a sparser dash
   * band behind it, then scattered dots. Deterministic per (tile, edge) so
   * the coastline never flickers between redraws.
   */
  private _drawFringe(tx: number, ty: number, dir: number, color: string): void {
    const px = tx * T;
    const py = ty * T;
    let s = ((tx * 73856093) ^ (ty * 19349663) ^ (dir * 83492791)) >>> 0;
    const rand = () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };

    // rect() oriented so "along" runs down the shared edge and "depth"
    // steps inward into this tile.
    const rect = (along: number, depth: number, len: number, thick: number) => {
      switch (dir) {
        case 0: this.g.rect(px + along, py + depth, len, thick).fill(color); break;            // N
        case 1: this.g.rect(px + depth, py + along, thick, len).fill(color); break;            // W
        case 2: this.g.rect(px + along, py + T - depth - thick, len, thick).fill(color); break; // S
        case 3: this.g.rect(px + T - depth - thick, py + along, thick, len).fill(color); break; // E
      }
    };

    // Band 0 — hugging the edge, near-solid runs with small bites taken out.
    let pos = 0;
    while (pos < T) {
      const run = 4 + Math.floor(rand() * 5);
      rect(pos, 0, Math.min(run, T - pos), 2);
      pos += run + 1 + Math.floor(rand() * 2);
    }
    // Band 1 — broken dashes.
    pos = Math.floor(rand() * 3);
    while (pos < T) {
      const run = 2 + Math.floor(rand() * 3);
      rect(pos, 2, Math.min(run, T - pos), 2);
      pos += run + 3 + Math.floor(rand() * 3);
    }
    // Band 2 — scattered dots trailing off.
    for (let i = 0; i < 4; i++) {
      rect(Math.floor(rand() * (T - 2)), 4 + Math.floor(rand() * 2), 1 + Math.floor(rand() * 2), 1);
    }
  }
}
