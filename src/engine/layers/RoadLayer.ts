/**
 * RoadLayer — draws pixel-art dirt paths connecting the castle to every other
 * structure. Computed once at construction using the walkable tile graph,
 * rendered as a static Graphics layer that sits between the terrain tiles
 * and the BorderLayer.
 *
 * Roads are 1–2px wide, drawn in a warm grey-brown that reads as a well-worn
 * path without dominating the terrain. At 480×270 (low-res mode) each path
 * tile is about 32 real pixels, so the road reads as a classic SNES overworld
 * trail.
 *
 * Implementation:
 *   1. Find the castle (or first structure if none). This is the hub.
 *   2. For each other structure, run a lightweight BFS on the walkable tile
 *      grid to find the shortest path from hub centre → structure centre.
 *      (Uses BFS, not A*, to avoid importing the full A* heap into the engine
 *      layer; roads are computed once so O(n·mapSize) is fine.)
 *   3. Paint each path tile as a 3×3 cross mark at 35% opacity, so overlapping
 *      paths from multiple structures naturally darken to a broader road.
 */
import { Container, Graphics } from "pixi.js";
import type { OverworldMap } from "../../sim/Map";

const ROAD_COLOR  = 0xa37858;   // warm sandy-brown
const ROAD_ALPHA  = 0.32;       // light enough to read terrain beneath
const ROAD_ALPHA2 = 0.18;       // outer fringe of a wider crossing

export class RoadLayer {
  readonly container = new Container();
  private g = new Graphics();

  constructor(private map: OverworldMap) {
    this.container.label = "roads";
    this.container.addChild(this.g);
    this.build();
  }

  // Public no-op update — roads are static after init.
  // PixiApp calls this each frame but nothing happens; keeping the call site
  // consistent with other layers that do need per-frame work.
  update(): void {}

  private build(): void {
    const T = 32;
    const structures = this.map.structures.filter(
      (s) => s.kind !== "standing_stones" && s.kind !== "ruin" &&
             s.kind !== "camp" && s.kind !== "wellspring" && s.kind !== "obelisk",
    );
    if (structures.length < 2) return;

    // Hub = castle or first structure.
    const hub = structures.find((s) => s.kind === "castle") ?? structures[0];
    const hubCx = Math.floor(hub.pos.x + hub.size.x / 2);
    const hubCy = Math.floor(hub.pos.y + hub.size.y / 2);

    // Accumulate how many roads cross each tile (darker = intersection).
    const crossCount = new Map<number, number>();
    const stamp = (x: number, y: number) => {
      const k = y * this.map.width + x;
      crossCount.set(k, (crossCount.get(k) ?? 0) + 1);
    };

    for (const s of structures) {
      if (s === hub) continue;
      const cx = Math.floor(s.pos.x + s.size.x / 2);
      const cy = Math.floor(s.pos.y + s.size.y / 2);
      const path = this.bfs({ x: hubCx, y: hubCy }, { x: cx, y: cy });
      if (!path) continue;
      for (const pt of path) stamp(pt.x, pt.y);
    }

    // Render: each crossed tile gets a small splotch of dirt-road colour.
    // More crossings = slightly more opaque (intersection effect).
    for (const [key, count] of crossCount) {
      const tx = key % this.map.width;
      const ty = Math.floor(key / this.map.width);
      const px = tx * T;
      const py = ty * T;
      const alpha = Math.min(ROAD_ALPHA + (count - 1) * 0.08, 0.55);

      // Centre 4×4 core of the road tile
      this.g.rect(px + 14, py + 14, 4, 4).fill({ color: ROAD_COLOR, alpha });
      // Cardinal cross arms (bleed 4px out from centre, 2px wide)
      this.g.rect(px + 14, py + 10, 4, 4).fill({ color: ROAD_COLOR, alpha: alpha * 0.75 }); // N
      this.g.rect(px + 14, py + 18, 4, 4).fill({ color: ROAD_COLOR, alpha: alpha * 0.75 }); // S
      this.g.rect(px + 10, py + 14, 4, 4).fill({ color: ROAD_COLOR, alpha: alpha * 0.75 }); // W
      this.g.rect(px + 18, py + 14, 4, 4).fill({ color: ROAD_COLOR, alpha: alpha * 0.75 }); // E
      // Outer fringe — faint 1px edge pixels to soften the road boundary
      this.g.rect(px + 13, py + 13, 6, 6).fill({ color: ROAD_COLOR, alpha: ROAD_ALPHA2 });
    }
  }

  /** BFS on the walkable tile graph. Returns the path (excluding start), or null. */
  private bfs(
    start: { x: number; y: number },
    goal:  { x: number; y: number },
  ): Array<{ x: number; y: number }> | null {
    const { width, height, tiles } = this.map;
    const key   = (x: number, y: number) => y * width + x;
    const valid = (x: number, y: number) =>
      x >= 0 && y >= 0 && x < width && y < height;

    if (!valid(start.x, start.y) || !valid(goal.x, goal.y)) return null;

    const parent = new Map<number, number>();
    const queue: Array<{ x: number; y: number }> = [start];
    parent.set(key(start.x, start.y), -1);

    const DX = [1, -1, 0, 0];
    const DY = [0, 0, 1, -1];

    let found = false;
    while (queue.length && !found) {
      const cur = queue.shift()!;
      for (let d = 0; d < 4; d++) {
        const nx = cur.x + DX[d];
        const ny = cur.y + DY[d];
        if (!valid(nx, ny)) continue;
        const nk = key(nx, ny);
        if (parent.has(nk)) continue;
        const tile = tiles[nk];
        // Roads can cross non-walkable tiles (mountains etc.) but we prefer
        // walkable routes. Allow both so roads always connect.
        parent.set(nk, key(cur.x, cur.y));
        if (nx === goal.x && ny === goal.y) { found = true; break; }
        // Only expand through walkable tiles to keep roads on traversable ground.
        if (tile?.walkable) queue.push({ x: nx, y: ny });
      }
    }
    if (!found) return null;

    // Reconstruct path
    const path: Array<{ x: number; y: number }> = [];
    let cur = key(goal.x, goal.y);
    while (cur !== -1) {
      const x = cur % width;
      const y = Math.floor(cur / width);
      path.unshift({ x, y });
      cur = parent.get(cur) ?? -1;
    }
    return path.slice(1); // exclude start tile
  }
}
