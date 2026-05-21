/**
 * DecorLayer — small scattered decorations on top of terrain tiles.
 *
 * Draws once per season-change (lazy: only recomputes when season changes).
 * Elements are seeded deterministically from tile coordinates so the same
 * world always produces the same decorations across reloads.
 *
 * Decorations per terrain type per season:
 *   spring  plain  → tiny white/yellow flower dots
 *   summer  plain  → slightly taller grass tufts (light green)
 *   autumn  plain  → fallen leaf clusters (orange/rust)
 *   winter  plain  → small snow drifts along the edges
 *   hill    (all)  → grey boulder chips, stable across seasons
 *   forest  spring → small white blossoms between trees
 *
 * These are subtle — 1–3 px each, at 30–50 % opacity, so they add texture
 * without competing with the main tile art or the NPC sprites.
 */
import { Container, Graphics } from "pixi.js";
import type { OverworldMap } from "../../sim/Map";
import type { Season } from "../../sim/types";

export class DecorLayer {
  readonly container = new Container();
  private g = new Graphics();
  private lastSeason: Season | null = null;

  constructor(private map: OverworldMap) {
    this.container.label = "decor";
    this.container.addChild(this.g);
    this.container.eventMode = "none";
  }

  /**
   * Called by PixiApp each frame. Redraws only when the season changes —
   * all other frames are a no-op (static layer).
   */
  update(season: Season): void {
    if (season === this.lastSeason) return;
    this.lastSeason = season;
    this.redraw(season);
  }

  private redraw(season: Season): void {
    this.g.clear();
    const { width, height, tiles } = this.map;
    const T = 32;

    // Simple hash for deterministic placement without importing the full RNG.
    const hash = (x: number, y: number, salt: number) => {
      let s = ((x * 374761393 + y * 1073741789 + salt * 17) >>> 0);
      s ^= s >>> 13;
      s = Math.imul(s, 1664525);
      s ^= s >>> 15;
      return (s >>> 0) / 0xffffffff;
    };

    for (let ty = 0; ty < height; ty++) {
      for (let tx = 0; tx < width; tx++) {
        const tile = tiles[ty * width + tx];
        if (!tile) continue;
        const px = tx * T;
        const py = ty * T;

        // ── Boulders on hill tiles (all seasons) ──────────────────────────
        if (tile.kind === "hill" && hash(tx, ty, 1) < 0.25) {
          const bx = px + Math.floor(hash(tx, ty, 2) * 24) + 4;
          const by = py + Math.floor(hash(tx, ty, 3) * 20) + 6;
          this.g.rect(bx, by, 4, 3).fill({ color: 0x78716c, alpha: 0.55 });
          this.g.rect(bx + 1, by - 1, 2, 1).fill({ color: 0xa8a29e, alpha: 0.45 });
          this.g.rect(bx, by + 3, 4, 1).fill({ color: 0x57534e, alpha: 0.4 });
          // Occasional second small boulder
          if (hash(tx, ty, 4) < 0.4) {
            const bx2 = bx + 6 + Math.floor(hash(tx, ty, 5) * 8);
            this.g.rect(bx2, by + 2, 3, 2).fill({ color: 0x78716c, alpha: 0.45 });
          }
        }

        // ── Plain decorations by season ───────────────────────────────────
        if (tile.kind === "plain") {
          const density = hash(tx, ty, 6);
          if (density > 0.55) continue; // skip sparse tiles for variety

          if (season === "spring") {
            // White/yellow flower dots (3–5 per tile)
            const count = 2 + Math.floor(hash(tx, ty, 7) * 3);
            for (let i = 0; i < count; i++) {
              const fx = px + Math.floor(hash(tx, ty, 8 + i) * 28) + 2;
              const fy = py + Math.floor(hash(tx, ty, 15 + i) * 24) + 4;
              const isYellow = hash(tx, ty, 22 + i) > 0.5;
              this.g.rect(fx, fy, 2, 2).fill({ color: isYellow ? 0xfde047 : 0xfafafa, alpha: 0.7 });
              this.g.rect(fx, fy, 1, 1).fill({ color: 0xfef9c3, alpha: 0.9 }); // center
            }
          } else if (season === "summer") {
            // Tall grass tufts (brighter green accent)
            const count = 3 + Math.floor(hash(tx, ty, 7) * 4);
            for (let i = 0; i < count; i++) {
              const gx = px + Math.floor(hash(tx, ty, 8 + i) * 28) + 2;
              const gy = py + Math.floor(hash(tx, ty, 15 + i) * 22) + 6;
              this.g.rect(gx, gy, 1, 3).fill({ color: 0x86efac, alpha: 0.55 });
              this.g.rect(gx + 2, gy - 1, 1, 3).fill({ color: 0x4ade80, alpha: 0.45 });
            }
          } else if (season === "autumn") {
            // Fallen leaf clusters
            const LEAF_COLORS = [0xc2410c, 0xd97706, 0xdc2626, 0x92400e];
            const count = 3 + Math.floor(hash(tx, ty, 7) * 4);
            for (let i = 0; i < count; i++) {
              const lx = px + Math.floor(hash(tx, ty, 8 + i) * 26) + 3;
              const ly = py + Math.floor(hash(tx, ty, 15 + i) * 22) + 5;
              const col = LEAF_COLORS[Math.floor(hash(tx, ty, 22 + i) * 4)];
              this.g.rect(lx, ly, 3, 2).fill({ color: col, alpha: 0.55 });
              if (hash(tx, ty, 30 + i) > 0.5) {
                this.g.rect(lx + 3, ly + 1, 2, 2).fill({ color: LEAF_COLORS[Math.floor(hash(tx, ty, 38 + i) * 4)], alpha: 0.45 });
              }
            }
          } else if (season === "winter") {
            // Snow drifts along one edge per tile
            const edge = Math.floor(hash(tx, ty, 7) * 4); // 0=top 1=bottom 2=left 3=right
            if (edge === 0) {
              this.g.rect(px + 2, py + 2, Math.floor(hash(tx, ty, 8) * 18) + 8, 3).fill({ color: 0xf0f9ff, alpha: 0.5 });
            } else if (edge === 1) {
              this.g.rect(px + 4, py + T - 5, Math.floor(hash(tx, ty, 9) * 16) + 6, 3).fill({ color: 0xf0f9ff, alpha: 0.5 });
            } else if (edge === 2) {
              this.g.rect(px + 2, py + 4, 3, Math.floor(hash(tx, ty, 10) * 16) + 6).fill({ color: 0xf0f9ff, alpha: 0.45 });
            } else {
              this.g.rect(px + T - 5, py + 6, 3, Math.floor(hash(tx, ty, 11) * 14) + 6).fill({ color: 0xf0f9ff, alpha: 0.45 });
            }
          }
        }

        // ── Spring forest: blossoms between tree trunks ───────────────────
        if (tile.kind === "forest" && season === "spring" && hash(tx, ty, 50) < 0.3) {
          const bx = px + Math.floor(hash(tx, ty, 51) * 20) + 6;
          const by2 = py + T - 10 + Math.floor(hash(tx, ty, 52) * 6);
          this.g.rect(bx, by2, 2, 2).fill({ color: 0xfda4af, alpha: 0.6 });
          this.g.rect(bx + 1, by2, 1, 1).fill({ color: 0xfce7f3, alpha: 0.8 });
        }
      }
    }
  }
}
