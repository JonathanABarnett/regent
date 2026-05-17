import type { Station, StationTag } from "../sim/Interiors";

/**
 * Pure Canvas2D rendering of interior rooms + furniture.
 *
 * Kept separate from React so the same drawing functions can be reused by:
 *   - The modal InteriorView (Tier 2)
 *   - The future cutaway/dollhouse mode (Tier 3) — same primitives, rendered
 *     at world scale on top of the structure sprite with a transparency mask
 *
 * No state, no DOM. Takes a Canvas2D ctx + an Interior layout + a scale.
 */

export const INTERIOR_TILE_PX = 24;

interface DrawOpts {
  ctx: CanvasRenderingContext2D;
  tilePx?: number;
  /** in-world hour 0..24; lamps/fire glow more at night */
  hour?: number;
}

/** Draw the floor + wall border. */
export function drawRoom(
  opts: DrawOpts,
  width: number,
  height: number,
  floor: string,
  floorAccent: string,
  wall: string,
) {
  const { ctx } = opts;
  const T = opts.tilePx ?? INTERIOR_TILE_PX;
  // Floor base
  ctx.fillStyle = floor;
  ctx.fillRect(0, 0, width * T, height * T);
  // Floor tile seams — subtle grid
  ctx.strokeStyle = floorAccent;
  ctx.lineWidth = 1;
  for (let x = 0; x <= width; x++) {
    ctx.beginPath();
    ctx.moveTo(x * T + 0.5, 0);
    ctx.lineTo(x * T + 0.5, height * T);
    ctx.stroke();
  }
  for (let y = 0; y <= height; y++) {
    ctx.beginPath();
    ctx.moveTo(0, y * T + 0.5);
    ctx.lineTo(width * T, y * T + 0.5);
    ctx.stroke();
  }
  // Walls — thick border
  ctx.strokeStyle = wall;
  ctx.lineWidth = 4;
  ctx.strokeRect(2, 2, width * T - 4, height * T - 4);
}

/** Draw a station at its position. The mood/hour args tint glow effects. */
export function drawStation(opts: DrawOpts, s: Station, hour: number = 12) {
  const { ctx } = opts;
  const T = opts.tilePx ?? INTERIOR_TILE_PX;
  const x = s.x * T;
  const y = s.y * T;
  const nightish = hour < 7 || hour > 19;
  const glow = nightish ? 1.0 : 0.5;
  drawByTag(ctx, x, y, T, s.tag, glow);
}

