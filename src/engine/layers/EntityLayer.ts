import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { World } from "../../sim/World";
import type { SpriteFactory } from "../SpriteFactory";
import { hoverState } from "../HoverState";

/**
 * Renders NPCs, couriers, and active effects each frame.
 * Reads the simulation; never writes to it.
 */
export class EntityLayer {
  readonly container = new Container();
  private npcSprites = new Map<string, Sprite>();
  private petSprites = new Map<string, Sprite>();
  private courierSprites = new Map<string, Sprite>();
  private effectNodes = new Map<string, Container>();
  private speechNodes = new Map<string, Container>();
  private hoverRing = new Graphics();

  constructor(private world: World, private factory: SpriteFactory) {
    this.container.label = "entities";
    this.container.sortableChildren = true;
    this.hoverRing.zIndex = 999_999;
    this.container.addChild(this.hoverRing);
  }

  update(_dt: number, alpha: number, simTime: number) {
    const T = 32;
    // ── NPCs ──────────────────────────────────────────────────────────────
    const seenNpc = new Set<string>();
    for (const npc of this.world.npcs) {
      seenNpc.add(npc.id);
      let sprite = this.npcSprites.get(npc.id);
      if (!sprite) {
        const frames = this.factory.characters.get(npc.role) ?? [];
        sprite = new Sprite(frames[0] ?? Texture.EMPTY);
        sprite.anchor.set(0.5, 1);
        this.container.addChild(sprite);
        this.npcSprites.set(npc.id, sprite);
      }
      // interpolate between prevPos and pos
      const ix = npc.prevPos.x + (npc.pos.x - npc.prevPos.x) * alpha;
      const iy = npc.prevPos.y + (npc.pos.y - npc.prevPos.y) * alpha;
      sprite.x = ix * T + T / 2;
      sprite.y = (iy + 1) * T;
      sprite.zIndex = sprite.y;
      // simple frame cycling when walking
      if (npc.activity === "walking") {
        const frames = this.factory.characters.get(npc.role) ?? [];
        if (frames.length) {
          const i = Math.floor(simTime * 4) % frames.length;
          sprite.texture = frames[i];
        }
      }
      // facing flip: w → mirror, e → normal; n/s use forward-facing for now
      sprite.scale.x = npc.facing === "w" ? -1 : 1;

      // speech bubble — Container with rounded bg, tail, and text
      if (npc.speech) {
        let bubble = this.speechNodes.get(npc.id);
        const text = npc.speech;
        if (!bubble) {
          bubble = this.makeSpeechBubble(text);
          this.container.addChild(bubble);
          this.speechNodes.set(npc.id, bubble);
        } else {
          const labelText = bubble.children[1] as Text | undefined;
          if (labelText && labelText.text !== text) {
            bubble.removeChildren();
            bubble.destroy({ children: true });
            const replacement = this.makeSpeechBubble(text);
            this.container.addChild(replacement);
            this.speechNodes.set(npc.id, replacement);
            bubble = replacement;
          }
        }
        bubble.x = sprite.x;
        bubble.y = sprite.y - 32;
        bubble.zIndex = sprite.zIndex + 1;
      } else if (this.speechNodes.has(npc.id)) {
        const b = this.speechNodes.get(npc.id)!;
        b.parent?.removeChild(b);
        b.destroy({ children: true });
        this.speechNodes.delete(npc.id);
      }
    }
    for (const [id, sprite] of this.npcSprites) {
      if (!seenNpc.has(id)) {
        sprite.parent?.removeChild(sprite);
        sprite.destroy();
        this.npcSprites.delete(id);
      }
    }

    // ── Pets ──────────────────────────────────────────────────────────────
    const seenPets = new Set<string>();
    for (const pet of this.world.pets) {
      seenPets.add(pet.id);
      const spriteKey = pet.spriteKey ?? `pet_${pet.kind}`;
      let sprite = this.petSprites.get(pet.id);
      if (!sprite) {
        const frames = this.factory.characters.get(spriteKey) ?? [];
        sprite = new Sprite(frames[0] ?? Texture.EMPTY);
        sprite.anchor.set(0.5, 1);
        this.container.addChild(sprite);
        this.petSprites.set(pet.id, sprite);
      }
      const ix = pet.prevPos.x + (pet.pos.x - pet.prevPos.x) * alpha;
      const iy = pet.prevPos.y + (pet.pos.y - pet.prevPos.y) * alpha;
      sprite.x = ix * T + T / 2;
      sprite.y = (iy + 1) * T;
      sprite.zIndex = sprite.y - 0.5;
      const frames = this.factory.characters.get(spriteKey) ?? [];
      if (frames.length) {
        const i = Math.floor(simTime * 5) % frames.length;
        sprite.texture = frames[i];
      }
      sprite.scale.x = pet.facing === "w" ? -1 : 1;
    }
    for (const [id, sprite] of this.petSprites) {
      if (!seenPets.has(id)) {
        sprite.parent?.removeChild(sprite);
        sprite.destroy();
        this.petSprites.delete(id);
      }
    }

    // ── Couriers ──────────────────────────────────────────────────────────
    const seenCourier = new Set<string>();
    for (const c of this.world.couriers) {
      seenCourier.add(c.id);
      let sprite = this.courierSprites.get(c.id);
      if (!sprite) {
        const frames = this.factory.characters.get("courier") ?? [];
        sprite = new Sprite(frames[1] ?? Texture.EMPTY);
        sprite.anchor.set(0.5, 1);
        sprite.tint = 0xffe066;
        this.container.addChild(sprite);
        this.courierSprites.set(c.id, sprite);
      }
      const ix = c.prevPos.x + (c.pos.x - c.prevPos.x) * alpha;
      const iy = c.prevPos.y + (c.pos.y - c.prevPos.y) * alpha;
      sprite.x = ix * T + T / 2;
      sprite.y = (iy + 1) * T;
      sprite.zIndex = sprite.y + 0.5;
      const frames = this.factory.characters.get("courier") ?? [];
      if (frames.length) {
        const i = Math.floor(simTime * 6) % frames.length;
        sprite.texture = frames[i];
      }
      const facingW = (c.path[0] && c.path[0].x < c.pos.x);
      sprite.scale.x = facingW ? -1 : 1;
    }
    for (const [id, sprite] of this.courierSprites) {
      if (!seenCourier.has(id)) {
        sprite.parent?.removeChild(sprite);
        sprite.destroy();
        this.courierSprites.delete(id);
      }
    }

    // ── Effects (forge sparks, mining glow, fireworks, airships, monsters) ─
    const seenFx = new Set<string>();
    for (const e of this.world.effects) {
      seenFx.add(e.id);
      let node = this.effectNodes.get(e.id);
      if (!node) {
        node = this.makeEffectNode(e.kind);
        this.container.addChild(node);
        this.effectNodes.set(e.id, node);
      }
      // position
      let cx: number, cy: number;
      if (e.pos) {
        const ipx = (e.prevPos?.x ?? e.pos.x) + (e.pos.x - (e.prevPos?.x ?? e.pos.x)) * alpha;
        const ipy = (e.prevPos?.y ?? e.pos.y) + (e.pos.y - (e.prevPos?.y ?? e.pos.y)) * alpha;
        cx = ipx * T + T / 2;
        cy = (ipy + 1) * T;
      } else if (e.structureId) {
        const st = this.world.structureById(e.structureId);
        if (!st) continue;
        cx = (st.pos.x + st.size.x / 2) * T;
        cy = (st.pos.y + st.size.y / 2) * T;
      } else {
        continue;
      }
      node.x = cx;
      node.y = cy;
      node.zIndex = cy;
      // tick child animations
      const child = node.children[0] as Sprite | undefined;
      if (child) {
        if (e.kind === "forge" || e.kind === "mining") {
          child.alpha = 0.6 + Math.sin(simTime * 12 + cx) * 0.4;
        }
      }
    }
    for (const [id, node] of this.effectNodes) {
      if (!seenFx.has(id)) {
        node.parent?.removeChild(node);
        node.destroy({ children: true });
        this.effectNodes.delete(id);
      }
    }

    // Hover highlight ring under the cursor-hovered NPC.
    this.updateHoverRing(simTime);
  }

