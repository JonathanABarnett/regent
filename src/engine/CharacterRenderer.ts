/**
 * Character draw logic. One implementation, two surfaces:
 *   - Canvas2D for the editor's live preview (cheap, no PixiJS needed).
 *   - Pixi Graphics for in-game sprite frames (RenderTextured into the world).
 *
 * The DrawSurface abstraction is intentionally tiny — only what character
 * art needs (filled rectangles, with hex colors).
 */

import type { Graphics } from "pixi.js";
import type { CharacterSpec } from "./CharacterSpec";
import { SKIN_PALETTE } from "./CharacterSpec";

export interface DrawSurface {
  rect(x: number, y: number, w: number, h: number, color: string): void;
  /** Alpha is 0..1. */
  rectAlpha(x: number, y: number, w: number, h: number, color: string, alpha: number): void;
}

export class CanvasSurface implements DrawSurface {
  constructor(private ctx: CanvasRenderingContext2D) {}
  rect(x: number, y: number, w: number, h: number, color: string) {
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
  }
  rectAlpha(x: number, y: number, w: number, h: number, color: string, alpha: number) {
    this.ctx.globalAlpha = alpha;
    this.ctx.fillStyle = color;
    this.ctx.fillRect(x, y, w, h);
    this.ctx.globalAlpha = 1;
  }
}

export class PixiSurface implements DrawSurface {
  constructor(private g: Graphics) {}
  rect(x: number, y: number, w: number, h: number, color: string) {
    this.g.rect(x, y, w, h).fill(color);
  }
  rectAlpha(x: number, y: number, w: number, h: number, color: string, alpha: number) {
    this.g.rect(x, y, w, h).fill({ color, alpha });
  }
}

/**
 * Draw one character frame onto a 32×32 surface.
 *
 * @param surface  draw target (Canvas2D or Pixi Graphics adapter)
 * @param spec     character appearance
 * @param frame    walk-cycle frame index 0..3
 * @param facing   south = default; other directions are mirrors/inversions
 *                 (we only draw south for now — directional sprites are a
 *                 stretch goal once the customization itself is dialed in)
 */
interface BodyMetrics {
  /** Body's left x edge (inclusive). */
  left: number;
  /** Body width in pixels. */
  width: number;
  /** Head's left x edge. */
  headLeft: number;
  /** Head width. */
  headWidth: number;
  /** Arm shoulder x — left arm. */
  armLeftX: number;
  /** Arm shoulder x — right arm. */
  armRightX: number;
}

function bodyMetrics(spec: CharacterSpec): BodyMetrics {
  switch (spec.bodyType) {
    case "slim":
      return { left: 11, width: 10, headLeft: 11, headWidth: 10, armLeftX: 8, armRightX: 21 };
    case "stout":
      return { left: 9, width: 14, headLeft: 10, headWidth: 12, armLeftX: 6, armRightX: 23 };
    case "average":
    default:
      return { left: 10, width: 12, headLeft: 11, headWidth: 10, armLeftX: 7, armRightX: 22 };
  }
}

