import { Container, Sprite, Texture } from "pixi.js";
import type { OverworldMap } from "../sim/Map";
import type { SpriteFactory } from "./SpriteFactory";

/**
 * Tile renderer with viewport culling: only sprites within (or just outside)
 * the camera-visible rect are mounted in the container, so a 96×64 map renders
 * cheaply even at 60 FPS.
 */
export class TileRenderer {
  readonly container = new Container();
  private mounted = new Map<number, Sprite>();
  private pool: Sprite[] = [];

  constructor(private map: OverworldMap, private factory: SpriteFactory) {
    this.container.label = "tile-layer";
    this.container.sortableChildren = false;
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
        if (!sprite) {
          sprite = this.acquire();
          this.container.addChild(sprite);
          this.mounted.set(key, sprite);
          const tile = this.map.tiles[key];
          const variants = this.factory.tiles.get(tile.kind);
          sprite.texture = variants ? variants[tile.variant] : Texture.EMPTY;
          sprite.x = x * T;
          sprite.y = y * T;
        }
      }
    }
    // unmount everything that left the viewport
    for (const [key, sprite] of this.mounted) {
      if (!visible.has(key)) {
        this.container.removeChild(sprite);
        this.mounted.delete(key);
        this.pool.push(sprite);
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
