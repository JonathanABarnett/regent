import { useEffect, useRef } from "react";
import type { World } from "../sim/World";
import type { TileKind } from "../sim/types";

const SIZE = 160; // CSS pixels (width); height is computed from map aspect ratio
const REDRAW_INTERVAL_MS = 500;

/**
 * Tiny overworld minimap. Draws the entire tile map once into an offscreen
 * canvas, then overlays NPC dots + the camera viewport rectangle on each
 * redraw (500ms). Click to recenter the camera.
 */
export interface MiniMapCamera {
  x: number;
  y: number;
  zoom: number;
  /** Viewport width in tiles — passed from PixiApp renderer dimensions. */
  viewW: number;
  /** Viewport height in tiles. */
  viewH: number;
}

export function MiniMap({
  getWorld,
  getCamera,
  onJumpTo,
}: {
  getWorld: () => World | null;
  getCamera: () => MiniMapCamera | null;
  onJumpTo: (x: number, y: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);

  // Build (and periodically rebuild) the base terrain layer. Rebuilds every
  // 2 seconds, but only if the explored-tile count actually changed. This
  // catches BOTH the weekly radius expansion AND the NPC-driven reveals
  // from Exploration.revealAround() — which only flip individual tiles
  // without changing the radius. (The previous radius-based dirty check
  // missed every NPC discovery.)
  useEffect(() => {
    let lastExploredCount = -1;
    const id = window.setInterval(() => {
      const world = getWorld();
      if (!world) return;
      // Cheap O(n) scan to count explored tiles. Faster than rebuilding
      // (no canvas pixel writes) so we use it as the dirty check.
      let exploredCount = 0;
      for (const t of world.map.tiles) if (t.explored) exploredCount++;
      const seedKey = String(world.state.seed);
      if (baseRef.current &&
          baseRef.current.dataset.seed === seedKey &&
          exploredCount === lastExploredCount) return;
      lastExploredCount = exploredCount;
      const off = document.createElement("canvas");
      off.width = world.map.width;
      off.height = world.map.height;
      const ctx = off.getContext("2d");
      if (!ctx) return;
      const img = ctx.createImageData(world.map.width, world.map.height);
      for (let y = 0; y < world.map.height; y++) {
        for (let x = 0; x < world.map.width; x++) {
          const t = world.map.tiles[y * world.map.width + x];
          const i = (y * world.map.width + x) * 4;
          if (t.explored) {
            const [r, g, b] = tileColor(t.kind);
            img.data[i] = r; img.data[i + 1] = g; img.data[i + 2] = b;
          } else {
            img.data[i] = 13; img.data[i + 1] = 13; img.data[i + 2] = 26;
          }
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      off.dataset.seed = String(world.state.seed);
      baseRef.current = off;
    }, 2000);
    return () => clearInterval(id);
  }, [getWorld]);

  // Periodic overlay redraw.
  useEffect(() => {
    const id = window.setInterval(() => {
      const world = getWorld();
      const cam = getCamera();
      const canvas = canvasRef.current;
      const base = baseRef.current;
      if (!world || !cam || !canvas || !base) return;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.imageSmoothingEnabled = false;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      // base terrain (scaled up)
      ctx.drawImage(base, 0, 0, canvas.width, canvas.height);
      const sx = canvas.width / world.map.width;
      const sy = canvas.height / world.map.height;
      // structures
      for (const s of world.map.structures) {
        ctx.fillStyle = structureColor(s.kind);
        ctx.fillRect(
          (s.pos.x + s.size.x / 2) * sx - 2,
          (s.pos.y + s.size.y / 2) * sy - 2,
          4,
          4,
        );
      }
      // NPC dots
      for (const n of world.npcs) {
        if (n.role === "monarch") ctx.fillStyle = "#fde047";
        else if (n.role === "courier") ctx.fillStyle = "#22c55e";
        else if (n.role === "guard") ctx.fillStyle = "#fb7185";
        else ctx.fillStyle = "#cbd5e1";
        ctx.fillRect(n.pos.x * sx, n.pos.y * sy, 1, 1);
      }
      // Pet dot
      for (const p of world.pets) {
        ctx.fillStyle = "#f472b6";
        ctx.fillRect(p.pos.x * sx, p.pos.y * sy, 2, 2);
      }
      // Region labels — small text at saved positions, only if the tile is explored.
      ctx.font = "9px sans-serif";
      ctx.textBaseline = "middle";
      ctx.textAlign = "center";
      for (const label of world.regions.list()) {
        const tile = world.map.tiles[label.pos.y * world.map.width + label.pos.x];
        if (!tile?.explored) continue;
        const x = label.pos.x * sx;
        const y = label.pos.y * sy;
        // Dot marker
        ctx.fillStyle = "rgba(251, 191, 36, 0.9)";
        ctx.fillRect(x - 1, y - 1, 2, 2);
        // Outlined text (white outline so it reads on any terrain)
        ctx.lineWidth = 2;
        ctx.strokeStyle = "rgba(0, 0, 0, 0.8)";
        ctx.strokeText(label.name, x, y - 5);
        ctx.fillStyle = "#fde68a";
        ctx.fillText(label.name, x, y - 5);
      }

      // Viewport rectangle — uses actual tile dimensions from the renderer
      // so the box is always accurate regardless of zoom or map size.
      ctx.strokeStyle = "rgba(251, 191, 36, 0.95)";
      ctx.lineWidth = 1.5;
      ctx.strokeRect(
        (cam.x - cam.viewW / 2) * sx,
        (cam.y - cam.viewH / 2) * sy,
        cam.viewW * sx,
        cam.viewH * sy,
      );
    }, REDRAW_INTERVAL_MS);
    return () => clearInterval(id);
  }, [getWorld, getCamera]);

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const world = getWorld();
    if (!world) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    onJumpTo(px * world.map.width, py * world.map.height);
  };

  /** Right-click anywhere on the minimap to drop a named region label. */
  const handleContext = (e: React.MouseEvent<HTMLCanvasElement>) => {
    e.preventDefault();
    const world = getWorld();
    if (!world) return;
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    const px = (e.clientX - rect.left) / rect.width;
    const py = (e.clientY - rect.top) / rect.height;
    const tx = Math.round(px * world.map.width);
    const ty = Math.round(py * world.map.height);
    const tile = world.map.tiles[ty * world.map.width + tx];
    if (!tile?.explored) {
      // Don't allow naming places the kingdom hasn't scouted.
      return;
    }
    const name = window.prompt("Name this region:");
    if (name && name.trim()) {
      world.regions.add(name, { x: tx, y: ty });
    }
  };

  // Compute height to match the map's actual aspect ratio (e.g. 320×200 → 100px tall).
  const world = getWorld();
  const mapAspect = world ? world.map.height / world.map.width : 0.625;
  const canvasH = Math.round(SIZE * mapAspect);

  return (
    <div className="mini-map">
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={canvasH || SIZE}
        onClick={handleClick}
        onContextMenu={handleContext}
        title="Click to jump · Right-click to name a region"
      />
    </div>
  );
}

function tileColor(kind: TileKind): [number, number, number] {
  switch (kind) {
    case "ocean":    return [30, 58, 138];
    case "coast":    return [253, 224, 71];
    case "river":    return [59, 130, 246];
    case "plain":    return [101, 163, 13];
    case "forest":   return [22, 101, 52];
    case "hill":     return [161, 98, 7];
    case "mountain": return [120, 113, 108];
    case "snow":     return [231, 229, 228];
  }
}

function structureColor(kind: string): string {
  switch (kind) {
    case "castle": return "#fde047";
    case "town": return "#dc2626";
    case "library": return "#a78bfa";
    case "forge": return "#f97316";
    case "mine": return "#52525b";
    default: return "#ffffff";
  }
}
