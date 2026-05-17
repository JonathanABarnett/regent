import { Container, Graphics } from "pixi.js";
import type { World } from "../../sim/World";

/**
 * Kingdom borders — a soft, dashed polygon outline encompassing every
 * claimed structure on the map. Purely decorative: there's no border
 * collision, no fog-of-war, no mechanical effect. The visual is what
 * delivers the "my kingdom is growing" emotional payoff.
 *
 * Construction:
 *   1. Collect every structure position as (cx, cy)
 *   2. Inflate each by a per-kind radius so the hull sits a few tiles
 *      outside the structure rather than touching it
 *   3. Convex-hull all the inflated corner points
 *   4. Draw the hull as a dashed outline
 *
 * The hull naturally expands when:
 *   - The player commissions a watchtower / mill / shrine via Construction
 *   - A landmark is discovered via NarrativeDirector's emergence branch
 *   - Any new structure lands on the map at runtime
 *
 * Re-computed every frame because that cost is trivial (≤ a few dozen
 * points); avoids needing dirty-tracking when structures are added.
 */
export class BorderLayer {
  readonly container = new Container();
  private g = new Graphics();

  constructor(private world: World) {
    this.container.label = "border";
    this.container.addChild(this.g);
  }

  /** Called from PixiApp.render each frame. */
  update() {
    this.g.clear();
    const structures = this.world.map.structures;
    if (structures.length === 0) return;

    // For each structure, gather expanded corner points. Bigger structures
    // (castle, towns) get a larger pad so the hull breathes a bit.
    const points: Array<[number, number]> = [];
    for (const s of structures) {
      const pad = padFor(s.kind);
      const x0 = s.pos.x - pad;
      const y0 = s.pos.y - pad;
      const x1 = s.pos.x + s.size.x + pad;
      const y1 = s.pos.y + s.size.y + pad;
      points.push([x0, y0], [x1, y0], [x1, y1], [x0, y1]);
    }

    const hull = convexHull(points);
    if (hull.length < 3) return;

    const T = 32;
    // Soft territory fill only — no border line. The region tints subtly
    // so the player can feel the extent of their kingdom without any lines
    // that read as game UI elements.
    this.g.poly(hull.flatMap(([x, y]) => [x * T, y * T]));
    this.g.fill({ color: 0xfde68a, alpha: 0.05 });
  }
}

/** Per-structure-kind padding so the hull breathes around bigger anchors. */
function padFor(kind: string): number {
  switch (kind) {
    case "castle": return 4;
    case "town": return 3;
    case "library":
    case "forge":
    case "mine":
      return 2.5;
    default:
      return 2; // watchtower, mill, shrine, ruin, etc.
  }
}

/**
 * Andrew's monotone chain convex hull. Returns the hull vertices in CCW
 * order. O(n log n). Standard textbook implementation.
 */
function convexHull(pts: Array<[number, number]>): Array<[number, number]> {
  if (pts.length < 2) return pts.slice();
  // Sort by x, then y
  const sorted = pts
    .slice()
    .sort((a, b) => (a[0] === b[0] ? a[1] - b[1] : a[0] - b[0]));
  const lower: Array<[number, number]> = [];
  for (const p of sorted) {
    while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], p) <= 0) {
      lower.pop();
    }
    lower.push(p);
  }
  const upper: Array<[number, number]> = [];
  for (let i = sorted.length - 1; i >= 0; i--) {
    const p = sorted[i];
    while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], p) <= 0) {
      upper.pop();
    }
    upper.push(p);
  }
  upper.pop();
  lower.pop();
  return lower.concat(upper);
}

function cross(o: [number, number], a: [number, number], b: [number, number]): number {
  return (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0]);
}

interface DashedOpts {
  color: number;
  alpha: number;
  width: number;
  dash: number;
  gap: number;
}

/**
 * Draw a dashed polygon by laying down small line segments along each edge.
 * The dash pattern advances continuously so corners don't break the rhythm.
 */
function drawDashedPolygon(g: Graphics, pts: Array<[number, number]>, opts: DashedOpts) {
  if (pts.length < 2) return;
  const stroke = { color: opts.color, alpha: opts.alpha, width: opts.width };
  let on = true;
  let remaining = opts.dash;
  // Walk the edges, painting dash segments
  for (let i = 0; i < pts.length; i++) {
    const a = pts[i];
    const b = pts[(i + 1) % pts.length];
    const dx = b[0] - a[0];
    const dy = b[1] - a[1];
    const len = Math.hypot(dx, dy);
    if (len === 0) continue;
    const ux = dx / len;
    const uy = dy / len;
    let cursor = 0;
    while (cursor < len) {
      const step = Math.min(remaining, len - cursor);
      const sx = a[0] + ux * cursor;
      const sy = a[1] + uy * cursor;
      const ex = a[0] + ux * (cursor + step);
      const ey = a[1] + uy * (cursor + step);
      if (on) {
        g.moveTo(sx, sy).lineTo(ex, ey).stroke(stroke);
      }
      cursor += step;
      remaining -= step;
      if (remaining <= 0) {
        on = !on;
        remaining = on ? opts.dash : opts.gap;
      }
    }
  }
}
