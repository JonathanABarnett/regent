import { Container, Sprite } from "pixi.js";
import type { OverworldMap } from "../../sim/Map";
import type { SpriteFactory } from "../SpriteFactory";

/** Static layer — structures don't move, so we just place sprites once. */
export class StructureLayer {
  readonly container = new Container();
  private sprites = new Map<string, Sprite>();

  constructor(private map: OverworldMap, private factory: SpriteFactory) {
    this.container.label = "structures";
    this.build();
  }

  /**
   * Re-point a structure's sprite at a freshly-built texture (e.g. after the
   * player picks a new banner color). Repositions to keep bottom-alignment.
   */
  refresh(kind: string) {
    const T = 32;
    const tex = this.factory.structures.get(kind);
    if (!tex) return;
    for (const s of this.map.structures) {
      if (s.kind !== kind) continue;
      const sprite = this.sprites.get(s.id);
      if (!sprite) continue;
      sprite.texture = tex;
      sprite.y = (s.pos.y + s.size.y) * T - tex.height;
    }
  }

  /**
   * Reconcile the layer with the map's current structure list. Adds sprites
   * for any new structures (constructed buildings) and removes any that
   * disappeared. Idempotent — safe to call on every tick if needed.
   */
  reconcile() {
    const T = 32;
    const live = new Set(this.map.structures.map((s) => s.id));
    for (const s of this.map.structures) {
      if (this.sprites.has(s.id)) continue;
      const tex = this.factory.structures.get(s.kind);
      if (!tex) continue;
      const sprite = new Sprite(tex);
      sprite.x = s.pos.x * T;
      sprite.y = (s.pos.y + s.size.y) * T - tex.height;
      this.container.addChild(sprite);
      this.sprites.set(s.id, sprite);
    }
    for (const [id, sprite] of this.sprites) {
      if (!live.has(id)) {
        sprite.parent?.removeChild(sprite);
        sprite.destroy();
        this.sprites.delete(id);
      }
    }
  }

  private build() {
    const T = 32;
    for (const s of this.map.structures) {
      const tex = this.factory.structures.get(s.kind);
      if (!tex) continue;
      const sprite = new Sprite(tex);
      sprite.x = s.pos.x * T;
      // structures are taller than their footprint; align bottom to footprint base
      sprite.y = (s.pos.y + s.size.y) * T - tex.height;
      this.container.addChild(sprite);
      this.sprites.set(s.id, sprite);
    }
  }
}