  /** Speech bubble: rounded white bg, dark border, small tail under the text. */
  private makeSpeechBubble(text: string): Container {
    const node = new Container();
    node.label = "speech-bubble";
    const label = new Text({
      text,
      style: {
        fontFamily: "monospace",
        fontSize: 8,
        fill: 0x1a1410,
        align: "center",
      },
    });
    label.anchor.set(0.5, 1);
    const padX = 4;
    const padY = 3;
    const w = label.width + padX * 2;
    const h = label.height + padY * 2;
    const bg = new Graphics();
    bg.roundRect(-w / 2, -h - 4, w, h, 3).fill(0xfde68a);
    bg.roundRect(-w / 2, -h - 4, w, h, 3).stroke({ color: 0x78350f, width: 1 });
    // tail
    bg.moveTo(-3, -4)
      .lineTo(0, 0)
      .lineTo(3, -4)
      .fill(0xfde68a);
    bg.moveTo(-3, -4).lineTo(0, 0).lineTo(3, -4).stroke({ color: 0x78350f, width: 1 });
    node.addChild(bg);
    label.x = 0;
    label.y = -padY - 4;
    node.addChild(label);
    return node;
  }

  private updateHoverRing(simTime: number) {
    const T = 32;
    const id = hoverState.npcId;
    if (!id) {
      this.hoverRing.clear();
      return;
    }
    const sprite = this.npcSprites.get(id);
    if (!sprite) {
      this.hoverRing.clear();
      return;
    }
    this.hoverRing.clear();
    // pulse alpha based on sim time
    const pulse = 0.55 + Math.sin(simTime * 4) * 0.25;
    this.hoverRing
      .ellipse(sprite.x, sprite.y - 3, 11, 4)
      .stroke({ color: 0xfde047, width: 1, alpha: pulse });
    this.hoverRing
      .ellipse(sprite.x, sprite.y - 3, 13, 5)
      .stroke({ color: 0xfde047, width: 1, alpha: pulse * 0.4 });
  }

