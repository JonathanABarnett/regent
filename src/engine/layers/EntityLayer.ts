import { Container, Graphics, Sprite, Text, Texture } from "pixi.js";
import type { World } from "../../sim/World";
import type { SpriteFactory } from "../SpriteFactory";
import { hoverState } from "../HoverState";
import { stationFor } from "../../sim/Interiors";
import { associatedBuildingId } from "../../sim/Associations";
import type { CutawayLayer } from "./CutawayLayer";

/**
 * Hash a 32-bit integer to a stable float in [0, 1). Pure / deterministic.
 * Used to derive per-NPC sub-tile offsets so multiple NPCs on the same
 * tile spread out visually instead of stacking pixel-perfect.
 */
function hash01(n: number): number {
  let x = (n | 0) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 0xffffffff;
}

/**
 * Renders NPCs, couriers, and active effects each frame.
 * Reads the simulation; never writes to it.
 */
/** NPC activity/emotion indicator types. */
type IndicatorKind = "sleep" | "work_forge" | "work_mine" | "heart" | "alert";

export class EntityLayer {
  readonly container = new Container();
  private npcSprites = new Map<string, Sprite>();
  private petSprites = new Map<string, Sprite>();
  private courierSprites = new Map<string, Sprite>();
  private effectNodes = new Map<string, Container>();
  private speechNodes = new Map<string, Container>();
  /** Floating activity/emotion indicators drawn above NPC heads. */
  private indicatorNodes = new Map<string, { g: Graphics; kind: IndicatorKind }>();
  private hoverRing = new Graphics();
  /** Optionally set by PixiApp; lets us relocate NPCs to stations when the
   *  cutaway dollhouse mode is active. */
  cutawayLayer?: CutawayLayer;

  constructor(private world: World, private factory: SpriteFactory) {
    this.container.label = "entities";
    this.container.sortableChildren = true;
    this.hoverRing.zIndex = 999_999;
    this.container.addChild(this.hoverRing);
  }

