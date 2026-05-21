import { Container, Sprite, Texture } from "pixi.js";
import type { OverworldMap } from "../sim/Map";
import type { TileKind, Season } from "../sim/types";
import type { SpriteFactory } from "./SpriteFactory";

/**
 * Tile renderer with viewport culling and seasonal texture overrides.
 * Only sprites within (or just outside) the camera-visible rect are mounted.
 *
 * Season changes swap textures on all mounted tiles; new tiles mount with
 * the correct seasonal texture from the start.
 */
export class TileRenderer {
  readonly container = new Container();
  private mounted = new Map<number, Sprite>();
  /** Tracks sprites for water (ocean/river) tiles so animate() can swap frames. */
  private animatedTiles = new Map<number, Sprite>();
  private pool: Sprite[] = [];
  private currentSeason: Season = "spring";

  constructor(private map: OverworldMap, private factory: SpriteFactory) {
    this.container.label = "tile-layer";
    this.container.sortableChildren = false;
  }

  /**
   * Called by PixiApp on season change. Swaps all mounted tile textures to
   * the seasonal variant, or back to base for spring/summer.
   */
  setSeason(season: Season): void {
    if (season === this.currentSeason) return;
    this.currentSeason = season;
    // Re-texture every currently-mounted tile.
    for (const [key, sprite] of this.mounted) {
      const tile = this.map.tiles[key];
      sprite.texture = this._textureFor(tile.kind, tile.variant);
    }
  }

  private _textureFor(kind: TileKind, variant: number): Texture {
    const seasonKey = `${this.currentSeason}:${kind}`;
    const seasonal = this.factory.seasonTiles.get(seasonKey);
    if (seasonal && seasonal.length > variant) return seasonal[variant];
    const base = this.factory.tiles.get(kind);
    return base ? base[variant] : Texture.EMPTY;
  }

  /** Update visible tiles; bounds in tile coordinates. */
  update(minX: number, minY: number, maxX: number, maxY: number) {
    const T = 32;
    const visible = new Set<number>();
    const x0 = Math.max(0, Math.floor(minX) - 1);
    const y0 = Math.max(0, Math.floor(minY) - 1);
    const x1 = Math.min(this.map.width - 1, Math.ceil(maxX) + 1);
    const y1 = Math.min(this.map.height - 1, Math.ceil(maxY) + 1);
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const key = y * this.map.width + x;
        visible.add(key);
        let sprite = this.mounted.get(key);
        const tile = this.map.tiles[key];
        if (!sprite) {
          sprite = this.acquire();
          this.container.addChild(sprite);
          this.mounted.set(key, sprite);
          sprite.texture = this._textureFor(tile.kind, tile.variant);
          sprite.x = x * T;
          sprite.y = y * T;
          // register in animatedTiles if this is a water tile
          if (this.getAnimatedKinds().has(tile.kind)) {
            this.animatedTiles.set(key, sprite);
          }
        }
        // Fog of war — re-evaluated every frame so tiles that the Exploration
        // system just revealed light up on the very next render tick.
        // explored=true  → full color (no tint)
        // explored=false → very dark navy; terrain silhouette visible, biome unreadable
        if (tile.explored) {
          sprite.tint = 0xffffff;
        } else {
          sprite.tint = 0x0d0d1a;
        }
      }
    }
    // unmount everything that left the viewport
    for (const [key, sprite] of this.mounted) {
      if (!visible.has(key)) {
        this.container.removeChild(sprite);
        this.mounted.delete(key);
        this.animatedTiles.delete(key);
        this.pool.push(sprite);
      }
    }
  }

  /**
   * Returns the set of tile kinds that have animated frames.
   * Used by update() and animate() to quickly identify water tiles.
   */
  getAnimatedKinds(): Set<TileKind> {
    return new Set(["ocean", "river"] as TileKind[]);
  }

  /**
   * Swap water tile textures to the correct animation frame.
   * Call once per render tick, passing the simulation time in seconds.
   * Cycles at ~2 fps (slow ripple): frame = floor(simTime * 2) % 4.
   */
  animate(simTime: number): void {
    const frame = Math.floor(simTime * 2) % 4;
    for (const [key, sprite] of this.animatedTiles) {
      const tile = this.map.tiles[key];
      const frames = this.factory.waterFrames.get(tile.kind);
      if (frames && frames.length > 0) {
        sprite.texture = frames[frame % frames.length];
      }
    }
  }

  private acquire(): Sprite {
    const s = this.pool.pop();
    if (s) return s;
    const sp = new Sprite();
    sp.width = 32;
    sp.height = 32;
    return sp;
  }
}