export function drawCharacter(
  surface: DrawSurface,
  spec: CharacterSpec,
  frame: number,
  // facing parameter accepted for future expansion; ignored for now
  _facing: "n" | "s" | "e" | "w" = "s",
): void {
  const skin = SKIN_PALETTE[spec.skinTone];
  const skinShade = darken(skin, 0.15);
  const bob = frame % 2 === 0 ? 0 : 1;
  const body = bodyMetrics(spec);

  // Shadow (scales slightly with body width)
  const shadowW = body.width - 2;
  surface.rectAlpha(body.left + 1, 28, shadowW, 2, "#000000", 0.4);

  // ── Cape (BEHIND body) ──────────────────────────────────────────────────
  drawCape(surface, spec, body);

  // ── Legs / boots ────────────────────────────────────────────────────────
  drawLegs(surface, spec, bob, body);

  // ── Body / outfit ───────────────────────────────────────────────────────
  drawOutfit(surface, spec, bob, body);

  // ── Arms (rendered after body so they overlap) ──────────────────────────
  // left arm
  surface.rect(body.armLeftX, 16 + bob, 3, 6, spec.outfitColor);
  surface.rect(body.armLeftX, 21 + bob, 3, 2, skin);
  // right arm — when holding a hand item, raise it slightly
  const rightArmDown = spec.handItem === "none" || spec.handItem === "shield";
  const rightArmY = rightArmDown ? 16 + bob : 14 + bob;
  surface.rect(body.armRightX, rightArmY, 3, 6, spec.outfitColor);
  surface.rect(body.armRightX, rightArmY + 5, 3, 2, skin);

  // ── Hand item (held in right hand) ──────────────────────────────────────
  drawHandItem(surface, spec, body, bob);

  // ── Head ────────────────────────────────────────────────────────────────
  surface.rect(body.headLeft, 6, body.headWidth, 8, skin);
  surface.rect(body.headLeft, 13, body.headWidth, 1, skinShade);

  // hair
  drawHair(surface, spec, body);

  // eyes
  drawEyes(surface, spec, body);

  // beard
  if (spec.beard) {
    surface.rect(body.headLeft + 1, 12, body.headWidth - 2, 2, spec.hairColor);
    surface.rect(body.headLeft + 2, 13, body.headWidth - 4, 1, darken(spec.hairColor, 0.15));
  }

  // hat
  drawHat(surface, spec, body);
}

function drawLegs(surface: DrawSurface, spec: CharacterSpec, bob: number, body: BodyMetrics) {
  const bootColor = darken(spec.outfitColor, 0.35);
  // robe and regal: long skirts hide the legs
  if (spec.outfit === "robe" || spec.outfit === "regal") {
    surface.rect(body.left + 1, 22, body.width - 2, 6, spec.outfitColor);
    surface.rect(body.left + 1, 26, body.width - 2, 2, spec.accentColor);
    surface.rect(body.left + 2, 28, 3, 1, bootColor);
    surface.rect(body.left + body.width - 5, 28, 3, 1, bootColor);
    return;
  }
  const cx = body.left + body.width / 2;
  surface.rect(cx - 5, 22 + bob, 4, 6, bootColor);
  surface.rect(cx + 1, 22 - bob, 4, 6, bootColor);
}

function drawOutfit(surface: DrawSurface, spec: CharacterSpec, bob: number, body: BodyMetrics) {
  const main = spec.outfitColor;
  const accent = spec.accentColor;
  const shade = darken(main, 0.2);
  const L = body.left;
  const W = body.width;
  const cx = L + W / 2;
  switch (spec.outfit) {
    case "tunic":
      surface.rect(L, 14, W, 10, main);
      surface.rect(L, 14, W, 2, shade);
      surface.rect(L, 19, W, 1, accent); // belt
      break;
    case "robe":
      surface.rect(L - 1, 14, W + 2, 10, main);
      surface.rect(L - 1, 14, W + 2, 2, shade);
      surface.rect(cx - 3, 14, 6, 10, accent); // central stripe
      break;
    case "armor":
      surface.rect(L, 14, W, 10, main);
      surface.rect(L, 14, W, 3, shade);
      surface.rect(L, 18, W, 1, accent);
      surface.rect(L - 1, 15, 2, 3, accent); // pauldron L
      surface.rect(L + W - 1, 15, 2, 3, accent); // pauldron R
      break;
    case "peasant":
      surface.rect(L, 14, W, 10, main);
      surface.rect(L, 20, W, 1, accent);
      break;
    case "regal":
      surface.rect(L, 14, W, 10, main);
      surface.rect(L, 14, W, 1, shade);
      surface.rect(L, 14, 1, 10, accent); // L trim
      surface.rect(L + W - 1, 14, 1, 10, accent); // R trim
      surface.rect(cx - 3, 13, 6, 2, accent);  // collar
      surface.rect(cx - 1, 17, 2, 4, accent);  // medallion stripe
      break;
  }
  if (bob) surface.rectAlpha(L, 23, W, 1, "#000000", 0.15);
}