  update(_dt: number, alpha: number, simTime: number) {
    const T = 32;
    // Per-frame state used by the cutaway relocation pass.
    // `takenStationsByBuilding[buildingId]` = set of station indices already
    // assigned to NPCs for that building, so multiple NPCs at the same place
    // get distributed across distinct stations.
    const cutawayOn = !!this.cutawayLayer?.enabled;
    const takenStations = new Map<string, Set<number>>();

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

      // Cutaway: when active, relocate non-walking NPCs to their station
      // inside their associated building. Walking NPCs stay on the
      // overworld so the player can still see traffic between buildings.
      let cutawayPlaced = false;
      if (cutawayOn && this.cutawayLayer && npc.activity !== "walking") {
        const buildingId = associatedBuildingId(npc);
        const building = buildingId
          ? this.world.map.structures.find((s) => s.id === buildingId)
          : null;
        if (building) {
          let taken = takenStations.get(building.id);
          if (!taken) {
            taken = new Set();
            takenStations.set(building.id, taken);
          }
          const { station, index } = stationFor(npc, building, taken);
          if (station) {
            taken.add(index);
            const p = this.cutawayLayer.stationWorldPos(building, station);
            sprite.x = p.x;
            sprite.y = p.y + T / 2;       // anchor is (0.5, 1) — feet at p.y + T/2
            sprite.zIndex = sprite.y;
            cutawayPlaced = true;
          }
        }
      }

      if (!cutawayPlaced) {
        // interpolate between prevPos and pos
        const ix = npc.prevPos.x + (npc.pos.x - npc.prevPos.x) * alpha;
        const iy = npc.prevPos.y + (npc.pos.y - npc.prevPos.y) * alpha;
        // Deterministic per-NPC sub-tile offset so multiple NPCs on the same
        // tile spread out visually instead of stacking pixel-perfect on top of
        // each other. Derived from npc.seed (already deterministic + persisted)
        // so the offset is stable across reloads and saves.
        const ox = (hash01(npc.seed) - 0.5) * 0.6;    // ±0.30 tiles horizontal
        const oy = (hash01(npc.seed * 7919) - 0.5) * 0.35; // ±0.17 tiles vertical
        sprite.x = (ix + ox) * T + T / 2;
        sprite.y = (iy + oy + 1) * T;
        sprite.zIndex = sprite.y;
      }
      // Frame selection: single-direction procedural vs. multi-direction sheet.
      // Row convention for 4-dir sheets: 0=S  1=N  2=W  3=E
      const frames  = this.factory.characters.get(npc.role) ?? [];
      const dirs    = this.factory.characterDirs.get(npc.role) ?? 1;
      if (dirs >= 4 && frames.length >= 4) {
        // Real sprite sheet — pick row by facing, column by walk frame.
        const FACING_ROW: Record<string, number> = { s: 0, n: 1, w: 2, e: 3 };
        const row        = FACING_ROW[npc.facing] ?? 0;
        const framesPerRow = Math.floor(frames.length / dirs);
        const walkCol    = npc.activity === "walking"
          ? Math.floor(simTime * 6) % framesPerRow   // ~6 fps walk cycle
          : 0;                                          // idle = stand frame
        const idx = row * framesPerRow + walkCol;
        if (frames[idx]) sprite.texture = frames[idx];
        sprite.scale.x = 1; // no flip — each direction has its own frames
      } else {
        // Procedural sprites (single direction): cycle frames while walking,
        // flip horizontally for west-facing.
        if (npc.activity === "walking" && frames.length) {
          const i = Math.floor(simTime * 4) % frames.length;
          sprite.texture = frames[i];
        }
        sprite.scale.x = npc.facing === "w" ? -1 : 1;
      }

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

      // ── Activity / emotion indicator ─────────────────────────────────────
      // Shown above the head when no speech bubble is present.
      if (!npc.speech) {
        const kind = this.indicatorKind(npc, simTime);
        if (kind) {
          let node = this.indicatorNodes.get(npc.id);
          if (!node || node.kind !== kind) {
            // Remove stale node if kind changed.
            if (node) { node.g.parent?.removeChild(node.g); node.g.destroy(); }
            const ig = this.drawIndicator(kind);
            this.container.addChild(ig);
            node = { g: ig, kind };
            this.indicatorNodes.set(npc.id, node);
          }
          // Float above the sprite head; gentle bob for sleep
          const bobOffset = kind === "sleep"
            ? Math.sin(simTime * 1.4 + npc.seed * 0.01) * 2
            : Math.sin(simTime * 2.5 + npc.seed * 0.01) * 1.5;
          node.g.x = sprite.x - 6;
          node.g.y = sprite.y - T * 1.6 + bobOffset;
          node.g.zIndex = sprite.zIndex + 2;
          // Pulse alpha for forge-work sparks
          if (kind === "work_forge") {
            node.g.alpha = 0.6 + 0.4 * Math.abs(Math.sin(simTime * 4));
          }
        } else {
          const node = this.indicatorNodes.get(npc.id);
          if (node) {
            node.g.parent?.removeChild(node.g);
            node.g.destroy();
            this.indicatorNodes.delete(npc.id);
          }
        }
      } else {
        // Hide indicator while speech bubble is up.
        const node = this.indicatorNodes.get(npc.id);
        if (node) node.g.visible = false;
      }
    }
    for (const [id, sprite] of this.npcSprites) {
      if (!seenNpc.has(id)) {
        sprite.parent?.removeChild(sprite);
        sprite.destroy();
        this.npcSprites.delete(id);
        const ind = this.indicatorNodes.get(id);
        if (ind) { ind.g.parent?.removeChild(ind.g); ind.g.destroy(); this.indicatorNodes.delete(id); }
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

  /**
   * Decide which indicator (if any) to show above an NPC.
   * Priority: alert > heart > work > sleep. Returns null = no indicator.
   */
  private indicatorKind(npc: import("../../sim/types").NPC, simTime: number): IndicatorKind | null {
    const hour  = this.world.state.hour;
    const isNight = hour >= 21 || hour < 6;

    // Alert: monarch's usurper/uprising is active
    if (
      npc.role === "monarch" &&
      (this.world.usurper.state.active || this.world.uprising.state.active)
    ) return "alert";

    // Heart: just got married (partner exists AND both are idle near home)
    if (
      npc.partnerId &&
      npc.activity !== "walking" &&
      Math.sin(simTime * 0.3 + npc.seed) > 0.7  // show only some of the time (pulses in/out)
    ) {
      const partner = this.world.npcs.find((n) => n.id === npc.partnerId);
      if (partner) {
        const dist = Math.hypot(npc.pos.x - partner.pos.x, npc.pos.y - partner.pos.y);
        if (dist < 2) return "heart";
      }
    }

    // Work: forge/mine active workers
    if (npc.activity === "working") {
      const workStruct = this.world.map.structures.find((s) => s.id === npc.workId);
      if (workStruct?.kind === "forge") return "work_forge";
      if (workStruct?.kind === "mine")  return "work_mine";
    }

    // Sleep: idle NPCs at home during night hours
    if (isNight && npc.activity !== "walking") {
      const homeStruct = this.world.map.structures.find((s) => s.id === npc.homeId);
      if (homeStruct && Math.hypot(npc.pos.x - (homeStruct.pos.x + homeStruct.size.x / 2), npc.pos.y - (homeStruct.pos.y + homeStruct.size.y / 2)) < 3) {
        return "sleep";
      }
    }

    return null;
  }

  /** Draw a tiny 12×10 indicator graphic for the given kind. */
  private drawIndicator(kind: IndicatorKind): Graphics {
    const g = new Graphics();
    switch (kind) {
      case "sleep": {
        // Three staggered 'z' dots at decreasing size and opacity
        g.rect(4, 6, 4, 1).fill({ color: "#a5b4fc", alpha: 0.9 });
        g.rect(4, 6, 4, 1).fill({ color: "#a5b4fc", alpha: 0.9 });
        g.rect(3, 4, 3, 1).fill({ color: "#a5b4fc", alpha: 0.65 });
        g.rect(2, 2, 2, 1).fill({ color: "#a5b4fc", alpha: 0.4 });
        // Small 'z' pixel-letter (3×3 each)
        for (const [px, py, a] of [[3, 7, 0.9], [2, 5, 0.65], [1, 3, 0.45]] as [number, number, number][]) {
          // top bar
          g.rect(px, py,   3, 1).fill({ color: "#c7d2fe", alpha: a });
          // diagonal
          g.rect(px + 2, py + 1, 1, 1).fill({ color: "#c7d2fe", alpha: a * 0.8 });
          g.rect(px + 1, py + 2, 1, 1).fill({ color: "#c7d2fe", alpha: a * 0.6 });
          // bottom bar
          g.rect(px, py + 3, 3, 1).fill({ color: "#c7d2fe", alpha: a });
        }
        break;
      }
      case "work_forge": {
        // Orange spark cluster
        g.rect(5, 5, 2, 2).fill({ color: "#f97316", alpha: 0.95 });
        g.rect(3, 3, 1, 1).fill({ color: "#fbbf24", alpha: 0.8 });
        g.rect(7, 2, 1, 1).fill({ color: "#fde047", alpha: 0.7 });
        g.rect(4, 7, 1, 1).fill({ color: "#f97316", alpha: 0.6 });
        g.rect(8, 5, 1, 1).fill({ color: "#fbbf24", alpha: 0.5 });
        g.rect(6, 1, 1, 1).fill({ color: "#fef9c3", alpha: 0.85 });
        break;
      }
      case "work_mine": {
        // Yellow lantern glow
        g.rect(4, 3, 4, 5).fill({ color: "#a16207", alpha: 0.9 });
        g.rect(5, 4, 2, 3).fill({ color: "#fbbf24", alpha: 0.85 });
        g.rect(5, 4, 2, 1).fill({ color: "#fef9c3", alpha: 0.9 });
        g.rect(5, 8, 2, 1).fill({ color: "#78350f", alpha: 0.6 }); // base
        g.rect(3, 5, 1, 2).fill({ color: "#fbbf24", alpha: 0.3 }); // glow L
        g.rect(8, 5, 1, 2).fill({ color: "#fbbf24", alpha: 0.3 }); // glow R
        break;
      }
      case "heart": {
        // Tiny red pixel heart (9×8)
        const heartPixels = [
          [1,0],[2,0],[4,0],[5,0],
          [0,1],[1,1],[2,1],[3,1],[4,1],[5,1],[6,1],
          [0,2],[1,2],[2,2],[3,2],[4,2],[5,2],[6,2],
          [1,3],[2,3],[3,3],[4,3],[5,3],
          [2,4],[3,4],[4,4],
          [3,5],
        ];
        for (const [px, py] of heartPixels) {
          g.rect(px, py, 1, 1).fill({ color: "#f43f5e", alpha: 0.92 });
        }
        g.rect(1, 1, 1, 1).fill({ color: "#fda4af", alpha: 0.7 }); // highlight
        break;
      }
      case "alert": {
        // Yellow exclamation mark
        g.rect(4, 0, 3, 5).fill({ color: "#facc15", alpha: 0.95 }); // stem
        g.rect(4, 7, 3, 3).fill({ color: "#facc15", alpha: 0.95 }); // dot
        // Outline
        g.rect(3, 0, 1, 5).fill({ color: "#78350f", alpha: 0.5 });
        g.rect(7, 0, 1, 5).fill({ color: "#78350f", alpha: 0.5 });
        break;
      }
    }
    return g;
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