  private makeEffectNode(kind: string): Container {
    const node = new Container();
    node.label = `fx_${kind}`;
    if (kind === "forge") {
      const spark = new Sprite(this.factory.props.get("spark"));
      spark.anchor.set(0.5);
      spark.scale.set(3);
      node.addChild(spark);
    } else if (kind === "mining") {
      const glow = new Sprite(this.factory.props.get("firework"));
      glow.anchor.set(0.5);
      glow.tint = 0xff5500;
      glow.alpha = 0.7;
      glow.scale.set(2);
      node.addChild(glow);
    } else if (kind === "research") {
      const t = new Text({
        text: "✎",
        style: { fontSize: 12, fill: 0xfde68a, stroke: { color: 0x000000, width: 2 } },
      });
      t.anchor.set(0.5);
      node.addChild(t);
    } else if (kind === "celebration" || kind === "festival") {
      const fw = new Sprite(this.factory.props.get("firework"));
      fw.anchor.set(0.5);
      fw.scale.set(2);
      node.addChild(fw);
    } else if (kind === "airship") {
      const a = new Sprite(this.factory.props.get("airship"));
      a.anchor.set(0.5);
      node.addChild(a);
    } else if (kind === "monster") {
      const m = new Sprite(this.factory.props.get("monster"));
      m.anchor.set(0.5);
      node.addChild(m);
    } else {
      const fallback = new Sprite(this.factory.props.get("spark"));
      fallback.anchor.set(0.5);
      node.addChild(fallback);
    }
    return node;
  }
}