function drawCape(surface: DrawSurface, spec: CharacterSpec, body: BodyMetrics) {
  if (spec.cape === "none") return;
  const c = spec.capeColor;
  const shade = darken(c, 0.2);
  const fold = darken(c, 0.35);
  const L = body.left;
  const W = body.width;
  // shoulder line tucks behind the body
  surface.rect(L - 1, 13, W + 2, 1, shade);
  // main body of cape behind torso
  if (spec.cape === "short") {
    surface.rect(L - 1, 14, W + 2, 9, c);
    surface.rect(L - 1, 22, W + 2, 1, fold);
  } else { // long
    surface.rect(L - 2, 14, W + 4, 14, c);
    surface.rect(L - 2, 27, W + 4, 1, fold);
    // visible side ripples
    surface.rect(L - 2, 14, 1, 14, shade);
    surface.rect(L + W + 1, 14, 1, 14, shade);
  }
}

function drawHandItem(surface: DrawSurface, spec: CharacterSpec, body: BodyMetrics, bob: number) {
  if (spec.handItem === "none") return;
  const armX = body.armRightX;
  const handY = 21 + bob + (spec.handItem === "shield" ? 0 : -2); // raised hand if non-shield
  const c = spec.handItemColor;
  const dark = darken(c, 0.3);
  // hand position: just outside the arm
  const itemX = armX + 3;
  switch (spec.handItem) {
    case "sword": {
      // grip
      surface.rect(itemX, handY, 2, 2, "#78350f");
      // crossguard
      surface.rect(itemX - 1, handY - 1, 4, 1, dark);
      // blade upward
      surface.rect(itemX, handY - 8, 2, 7, c);
      surface.rect(itemX + 1, handY - 8, 1, 7, dark);
      surface.rect(itemX, handY - 9, 2, 1, "#ffffff"); // tip
      break;
    }
    case "staff": {
      // shaft tall
      surface.rect(itemX, handY - 10, 2, 12, "#78350f");
      // orb
      surface.rect(itemX - 1, handY - 12, 4, 3, c);
      surface.rect(itemX, handY - 13, 2, 1, c);
      break;
    }
    case "book": {
      // hand-sized book
      surface.rect(itemX, handY - 2, 4, 5, c);
      surface.rect(itemX, handY - 2, 4, 1, dark);
      surface.rect(itemX + 1, handY - 1, 2, 3, "#fde68a"); // pages
      break;
    }
    case "scepter": {
      // shaft
      surface.rect(itemX, handY - 8, 2, 10, dark);
      // gem
      surface.rect(itemX - 1, handY - 10, 4, 3, c);
      surface.rect(itemX, handY - 11, 2, 1, c);
      break;
    }
    case "lute": {
      // neck
      surface.rect(itemX, handY - 6, 1, 5, "#78350f");
      // bowl
      surface.rect(itemX - 1, handY - 1, 4, 4, "#a16207");
      surface.rect(itemX - 1, handY - 1, 4, 1, "#78350f");
      // strings
      surface.rect(itemX, handY - 5, 1, 4, "#fde68a");
      break;
    }
    case "shield": {
      // round-ish shield, beside arm
      surface.rect(itemX - 1, handY - 3, 4, 6, c);
      surface.rect(itemX - 1, handY - 3, 4, 1, dark);
      surface.rect(itemX, handY - 1, 2, 1, "#fde047"); // boss
      break;
    }
  }
}

