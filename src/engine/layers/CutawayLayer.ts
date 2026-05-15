import { Container, Graphics } from "pixi.js";
import type { World } from "../../sim/World";
import { interiorFor, type Station } from "../../sim/Interiors";
import type { Structure } from "../../sim/types";

/**
 * Cutaway / "dollhouse" mode renderer.
 *
 * When active, draws a tiny per-building interior overlay at world scale
 * on top of the (now-faded) building sprite. Each interior shows the
 * floor pattern + furniture stations from `Interiors.ts`. NPCs that are
 * "inside" the building are placed by EntityLayer at their station
 * coordinates rather than their roving sim coordinates.
 *
 * Implementation:
 *   - One Graphics instance, cleared and redrawn each frame the mode is on
 *   - Uses the same Interior data as the modal InteriorView (Tier 2)
 *   - Furniture is drawn as a single small icon glyph per station — at
 *     world scale a building footprint is only ~2-4 tiles, so we can't fit
 *     the detailed 24px furniture from the modal. We draw simplified glyphs.
 *
 * The layer is mounted between StructureLayer and EntityLayer in PixiApp,
 * so it stamps OVER the faded structure sprite but UNDER the NPCs.
 */

export class CutawayLayer {
  readonly container = new Container();
  private g = new Graphics();
  /** Whether the layer should draw anything this frame. Toggled by PixiApp. */
  enabled = false;

  constructor(private world: World) {
    this.container.label = "cutaway";
    this.container.addChild(this.g);
    // Hidden by default; PixiApp flips this when settings.cutawayMode changes.
    this.container.visible = false;
  }

  setEnabled(on: boolean) {
    this.enabled = on;
    this.container.visible = on;
  }

  /** Called from PixiApp.render each frame. */
  update() {
    if (!this.enabled) return;
    this.g.clear();
    const T = 32;

    for (const s of this.world.map.structures) {
      const interior = interiorFor(s.kind);
      // Map the interior coords to world coords by scaling to fit the
      // building's footprint exactly. Each interior tile becomes a fraction
      // of a world tile.
      const wx = s.pos.x * T;
      const wy = s.pos.y * T;
      const ww = s.size.x * T;
      const wh = s.size.y * T;
      const scaleX = ww / interior.width;
      const scaleY = wh / interior.height;

      // Soft floor wash so the building "interior" reads as a discrete patch
      this.g.rect(wx, wy, ww, wh).fill({ color: parseColor(interior.floor), alpha: 0.55 });
      // Wall border (just the building footprint edge, faintly)
      this.g.rect(wx, wy, ww, wh).stroke({
        color: parseColor(interior.wall),
        width: 1,
        alpha: 0.6,
      });

      // Draw a simplified marker per station — too small for detailed
      // furniture, so we use color-coded squares with a tiny accent.
      for (const station of interior.stations) {
        drawStationMarker(this.g, wx + station.x * scaleX, wy + station.y * scaleY, scaleX, scaleY, station);
      }
    }
  }

  /**
   * Public helper: given a structure, return the world-space position
   * (in pixels) for the Nth NPC station in that building. Used by
   * EntityLayer to place NPCs inside their associated building.
   */
  stationWorldPos(structure: Structure, station: Station): { x: number; y: number } {
    const T = 32;
    const interior = interiorFor(structure.kind);
    const ww = structure.size.x * T;
    const wh = structure.size.y * T;
    const scaleX = ww / interior.width;
    const scaleY = wh / interior.height;
    return {
      x: (structure.pos.x * T) + station.x * scaleX + scaleX / 2,
      y: (structure.pos.y * T) + station.y * scaleY + scaleY / 2,
    };
  }
}

/** Tiny glyph per station tag. World-scale renders are too small for the full
 *  modal furniture sprites, so we use color-coded markers + 1-2 accent pixels. */
function drawStationMarker(
  g: Graphics,
  x: number,
  y: number,
  sw: number,
  sh: number,
  s: Station,
) {
  const cx = x + sw / 2;
  const cy = y + sh / 2;
  const size = Math.max(3, Math.min(sw, sh) * 0.6);
  // Per-tag base + accent color
  let base = 0x52525b;
  let accent: number | null = null;
  let alpha = 0.85;
  switch (s.tag) {
    case "anvil": base = 0x1c1917; accent = 0xfde047; break; // dark + spark
    case "forge_fire": base = 0xdc2626; accent = 0xfde047; alpha = 0.95; break;
    case "hearth": base = 0x7c2d12; accent = 0xf97316; alpha = 0.9; break;
    case "throne": base = 0x7f1d1d; accent = 0xfbbf24; break;
    case "court_table": base = 0x854d0e; break;
    case "guard_post": base = 0x7f1d1d; accent = 0xa8a29e; break;
    case "scholar_desk": base = 0x854d0e; accent = 0xfef3c7; break;
    case "bookshelf": base = 0x451a03; accent = 0x7f1d1d; break;
    case "bed": base = 0xfde68a; accent = 0x7c2d12; break;
    case "table": base = 0x854d0e; accent = 0xfbbf24; break;
    case "loom": base = 0x854d0e; accent = 0xfef3c7; break;
    case "mill_wheel": base = 0xa8a29e; accent = 0x57534e; break;
    case "ore_cart": base = 0x854d0e; accent = 0xa16207; break;
    case "pickaxe_rack": base = 0x52525b; accent = 0x854d0e; break;
    case "lantern":
    case "candle": base = 0xfde047; alpha = 0.7; break;
    case "altar": base = 0xd6d3d1; accent = 0xfde047; break;
    case "kneeler": base = 0x7c2d12; break;
    case "campfire": base = 0xf97316; accent = 0xfde047; alpha = 0.95; break;
    case "tent": base = 0x854d0e; accent = 0xa16207; break;
    case "stone":
    case "obelisk_face": base = 0x52525b; accent = 0xfde047; break;
    case "well_mouth": base = 0x3b82f6; accent = 0x93c5fd; break;
    case "watch_floor": base = 0x78350f; break;
    case "telescope": base = 0x1c1917; accent = 0x92400e; break;
    case "tools_rack": base = 0x52525b; accent = 0xa8a29e; break;
    case "bellows": base = 0x854d0e; break;
    case "ruin_arch": base = 0x78716c; break;
    default: base = 0x52525b; break;
  }
  g.rect(cx - size / 2, cy - size / 2, size, size).fill({ color: base, alpha });
  if (accent !== null) {
    g.rect(cx - size / 4, cy - size / 4, size / 2, size / 2).fill({ color: accent, alpha });
  }
}

function parseColor(hex: string): number {
  return parseInt(hex.replace("#", ""), 16);
}
