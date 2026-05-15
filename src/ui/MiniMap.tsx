import { useEffect, useRef } from "react";
import type { World } from "../sim/World";
import type { TileKind } from "../sim/types";

const SIZE = 160; // CSS pixels
const REDRAW_INTERVAL_MS = 500;

/**
 * Tiny overworld minimap. Draws the entire tile map once into an offscreen
 * canvas, then overlays NPC dots + the camera viewport rectangle on each
 * redraw (500ms). Click to recenter the camera.
 */
export function MiniMap({
  getWorld,
  getCamera,
  onJumpTo,
}: {
  getWorld: () => World | null;
  getCamera: () => { x: number; y: number; zoom: number } | null;
  onJumpTo: (x: number, y: number) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const baseRef = useRef<HTMLCanvasElement | null>(null);

  // Build the static base layer (terrain) once when the world becomes available.
  useEffect(() => {
    const id = window.setInterval(() => {
      const world = getWorld();
      if (!world) return;
      if (baseRef.current && baseRef.current.dataset.seed === String(world.state.seed)) {
        // already built for this seed
        clearInterval(id);
        return;
      }
      const off = document.createElement("canvas");
      off.width = world.map.width;
      off.height = world.map.height;
      const ctx = off.getContext("2d");
      if (!ctx) return;
      const img = ctx.createImageData(world.map.width, world.map.height);
      for (let y = 0; y < world.map.height; y++) {
        for (let x = 0; x < world.map.width; x++) {
          const t = world.map.tiles[y * world.map.width + x];
          const [r, g, b] = tileColor(t.kind);
          const i = (y * world.map.width + x) * 4;
          img.data[i] = r;
          img.data[i + 1] = g;
          img.data[i + 2] = b;
          img.data[i + 3] = 255;
        }
      }
      ctx.putImageData(img, 0, 0);
      off.dataset.seed = String(world.state.seed);
      baseRef.current = off;
      clearInterval(id);
    }, 200);
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
      // camera viewport rectangle
      const view = 16 / cam.zoom; // approx tiles in view at zoom
      ctx.strokeStyle = "rgba(251, 191, 36, 0.9)";
      ctx.lineWidth = 1;
      ctx.strokeRect(
        (cam.x - view / 2) * sx,
        (cam.y - view / 2) * sy,
        view * sx,
        view * sy,
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

  return (
    <div className="mini-map">
      <canvas
        ref={canvasRef}
        width={SIZE}
        height={SIZE}
        onClick={handleClick}
        title="Click to jump the camera"
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