function drawEyes(surface: DrawSurface, spec: CharacterSpec, body: BodyMetrics) {
  const leftEye = body.headLeft + 2;
  const rightEye = body.headLeft + body.headWidth - 4;
  switch (spec.eyeAccessory) {
    case "eyepatch":
      // black patch over left eye, strap across face
      surface.rect(leftEye - 1, 10, 4, 2, "#0c0a09");
      surface.rect(body.headLeft, 9, body.headWidth, 1, "#0c0a09"); // strap
      // right eye visible
      surface.rect(rightEye, 10, 2, 2, spec.eyeColor);
      break;
    case "glasses":
      // both eyes with thin frame around each
      surface.rect(leftEye, 10, 2, 2, spec.eyeColor);
      surface.rect(rightEye, 10, 2, 2, spec.eyeColor);
      // frames (slightly larger)
      surface.rect(leftEye - 1, 9, 4, 1, "#0c0a09");
      surface.rect(leftEye - 1, 12, 4, 1, "#0c0a09");
      surface.rect(leftEye - 1, 10, 1, 2, "#0c0a09");
      surface.rect(leftEye + 2, 10, 1, 2, "#0c0a09");
      surface.rect(rightEye - 1, 9, 4, 1, "#0c0a09");
      surface.rect(rightEye - 1, 12, 4, 1, "#0c0a09");
      surface.rect(rightEye - 1, 10, 1, 2, "#0c0a09");
      surface.rect(rightEye + 2, 10, 1, 2, "#0c0a09");
      // nose bridge
      surface.rect(leftEye + 3, 10, rightEye - leftEye - 3, 1, "#0c0a09");
      break;
    case "monocle":
      surface.rect(leftEye, 10, 2, 2, spec.eyeColor);
      // right eye with frame
      surface.rect(rightEye, 10, 2, 2, spec.eyeColor);
      surface.rect(rightEye - 1, 9, 4, 1, "#fde047");
      surface.rect(rightEye - 1, 12, 4, 1, "#fde047");
      surface.rect(rightEye - 1, 10, 1, 2, "#fde047");
      surface.rect(rightEye + 2, 10, 1, 2, "#fde047");
      // chain
      surface.rect(rightEye + 1, 13, 1, 2, "#fde047");
      break;
    case "none":
    default:
      surface.rect(leftEye, 10, 2, 2, spec.eyeColor);
      surface.rect(rightEye, 10, 2, 2, spec.eyeColor);
      break;
  }
}

function drawHair(surface: DrawSurface, spec: CharacterSpec, body: BodyMetrics) {
  const c = spec.hairColor;
  const shade = darken(c, 0.2);
  const HL = body.headLeft;
  const HW = body.headWidth;
  switch (spec.hairStyle) {
    case "bald":
      return; // skin shows through
    case "short":
      surface.rect(HL, 6, HW, 3, c);
      surface.rect(HL - 1, 7, 1, 3, c); // sideburn L
      surface.rect(HL + HW, 7, 1, 3, c); // sideburn R
      surface.rect(HL, 6, HW, 1, shade);
      break;
    case "long":
      surface.rect(HL, 6, HW, 4, c);
      surface.rect(HL - 1, 7, 1, 8, c);   // L cascade
      surface.rect(HL + HW, 7, 1, 8, c);   // R cascade
      surface.rect(HL, 14, HW, 1, c); // back tail visible behind neck
      surface.rect(HL, 6, HW, 1, shade);
      break;
    case "ponytail":
      surface.rect(HL, 6, HW, 3, c);
      surface.rect(HL + HW - 1, 8, 2, 6, c); // ponytail strand
      surface.rect(HL, 6, HW, 1, shade);
      break;
    case "mohawk":
      surface.rect(HL + Math.floor(HW / 2) - 1, 4, 2, 5, c);
      surface.rect(HL + Math.floor(HW / 2) - 2, 5, 4, 1, c);
      surface.rect(HL + Math.floor(HW / 2) - 2, 4, 4, 1, shade);
      surface.rect(HL, 7, Math.floor(HW / 2) - 1, 2, darken(SKIN_PALETTE[spec.skinTone], 0.3));
      surface.rect(HL + Math.floor(HW / 2) + 1, 7, Math.floor(HW / 2) - 1, 2, darken(SKIN_PALETTE[spec.skinTone], 0.3));
      break;
    case "braid":
      surface.rect(HL, 6, HW, 3, c);
      surface.rect(HL, 6, HW, 1, shade);
      // braid down one side
      surface.rect(HL - 1, 9, 2, 2, c);
      surface.rect(HL - 1, 11, 2, 2, shade);
      surface.rect(HL - 1, 13, 2, 2, c);
      surface.rect(HL - 1, 15, 2, 1, shade);
      break;
    case "topknot":
      surface.rect(HL, 6, HW, 3, c);
      surface.rect(HL, 6, HW, 1, shade);
      // sides shaved (slight shadow)
      surface.rectAlpha(HL, 9, 1, 3, "#000000", 0.15);
      surface.rectAlpha(HL + HW - 1, 9, 1, 3, "#000000", 0.15);
      // bun on top
      surface.rect(HL + Math.floor(HW / 2) - 2, 3, 4, 3, c);
      surface.rect(HL + Math.floor(HW / 2) - 2, 3, 4, 1, shade);
      break;
  }
}

