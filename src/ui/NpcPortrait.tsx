import { useEffect, useRef } from "react";
import { CanvasSurface, drawCharacter } from "../engine/CharacterRenderer";
import { specFromSeed } from "../engine/CharacterSpec";

/**
 * Deterministic pixel portrait for an NPC seed. A villager asking the
 * crown for shelter should be a face, not just a name — faces are what
 * players attach to. Same seed always renders the same person.
 */
export function NpcPortrait({ seed, size = 56 }: { seed: number; size?: number }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    const off = document.createElement("canvas");
    off.width = 32;
    off.height = 32;
    const offCtx = off.getContext("2d");
    if (!offCtx) return;
    drawCharacter(new CanvasSurface(offCtx), specFromSeed(seed), 0, "s");
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, size, size);
    ctx.drawImage(off, 0, 0, size, size);
  }, [seed, size]);
  return <canvas ref={ref} width={size} height={size} className="npc-portrait" aria-hidden="true" />;
}