function drawByTag(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  T: number,
  tag: StationTag,
  glow: number,
) {
  switch (tag) {
    case "anvil":
      // Black L-shape with horn pointing right
      ctx.fillStyle = "#1c1917";
      ctx.fillRect(x + 4, y + 12, T - 8, 6);
      ctx.fillRect(x + 8, y + 6, T - 12, 8);
      ctx.fillStyle = "#52525b";
      ctx.fillRect(x + 8, y + 6, T - 14, 2);
      // sparks
      ctx.fillStyle = `rgba(253, 224, 71, ${0.6 + glow * 0.4})`;
      ctx.fillRect(x + 14, y + 4, 2, 2);
      ctx.fillRect(x + 16, y + 2, 1, 1);
      break;

    case "bellows":
      ctx.fillStyle = "#854d0e";
      ctx.fillRect(x + 6, y + 8, T - 10, 10);
      ctx.fillStyle = "#451a03";
      ctx.fillRect(x + 6, y + 8, T - 10, 1);
      ctx.fillRect(x + 18, y + 12, 4, 2);
      break;

    case "forge_fire":
      // Glowing hearth
      ctx.fillStyle = "#1c1917";
      ctx.fillRect(x + 2, y + 8, T - 4, T - 12);
      ctx.fillStyle = "#7f1d1d";
      ctx.fillRect(x + 4, y + 10, T - 8, T - 16);
      ctx.fillStyle = "#f97316";
      ctx.fillRect(x + 6, y + 12, T - 12, T - 20);
      ctx.fillStyle = `rgba(253, 224, 71, ${0.6 + glow * 0.4})`;
      ctx.fillRect(x + 9, y + 14, T - 18, T - 24);
      break;

    case "tools_rack":
      ctx.fillStyle = "#52525b";
      ctx.fillRect(x + 2, y + 4, T - 4, 2);
      ctx.fillStyle = "#1c1917";
      ctx.fillRect(x + 4, y + 6, 1, 10);   // hammer
      ctx.fillRect(x + 8, y + 6, 1, 14);   // tongs
      ctx.fillRect(x + 14, y + 6, 2, 8);   // hammer head
      ctx.fillStyle = "#a8a29e";
      ctx.fillRect(x + 13, y + 14, 4, 2);
      break;

    case "throne":
      // Tall stone-and-velvet throne
      ctx.fillStyle = "#92400e";
      ctx.fillRect(x + 4, y + 2, T - 8, T - 4);
      ctx.fillStyle = "#7f1d1d";
      ctx.fillRect(x + 6, y + 6, T - 12, 10);
      ctx.fillStyle = "#fbbf24";
      ctx.fillRect(x + (T - 4) / 2, y + 2, 2, 4); // finial
      ctx.fillRect(x + 4, y + 2, T - 8, 1);
      break;

    case "court_table":
      ctx.fillStyle = "#7c2d12";
      ctx.fillRect(x + 2, y + 8, T - 4, 8);
      ctx.fillStyle = "#451a03";
      ctx.fillRect(x + 2, y + 16, T - 4, 2);
      // candles on table
      ctx.fillStyle = "#fde68a";
      ctx.fillRect(x + 8, y + 6, 1, 3);
      ctx.fillRect(x + T - 9, y + 6, 1, 3);
      ctx.fillStyle = `rgba(253, 224, 71, ${0.5 + glow * 0.5})`;
      ctx.fillRect(x + 8, y + 4, 1, 2);
      ctx.fillRect(x + T - 9, y + 4, 1, 2);
      break;

    case "guard_post":
      // Standing-spear-and-shield post
      ctx.fillStyle = "#1c1917";
      ctx.fillRect(x + T / 2, y + 2, 1, T - 6);
      ctx.fillStyle = "#a8a29e";
      ctx.fillRect(x + T / 2 - 1, y + 2, 3, 3); // spear tip
      ctx.fillStyle = "#7f1d1d";
      ctx.fillRect(x + 4, y + 10, 6, 8); // shield
      ctx.fillStyle = "#fbbf24";
      ctx.fillRect(x + 6, y + 12, 2, 4);
      break;

    case "scholar_desk":
      ctx.fillStyle = "#854d0e";
      ctx.fillRect(x + 2, y + 8, T - 4, 10);
      ctx.fillStyle = "#451a03";
      ctx.fillRect(x + 2, y + 18, T - 4, 2);
      // book
      ctx.fillStyle = "#1c1917";
      ctx.fillRect(x + 6, y + 6, T - 12, 4);
      ctx.fillStyle = "#fef3c7";
      ctx.fillRect(x + 7, y + 7, T - 14, 2);
      // candle
      ctx.fillStyle = "#fde68a";
      ctx.fillRect(x + T - 7, y + 4, 1, 3);
      ctx.fillStyle = `rgba(253, 224, 71, ${0.5 + glow * 0.5})`;
      ctx.fillRect(x + T - 7, y + 2, 1, 2);
      break;

    case "bookshelf":
      ctx.fillStyle = "#451a03";
      ctx.fillRect(x + 2, y + 2, T - 4, T - 4);
      // Shelves
      for (let row = 4; row < T - 4; row += 6) {
        ctx.fillStyle = "#1c1917";
        ctx.fillRect(x + 4, y + row, T - 8, 1);
        // book spines
        const colors = ["#7f1d1d", "#1e40af", "#854d0e", "#3b0764"];
        for (let bx = 0; bx < 4; bx++) {
          ctx.fillStyle = colors[bx];
          ctx.fillRect(x + 4 + bx * 4, y + row + 1, 3, 4);
        }
      }
      break;

    case "candle":
      ctx.fillStyle = "#fde68a";
      ctx.fillRect(x + T / 2 - 1, y + T / 2, 2, 5);
      ctx.fillStyle = `rgba(253, 224, 71, ${0.6 + glow * 0.4})`;
      ctx.fillRect(x + T / 2, y + T / 2 - 2, 1, 3);
      // Soft halo
      ctx.fillStyle = `rgba(253, 224, 71, ${0.06 + glow * 0.08})`;
      ctx.beginPath();
      ctx.arc(x + T / 2, y + T / 2, T / 2 + 4, 0, Math.PI * 2);
      ctx.fill();
      break;

    case "hearth":
      ctx.fillStyle = "#44403c";
      ctx.fillRect(x + 2, y + 4, T - 4, T - 6);
      ctx.fillStyle = "#1c1917";
      ctx.fillRect(x + 4, y + 8, T - 8, T - 12);
      ctx.fillStyle = "#f97316";
      ctx.fillRect(x + 6, y + 10, T - 12, T - 16);
      ctx.fillStyle = `rgba(253, 224, 71, ${0.6 + glow * 0.4})`;
      ctx.fillRect(x + 8, y + 12, T - 16, T - 20);
      // mantel
      ctx.fillStyle = "#78350f";
      ctx.fillRect(x + 2, y + 2, T - 4, 2);
      break;

    case "table":
      ctx.fillStyle = "#854d0e";
      ctx.fillRect(x + 2, y + 8, T - 4, 8);
      ctx.fillStyle = "#451a03";
      ctx.fillRect(x + 2, y + 16, T - 4, 2);
      ctx.fillRect(x + 4, y + 18, 2, 4);
      ctx.fillRect(x + T - 6, y + 18, 2, 4);
      // bread on table
      ctx.fillStyle = "#fbbf24";
      ctx.fillRect(x + 8, y + 10, 6, 3);
      break;

    case "bed":
      // Wood frame
      ctx.fillStyle = "#451a03";
      ctx.fillRect(x + 2, y + 4, T - 4, T - 8);
      // Mattress
      ctx.fillStyle = "#fde68a";
      ctx.fillRect(x + 4, y + 6, T - 8, T - 12);
      // Blanket
      ctx.fillStyle = "#7c2d12";
      ctx.fillRect(x + 4, y + 12, T - 8, T - 18);
      // Pillow
      ctx.fillStyle = "#fef3c7";
      ctx.fillRect(x + 5, y + 7, T - 14, 4);
      break;

    case "loom":
      ctx.fillStyle = "#854d0e";
      ctx.fillRect(x + 3, y + 2, T - 6, T - 4);
      ctx.fillStyle = "#451a03";
      ctx.fillRect(x + 3, y + 2, 1, T - 4);
      ctx.fillRect(x + T - 4, y + 2, 1, T - 4);
      // Threads
      ctx.fillStyle = "#fef3c7";
      for (let tx = x + 5; tx < x + T - 5; tx += 2) {
        ctx.fillRect(tx, y + 4, 1, T - 8);
      }
      break;

    case "mill_wheel":
      ctx.fillStyle = "#a8a29e";
      ctx.beginPath();
      ctx.arc(x + T / 2, y + T / 2, T / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#57534e";
      ctx.lineWidth = 2;
      ctx.stroke();
      // spokes
      ctx.beginPath();
      ctx.moveTo(x + 2, y + T / 2); ctx.lineTo(x + T - 2, y + T / 2);
      ctx.moveTo(x + T / 2, y + 2); ctx.lineTo(x + T / 2, y + T - 2);
      ctx.stroke();
      break;

    case "ore_cart":
      ctx.fillStyle = "#854d0e";
      ctx.fillRect(x + 2, y + 8, T - 4, 8);
      ctx.fillStyle = "#451a03";
      ctx.fillRect(x + 2, y + 14, T - 4, 2);
      // wheels
      ctx.fillStyle = "#1c1917";
      ctx.beginPath();
      ctx.arc(x + 5, y + 18, 2, 0, Math.PI * 2);
      ctx.arc(x + T - 5, y + 18, 2, 0, Math.PI * 2);
      ctx.fill();
      // ore
      ctx.fillStyle = "#a16207";
      ctx.fillRect(x + 5, y + 6, 4, 3);
      ctx.fillRect(x + 10, y + 4, 4, 5);
      break;

    case "pickaxe_rack":
      ctx.fillStyle = "#854d0e";
      ctx.fillRect(x + 2, y + 4, T - 4, 2);
      ctx.fillStyle = "#1c1917";
      ctx.fillRect(x + 6, y + 6, 1, T - 10);
      ctx.fillStyle = "#a8a29e";
      ctx.fillRect(x + 4, y + 6, 5, 3);
      ctx.fillStyle = "#1c1917";
      ctx.fillRect(x + T - 8, y + 6, 1, T - 10);
      ctx.fillStyle = "#a8a29e";
      ctx.fillRect(x + T - 10, y + 6, 5, 3);
      break;

    case "lantern":
      ctx.fillStyle = "#854d0e";
      ctx.fillRect(x + T / 2 - 3, y + 4, 6, 8);
      ctx.fillStyle = `rgba(253, 224, 71, ${0.7 + glow * 0.3})`;
      ctx.fillRect(x + T / 2 - 2, y + 6, 4, 4);
      // Halo
      ctx.fillStyle = `rgba(253, 224, 71, ${0.08 + glow * 0.1})`;
      ctx.beginPath();
      ctx.arc(x + T / 2, y + 8, T, 0, Math.PI * 2);
      ctx.fill();
      break;

    case "watch_floor":
      // Wooden floor planks
      ctx.fillStyle = "#78350f";
      ctx.fillRect(x + 2, y + 2, T - 4, T - 4);
      ctx.strokeStyle = "#451a03";
      ctx.lineWidth = 1;
      for (let py = y + 4; py < y + T - 4; py += 4) {
        ctx.beginPath();
        ctx.moveTo(x + 2, py);
        ctx.lineTo(x + T - 2, py);
        ctx.stroke();
      }
      break;

    case "telescope":
      ctx.fillStyle = "#1c1917";
      ctx.fillRect(x + 4, y + T / 2 - 2, T - 8, 4);
      ctx.fillRect(x + T / 2 - 2, y + 6, 4, T - 8);
      ctx.fillStyle = "#92400e";
      ctx.fillRect(x + 4, y + T / 2 - 4, 2, 8);
      // tiny star pip — the thing being observed
      ctx.fillStyle = `rgba(253, 230, 138, ${0.7 + glow * 0.3})`;
      ctx.fillRect(x + T - 7, y + 4, 2, 2);
      break;

    case "star_chart":
      // navy parchment with scattered gold "stars"
      ctx.fillStyle = "#1e293b";
      ctx.fillRect(x + 3, y + 6, T - 6, T - 10);
      ctx.fillStyle = "#fbbf24";
      // 5 gold dots positioned deterministically
      [[2, 2], [6, 4], [10, 3], [4, 8], [9, 9]].forEach(([dx, dy]) => {
        ctx.fillRect(x + 3 + dx, y + 6 + dy, 1, 1);
      });
      break;

    case "altar":
      ctx.fillStyle = "#d6d3d1";
      ctx.fillRect(x + 4, y + 8, T - 8, T - 12);
      ctx.fillStyle = "#a8a29e";
      ctx.fillRect(x + 4, y + 8, T - 8, 2);
      // glyph + candle
      ctx.fillStyle = "#fbbf24";
      ctx.fillRect(x + T / 2 - 1, y + 12, 2, 4);
      ctx.fillStyle = `rgba(253, 224, 71, ${0.7 + glow * 0.3})`;
      ctx.fillRect(x + T / 2, y + 10, 1, 2);
      break;

    case "kneeler":
      ctx.fillStyle = "#7c2d12";
      ctx.fillRect(x + 4, y + 14, T - 8, 4);
      ctx.fillStyle = "#451a03";
      ctx.fillRect(x + 4, y + 18, T - 8, 2);
      break;

    case "campfire":
      ctx.fillStyle = "#1c1917";
      ctx.fillRect(x + 4, y + 14, T - 8, 4);
      ctx.fillStyle = "#854d0e";
      ctx.fillRect(x + 6, y + 12, 3, 6);
      ctx.fillRect(x + T - 9, y + 12, 3, 6);
      ctx.fillStyle = "#f97316";
      ctx.fillRect(x + 6, y + 8, T - 12, 6);
      ctx.fillStyle = `rgba(253, 224, 71, ${0.7 + glow * 0.3})`;
      ctx.fillRect(x + 8, y + 10, T - 16, 4);
      break;

    case "tent":
      // Triangle tent (drawn as a couple of rectangles)
      for (let dy = 0; dy < 12; dy++) {
        ctx.fillStyle = dy < 4 ? "#a16207" : "#854d0e";
        ctx.fillRect(x + 4 + dy, y + 8 + dy, T - 8 - dy * 2, 1);
      }
      ctx.fillStyle = "#451a03";
      ctx.fillRect(x + T / 2 - 1, y + 16, 2, 4);
      break;

    case "stone":
      ctx.fillStyle = "#52525b";
      ctx.fillRect(x + 6, y + 4, T - 12, T - 8);
      ctx.fillStyle = "#71717a";
      ctx.fillRect(x + 6, y + 4, T - 12, 2);
      ctx.fillStyle = "#27272a";
      ctx.fillRect(x + 6, y + T - 6, T - 12, 2);
      // moss
      ctx.fillStyle = "#3a4d2d";
      ctx.fillRect(x + 7, y + T - 6, 4, 2);
      break;

    case "obelisk_face":
      ctx.fillStyle = "#52525b";
      ctx.fillRect(x + T / 2 - 3, y + 2, 6, T - 4);
      ctx.fillStyle = "#71717a";
      ctx.fillRect(x + T / 2 - 3, y + 2, 1, T - 4);
      ctx.fillStyle = "#27272a";
      ctx.fillRect(x + T / 2 + 2, y + 2, 1, T - 4);
      // glyph
      ctx.fillStyle = "#fde047";
      ctx.fillRect(x + T / 2 - 1, y + T / 2, 2, 4);
      break;

    case "well_mouth":
      ctx.fillStyle = "#9ca3af";
      ctx.beginPath();
      ctx.ellipse(x + T / 2, y + T / 2 + 4, T / 2 - 2, 5, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#3b82f6";
      ctx.beginPath();
      ctx.ellipse(x + T / 2, y + T / 2 + 2, T / 2 - 5, 3, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.fillStyle = "#93c5fd";
      ctx.fillRect(x + T / 2 - 3, y + T / 2 + 1, 6, 1);
      break;

    case "ruin_arch":
      // Half-collapsed archway
      ctx.fillStyle = "#78716c";
      ctx.fillRect(x + 2, y + 4, 4, T - 6);
      ctx.fillRect(x + T - 6, y + 4, 4, T - 6);
      ctx.fillRect(x + 2, y + 2, 6, 2);
      // Missing top half — implied by absence
      break;

    case "wander":
    default:
      // Decor dot for unknown / wander placeholders
      ctx.fillStyle = "#52525b";
      ctx.fillRect(x + T / 2 - 1, y + T / 2 - 1, 2, 2);
      break;
  }
}

/**
 * Draw a tiny NPC marker (just a body + head, not the full 32x32 sprite).
 * Position is in interior-tile coordinates, centered.
 */
export function drawNpcAt(
  opts: DrawOpts,
  ix: number,
  iy: number,
  bodyColor: string,
  trim: string,
  skin: string = "#fde68a",
) {
  const { ctx } = opts;
  const T = opts.tilePx ?? INTERIOR_TILE_PX;
  const cx = ix * T + T / 2;
  const cy = iy * T + T / 2;
  // body
  ctx.fillStyle = bodyColor;
  ctx.fillRect(cx - 4, cy - 2, 8, 8);
  // shoulders trim
  ctx.fillStyle = trim;
  ctx.fillRect(cx - 4, cy - 2, 8, 2);
  // head
  ctx.fillStyle = skin;
  ctx.fillRect(cx - 3, cy - 9, 6, 7);
  // hair (top)
  ctx.fillStyle = "#451a03";
  ctx.fillRect(cx - 3, cy - 9, 6, 2);
  // eyes
  ctx.fillStyle = "#0c0a09";
  ctx.fillRect(cx - 2, cy - 5, 1, 1);
  ctx.fillRect(cx + 1, cy - 5, 1, 1);
}

/** Default body palette by role — matches the overworld character renderer. */
export function bodyColorFor(role: string): [string, string] {
  switch (role) {
    case "monarch":    return ["#7c2d12", "#fbbf24"];
    case "guard":      return ["#dc2626", "#fbbf24"];
    case "blacksmith": return ["#7c2d12", "#9a3412"];
    case "miner":      return ["#52525b", "#a16207"];
    case "scholar":    return ["#7c3aed", "#a78bfa"];
    case "courier":    return ["#16a34a", "#fde68a"];
    case "villager":
    default:           return ["#1d4ed8", "#fbbf24"];
  }
}