function drawHat(surface: DrawSurface, spec: CharacterSpec, body: BodyMetrics) {
  const c = spec.hatColor;
  const shade = darken(c, 0.25);
  const HL = body.headLeft;
  const HW = body.headWidth;
  const cx = HL + Math.floor(HW / 2);
  switch (spec.hat) {
    case "none":
      return;
    case "crown":
      surface.rect(HL, 5, HW, 2, c);
      surface.rect(HL, 3, 2, 2, c);
      surface.rect(cx - 1, 2, 2, 3, c);
      surface.rect(HL + HW - 2, 3, 2, 2, c);
      surface.rect(HL, 5, HW, 1, shade);
      surface.rect(cx - 1, 3, 2, 1, "#dc2626"); // jewel
      break;
    case "circlet":
      surface.rect(HL, 6, HW, 1, c);
      surface.rect(HL, 7, HW, 1, shade);
      surface.rect(cx - 1, 5, 2, 1, c);
      break;
    case "hood":
      surface.rect(HL - 1, 5, HW + 2, 5, c);
      surface.rect(HL - 1, 5, HW + 2, 1, shade);
      surface.rect(HL, 10, HW, 1, c); // hood shadow on forehead
      break;
    case "cap":
      surface.rect(HL, 5, HW, 3, c);
      surface.rect(HL - 1, 7, HW + 2, 1, c);
      surface.rect(HL, 5, HW, 1, shade);
      break;
    case "wizard":
      // tall pointy hat
      surface.rect(HL - 1, 5, HW + 2, 1, c); // brim
      surface.rect(HL, 4, HW, 1, c);
      surface.rect(HL + 1, 3, HW - 2, 1, c);
      surface.rect(HL + 2, 2, HW - 4, 1, c);
      surface.rect(cx - 1, 1, 2, 1, c);
      surface.rect(cx, 0, 1, 1, c);
      surface.rect(HL - 1, 5, HW + 2, 1, shade);
      break;
    case "helm":
      // metal helm
      surface.rect(HL - 1, 4, HW + 2, 4, c);
      surface.rect(HL - 1, 4, HW + 2, 1, shade);
      // nose guard
      surface.rect(cx, 5, 1, 4, c);
      // T-slit revealing eyes — drawn as background gap (skin)
      surface.rect(HL + 1, 8, cx - HL - 1, 1, shade);
      surface.rect(cx + 1, 8, HL + HW - cx - 1, 1, shade);
      // crest
      surface.rect(HL - 1, 3, HW + 2, 1, "#dc2626");
      surface.rect(cx, 2, 1, 1, "#dc2626");
      break;
    case "jester":
      // base
      surface.rect(HL, 5, HW, 2, c);
      surface.rect(HL, 5, HW, 1, shade);
      // two flopping points
      surface.rect(HL, 3, 2, 2, c);
      surface.rect(HL - 1, 2, 2, 1, c);
      surface.rect(HL + HW - 2, 3, 2, 2, c);
      surface.rect(HL + HW - 1, 2, 2, 1, c);
      // bells (yellow)
      surface.rect(HL - 1, 1, 1, 1, "#fde047");
      surface.rect(HL + HW, 1, 1, 1, "#fde047");
      break;
  }
}

// ── Helpers ────────────────────────────────────────────────────────────────

function darken(hex: string, amount: number): string {
  const { r, g, b } = hexToRgb(hex);
  const dr = Math.max(0, Math.floor(r * (1 - amount)));
  const dg = Math.max(0, Math.floor(g * (1 - amount)));
  const db = Math.max(0, Math.floor(b * (1 - amount)));
  return rgbToHex(dr, dg, db);
}

function hexToRgb(hex: string): { r: number; g: number; b: number } {
  const h = hex.replace("#", "");
  const n = parseInt(h, 16);
  if (h.length === 6) return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
  return { r: 0, g: 0, b: 0 };
}

function rgbToHex(r: number, g: number, b: number): string {
  return "#" + [r, g, b].map((n) => n.toString(16).padStart(2, "0")).join("");
}
