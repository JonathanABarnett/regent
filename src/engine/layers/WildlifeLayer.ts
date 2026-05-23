import { Container, Graphics } from "pixi.js";
import type { World } from "../../sim/World";
import type { WildlifeKind, WildlifeEntity } from "../../sim/systems/Wildlife";

/**
 * Wildlife rendering — small graphics for deer, fish, hawks, and wolves.
 * Each creature gets a tiny 6×6 pixel sprite drawn procedurally with
 * Graphics. Cheap; no atlas needed. Interpolates between sim ticks.
 */
export class WildlifeLayer {
  readonly container = new Container();
  private graphicsById = new Map<string, Graphics>();

  constructor(private world: World) {
    this.container.label = "wildlife-layer";
  }

  /** Update sprite positions every render frame (alpha = sub-tick interpolation). */
  update(alpha: number, simTime: number): void {
    const T = 32;
    const seen = new Set<string>();
    for (const e of this.world.wildlife.entities) {
      seen.add(e.id);
      // Skip rendering creatures on unexplored tiles — they're hidden in fog.
      const tx = Math.floor(e.pos.x);
      const ty = Math.floor(e.pos.y);
      const tile = this.world.map.tiles[ty * this.world.map.width + tx];
      if (tile && !tile.explored) continue;

      let g = this.graphicsById.get(e.id);
      if (!g) {
        g = this._buildSprite(e.kind);
        this.container.addChild(g);
        this.graphicsById.set(e.id, g);
      }
      // Interpolate position.
      const ix = e.prevPos.x + (e.pos.x - e.prevPos.x) * alpha;
      const iy = e.prevPos.y + (e.pos.y - e.prevPos.y) * alpha;
      g.x = ix * T + T / 2;
      g.y = iy * T + T / 2;
      // Fish: pulse alpha to suggest a splash; hawks: circle gently.
      if (e.kind === "fish") {
        g.alpha = 0.7 + Math.sin(simTime * 4 + e.seed) * 0.3;
      } else if (e.kind === "hawk") {
        const orbit = (simTime * 0.4 + e.seed) % (Math.PI * 2);
        g.x += Math.cos(orbit) * 4;
        g.y += Math.sin(orbit) * 2;
        g.alpha = 0.85;
      } else {
        g.alpha = 1;
      }
    }
    // Remove sprites whose entities no longer exist.
    for (const [id, g] of this.graphicsById) {
      if (!seen.has(id)) {
        this.container.removeChild(g);
        g.destroy();
        this.graphicsById.delete(id);
      }
    }
  }

  private _buildSprite(kind: WildlifeKind): Graphics {
    const g = new Graphics();
    switch (kind) {
      case "deer":
        // Brown body with darker legs and a tiny antler tuft.
        g.rect(-3, -2, 6, 4).fill(0x8b5a2b);
        g.rect(-3, 2, 1, 2).fill(0x4a2c12);
        g.rect( 2, 2, 1, 2).fill(0x4a2c12);
        g.rect(-3, -3, 2, 1).fill(0x4a2c12);
        break;
      case "fish":
        // Silver-blue dart with a tail.
        g.rect(-2, -1, 4, 2).fill(0xcbd5e1);
        g.rect( 2, -1, 1, 2).fill(0x60a5fa);
        g.rect(-3, -1, 1, 2).fill(0x60a5fa);
        break;
      case "hawk":
        // Sharp dark V silhouette — reads as a bird shape from above.
        g.rect(-3, -1, 2, 1).fill(0x1f2937);
        g.rect( 1, -1, 2, 1).fill(0x1f2937);
        g.rect(-1,  0, 2, 1).fill(0x1f2937);
        break;
      case "wolf":
        // Grey body, darker back, glint of yellow eye.
        g.rect(-3, -2, 6, 4).fill(0x6b7280);
        g.rect(-3, -2, 6, 1).fill(0x374151);
        g.rect( 3, -2, 1, 1).fill(0xfacc15); // eye
        g.rect(-3, 2, 1, 2).fill(0x374151);
        g.rect( 2, 2, 1, 2).fill(0x374151);
        break;
    }
    return g;
  }
}
