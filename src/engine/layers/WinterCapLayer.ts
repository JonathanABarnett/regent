import { Container, Graphics } from "pixi.js";
import type { OverworldMap } from "../../sim/Map";
import type { Structure } from "../../sim/types";
import type { SpriteFactory } from "../SpriteFactory";

/**
 * Snow caps on building roofs during winter.
 *
 * Drawn as Graphics primitives over the top portion of each structure
 * sprite — cheaper than re-baking the sprite texture and lets us animate
 * caps in/out cleanly when seasons change. Each structure gets a
 * deterministic per-id snow shape so the same building always wears
 * the same cap (no jitter when re-rendering).
 *
 * The engine already applies a season tint globally (cooler/whiter in
 * winter), so this layer is purely about the *roof* — that distinct
 * "snow has settled on the building" look that the global tint can't
 * achieve. Together they sell winter as a season, not just a colour.
 *
 * Hidden in any non-winter season — zero render cost when off.
 */
export class WinterCapLayer {
  readonly container = new Container();
  private builtForSeason: string | null = null;
  private currentMapStructureCount = 0;

  constructor(private map: OverworldMap, _factory: SpriteFactory) {
    this.container.label = "winter-caps";
    // Don't blend with the tint filter — caps should read bright-white
    // even at night when the rest of the world goes dim. Filter
    // application stays at the app level; this layer just lives above
    // structures in z-order.
  }

  /**
   * Called from the engine on each render tick. Builds caps lazily on
   * the first winter frame and tears them down when the season changes
   * away from winter. Also reconciles if new structures were built
   * mid-winter (e.g. a watchtower commissioned in January).
   */
  update(season: string): void {
    const isWinter = season === "winter";
    this.container.visible = isWinter;
    if (!isWinter) {
      // If we're not in winter, drop the caps so they don't accumulate
      // memory across years. Cheap — rebuilt next winter.
      if (this.builtForSeason !== null) {
        this.clear();
        this.builtForSeason = null;
      }
      return;
    }
    const needsRebuild =
      this.builtForSeason !== season ||
      this.currentMapStructureCount !== this.map.structures.length;
    if (needsRebuild) {
      this.clear();
      this.build();
      this.builtForSeason = season;
      this.currentMapStructureCount = this.map.structures.length;
    }
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
      // Skip outdoor markers — snow on a grave is grim but specifically
      // wrong; the chronicle handles winter graves narratively.
      if (s.kind === "grave" || s.kind === "standing_stones") continue;
      const cap = this.buildCap(s, T);
      if (cap) this.container.addChild(cap);
    }
  }

  /**
   * Draw a per-structure snow cap. The shape is a low-amplitude wavy
   * line across the top of the building's footprint, filled downward
   * by a small amount. The wave is seeded by a hash of the structure
   * id so the same building wears the same cap across re-renders.
   */
  private buildCap(s: Structure, tileSize: number): Graphics | null {
    const widthPx = s.size.x * tileSize;
    if (widthPx <= 0) return null;
    const g = new Graphics();
    const seed = hashId(s.id);
    const rand = mulberry32(seed);

    // Sprite is anchored bottom-edge to s.pos.y + s.size.y. We want the
    // cap to sit roughly at the *top* of the visible sprite. Structures
    // are typically 2-5 tiles tall above their footprint base. Estimate
    // the top from the per-kind table; if unknown, fall back to one
    // tile above the footprint top.
    const visibleHeightTiles = approxSpriteHeightTiles(s.kind);
    const spriteTopWorldX = s.pos.x * tileSize;
    const spriteTopWorldY = (s.pos.y + s.size.y - visibleHeightTiles) * tileSize;

    g.x = spriteTopWorldX;
    g.y = spriteTopWorldY;

    // Wavy snow profile — segments across the width with small jitter.
    // Keep amplitude tiny (2-3px) so it reads as "snow settled", not
    // "abstract polygon."
    const SEGMENTS = Math.max(4, Math.floor(widthPx / 6));
    const amplitude = 2;
    const baseDepth = 4; // vertical thickness in px
    const points: Array<{ x: number; y: number }> = [];
    points.push({ x: 0, y: baseDepth + Math.floor(rand() * amplitude) });
    for (let i = 1; i < SEGMENTS; i++) {
      const x = (i / (SEGMENTS - 1)) * widthPx;
      const y = baseDepth + Math.floor(rand() * amplitude * 2 - amplitude);
      points.push({ x, y });
    }
    points.push({ x: widthPx, y: baseDepth + Math.floor(rand() * amplitude) });

    // Filled white-cream polygon. Slight off-white so it doesn't compete
    // with the sun glare or weather particles.
    g.moveTo(0, 0);
    for (const p of points) g.lineTo(p.x, p.y);
    g.lineTo(widthPx, 0);
    g.closePath();
    g.fill({ color: 0xf5f5f4, alpha: 0.92 });

    // Thin highlight stroke along the top edge — sells the "freshly
    // fallen" look at 1× zoom.
    g.moveTo(0, 0);
    g.lineTo(widthPx, 0);
    g.stroke({ color: 0xffffff, width: 1, alpha: 0.65 });

    return g;
  }
}

/**
 * Rough sprite-height estimate (in tile units) for each structure kind.
 * The actual sprite texture might be slightly taller — over-estimating
 * by half a tile is preferable to drawing the cap *below* the roof line.
 */
function approxSpriteHeightTiles(kind: string): number {
  switch (kind) {
    case "castle":           return 5;
    case "town":             return 4;
    case "library":          return 4;
    case "forge":            return 3.5;
    case "mine":             return 3.5;
    case "mill":             return 3.5;
    case "astronomers_tower":return 4.5;
    case "watchtower":       return 2.5;
    case "shrine":           return 2.5;
    case "obelisk":          return 2.5;
    case "ruin":             return 2;
    case "camp":             return 2;
    case "wellspring":       return 1.5;
    default:                  return 2;
  }
}

/** djb2-style string → unsigned-32 hash. Deterministic across runs. */
function hashId(id: string): number {
  let h = 5381 >>> 0;
  for (let i = 0; i < id.length; i++) {
    h = (((h << 5) + h) + id.charCodeAt(i)) >>> 0;
  }
  return h >>> 0;
}

/** mulberry32 — same as world.rand. Tiny inline copy keeps the layer free
 *  of sim imports (architectural rule: engine doesn't import from sim). */
function mulberry32(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
