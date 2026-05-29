import { Container, Graphics } from "pixi.js";
import type { OverworldMap } from "../../sim/Map";
import type { Structure } from "../../sim/types";
import { mulberry32, hashId } from "../../lib/rng";
import { approxSpriteHeightTiles } from "./structureMetrics";

/**
 * Per-structure decorative banners.
 *
 * Hangs a small cloth pennant from the side of each "banner-eligible"
 * building (castles, towns, watchtowers, libraries, mills, astronomers
 * towers). Color, hang-side, and length are deterministic per
 * structure id — so the same building always wears the same banner
 * even after a save/load.
 *
 * The goal isn't realism: it's visual variety. Without these, every
 * castle in every screenshot looks identical because the procedural
 * sprite is identical. A 5-pixel-wide colored cloth breaks the
 * monotony at near-zero render cost.
 *
 * Built once per structure; rebuilt only when the structure roster
 * actually changes (new construction, demolition). Hidden in cutaway
 * mode so the interior overlay isn't competing with banners.
 */

/**
 * Banner-ready kinds. Most ground structures qualify; landmarks and
 * functional outdoor markers (graves, standing stones, ruins, camps,
 * wellsprings, obelisks) don't — they're either too small to host
 * banner cloth or aesthetically wrong (gravesite banners feel off).
 */
const BANNER_KINDS = new Set([
  "castle",
  "town",
  "library",
  "forge",
  "mill",
  "watchtower",
  "astronomers_tower",
  "shrine",
]);

/**
 * Banner color palette — saturated medieval pennant hues. Deliberately
 * NOT including pure red because the castle's main banner is already
 * red by default; we don't want every red-castle building to look
 * monochrome.
 */
const BANNER_COLORS: readonly number[] = [
  0x1d4ed8, // deep blue
  0x059669, // emerald
  0xb45309, // copper
  0x7c3aed, // royal purple
  0xea580c, // burnt orange
  0x0891b2, // teal
  0xa16207, // antique gold
  0x9d174d, // wine
];

export class StructureBannerLayer {
  readonly container = new Container();
  private builtStructureCount = 0;

  constructor(private map: OverworldMap) {
    this.container.label = "structure-banners";
  }

  /**
   * Called once per render tick from PixiApp. Rebuilds the entire layer
   * only when the structure count changes (cheap O(N) where N is the
   * structure count, and reconciliation happens infrequently — only
   * when buildings are commissioned or destroyed).
   */
  update(): void {
    if (this.builtStructureCount === this.map.structures.length) return;
    this.clear();
    this.build();
    this.builtStructureCount = this.map.structures.length;
  }

  private clear(): void {
    while (this.container.children.length > 0) {
      const child = this.container.children[0];
      this.container.removeChild(child);
      child.destroy();
    }
  }

  private build(): void {
    const T = 32;
    for (const s of this.map.structures) {
      if (!BANNER_KINDS.has(s.kind)) continue;
      const g = this.buildBanner(s, T);
      if (g) this.container.addChild(g);
    }
  }

  /**
   * One banner per structure. Hangs from a tile-edge column on one side
   * of the building, length and color and side all derived from the
   * structure id hash.
   */
  private buildBanner(s: Structure, tileSize: number): Graphics | null {
    const seed = hashId(s.id);
    const rand = mulberry32(seed);
    const color = BANNER_COLORS[seed % BANNER_COLORS.length];
    const hangFromRight = (seed & 1) === 1;
    // Banner length: 1.5–3 tiles of cloth hanging down.
    const lengthPx = Math.floor(tileSize * (1.5 + rand() * 1.5));
    const widthPx = 5; // narrow strip — reads as a pennant, not a flag
    const visibleHeightTiles = approxSpriteHeightTiles(s.kind);
    // Hang from near the top of the visible sprite. 0.4 tile gap from the
    // actual top so the banner reads as attached to the building wall,
    // not floating above the roof peak.
    const hangTopY = (s.pos.y + s.size.y - visibleHeightTiles + 0.4) * tileSize;
    // Horizontal: inset 4px from whichever edge we chose so the banner
    // doesn't visually clip past the building outline.
    const hangX = hangFromRight
      ? (s.pos.x + s.size.x) * tileSize - widthPx - 4
      : s.pos.x * tileSize + 4;

    const g = new Graphics();
    g.x = hangX;
    g.y = hangTopY;

    // Cloth body — solid color rectangle with a tiny darkening band at
    // the bottom edge to fake the fold/sag.
    g.rect(0, 0, widthPx, lengthPx);
    g.fill({ color, alpha: 0.95 });

    // V-cut at the bottom — classic pennant tail. Removes a small
    // triangle from the lower edge.
    const cutDepth = Math.min(4, Math.floor(lengthPx * 0.18));
    g.beginPath();
    g.moveTo(0, lengthPx);
    g.lineTo(widthPx / 2, lengthPx - cutDepth);
    g.lineTo(widthPx, lengthPx);
    g.lineTo(widthPx, lengthPx + 1);
    g.lineTo(0, lengthPx + 1);
    g.closePath();
    // Cut out by drawing the background color over the triangle. Since
    // we don't know the background, use a very dark colour that reads
    // as "negative space" against terrain — the V is small enough that
    // perfect transparency isn't critical at this zoom.
    g.fill({ color: 0x000000, alpha: 0 });

    // Top crossbar (1px gold) — the rod the cloth is hung from.
    g.rect(-1, -1, widthPx + 2, 1);
    g.fill({ color: 0x92400e, alpha: 0.85 });

    // Highlight stripe — single-pixel column down the left edge for a
    // subtle "lit from above" feel.
    g.rect(0, 0, 1, lengthPx);
    g.fill({ color: 0xffffff, alpha: 0.18 });

    return g;
  }
}

