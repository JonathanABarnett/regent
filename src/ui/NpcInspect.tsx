import { useEffect, useRef, useState } from "react";
import type { World } from "../sim/World";
import type { NPC } from "../sim/types";
import { setHoveredNpc } from "../engine/HoverState";

interface HoverState {
  npc: NPC;
  partner?: NPC | null;
  parents?: NPC[];
  screen: { x: number; y: number };
}

/**
 * Hover-over-NPC tooltip + click-to-profile.
 *
 * On hover: renders a compact info card near the cursor.
 * On click: calls `onClickNpc(npc.id)` so App can open NPCProfilePanel.
 *
 * Cheap: only computes on mousemove via rAF, and only re-renders when the
 * nearest NPC changes identity. Doesn't touch the Pixi stage at all.
 */
export function NpcInspect({
  getCanvas,
  getCamera,
  getWorld,
  onClickNpc,
}: {
  getCanvas: () => HTMLCanvasElement | null;
  getCamera: () => { x: number; y: number; zoom: number } | null;
  getWorld: () => World | null;
  onClickNpc?: (npcId: string) => void;
}) {
  const [hover, setHover] = useState<HoverState | null>(null);
  // Track the current hover NPC id in a ref so the click handler can read it
  // without a stale closure.
  const hoverIdRef = useRef<string | null>(null);
  // The royal pet is hoverable + clickable too — clicking pets it.
  const [petHover, setPetHover] = useState<{ name: string; screen: { x: number; y: number } } | null>(null);
  const hoverPetIdRef = useRef<string | null>(null);

  useEffect(() => {
    let raf = 0;
    const onMove = (ev: MouseEvent) => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(() => {
        const canvas = getCanvas();
        const cam = getCamera();
        const world = getWorld();
        if (!canvas || !cam || !world) {
          setHover(null);
          hoverIdRef.current = null;
          return;
        }
        const rect = canvas.getBoundingClientRect();
        const px = ev.clientX - rect.left;
        const py = ev.clientY - rect.top;
        if (px < 0 || py < 0 || px > rect.width || py > rect.height) {
          setHover(null);
          hoverIdRef.current = null;
          return;
        }
        // map screen → tile-space
        const T = 32;
        const tileX = (px - rect.width / 2) / (T * cam.zoom) + cam.x;
        const tileY = (py - rect.height / 2) / (T * cam.zoom) + cam.y;
        // find nearest NPC within ~1 tile (same offset math as EntityLayer)
        let best: NPC | null = null;
        let bestDist = 1.2;
        for (const n of world.npcs) {
          const ox = (hashOffset01(n.seed) - 0.5) * 0.6;
          const oy = (hashOffset01(n.seed * 7919) - 0.5) * 0.35;
          const dx = n.pos.x + ox - tileX;
          const dy = n.pos.y + oy - tileY;
          const d = Math.hypot(dx, dy);
          if (d < bestDist) {
            best = n;
            bestDist = d;
          }
        }
        // The royal pet competes with NPCs for the hover — whichever is
        // nearer wins. Clicking a hovered pet pets it (no profile panel).
        let bestPet: { id: string; name: string } | null = null;
        let bestPetDist = 1.2;
        for (const p of world.pets) {
          const d = Math.hypot(p.pos.x - tileX, p.pos.y - tileY);
          if (d < bestPetDist) {
            bestPet = { id: p.id, name: p.name };
            bestPetDist = d;
          }
        }
        if (bestPet && bestPetDist < bestDist) {
          hoverPetIdRef.current = bestPet.id;
          setPetHover({ name: bestPet.name, screen: { x: ev.clientX + 14, y: ev.clientY + 14 } });
          setHover(null);
          setHoveredNpc(null);
          hoverIdRef.current = null;
          return;
        }
        hoverPetIdRef.current = null;
        setPetHover(null);

        if (!best) {
          setHover(null);
          setHoveredNpc(null);
          hoverIdRef.current = null;
          return;
        }
        const partner = best.partnerId
          ? world.npcs.find((n) => n.id === best!.partnerId) ?? null
          : null;
        const parents: NPC[] = [];
        if (best.parentIds) {
          for (const pid of best.parentIds) {
            const p = world.npcs.find((n) => n.id === pid);
            if (p) parents.push(p);
          }
        }
        hoverIdRef.current = best.id;
        setHover({
          npc: best,
          partner,
          parents: parents.length ? parents : undefined,
          screen: { x: ev.clientX + 14, y: ev.clientY + 14 },
        });
        setHoveredNpc(best.id);
      });
    };
    const onLeave = () => {
      setHover(null);
      setHoveredNpc(null);
      hoverIdRef.current = null;
      setPetHover(null);
      hoverPetIdRef.current = null;
    };
    // Click on the canvas → pet the hovered pet, or open the profile panel
    // for the currently-hovered NPC.
    const onClick = () => {
      if (hoverPetIdRef.current) {
        getWorld()?.petThePet(hoverPetIdRef.current);
        return;
      }
      if (hoverIdRef.current && onClickNpc) {
        onClickNpc(hoverIdRef.current);
      }
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseleave", onLeave);
    // Attach click to the canvas specifically so map drags don't trigger it.
    const canvas = getCanvas();
    canvas?.addEventListener("click", onClick);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseleave", onLeave);
      canvas?.removeEventListener("click", onClick);
    };
  }, [getCanvas, getCamera, getWorld, onClickNpc]);

  if (petHover) {
    return (
      <div
        className="npc-tooltip pet-tooltip"
        style={{ left: petHover.screen.x, top: petHover.screen.y }}
      >
        <div className="npc-tooltip-name">🐾 {petHover.name}</div>
        <div className="npc-tooltip-hint">click to pet</div>
      </div>
    );
  }

  if (!hover) return null;
  const { npc, partner, parents, screen } = hover;
  return (
    <div
      className="npc-tooltip"
      style={{ left: screen.x, top: screen.y }}
      role="tooltip"
    >
      <div className="npc-name">{npc.name ?? `(unnamed ${npc.role})`}</div>
      <div className="npc-role">
        {npc.role} · age {Math.floor(npc.age ?? 0)}
        {npc.trait && <> · <span className="npc-trait">{npc.trait}</span></>}
      </div>
      <div className="npc-home">lives in {pretty(npc.homeId)}</div>
      {partner && <div className="npc-partner">wed to {partner.name}</div>}
      {parents && parents.length > 0 && (
        <div className="npc-parents">
          child of {parents.map((p) => p.name).filter(Boolean).join(" and ")}
        </div>
      )}
      {npc.speech && <div className="npc-speech">"{npc.speech}"</div>}
      {onClickNpc && (
        <div className="npc-tooltip-hint">click for full profile</div>
      )}
    </div>
  );
}

function pretty(id: string) {
  return id ? id.charAt(0).toUpperCase() + id.slice(1) : "the kingdom";
}

/**
 * Match EntityLayer's hash01 — keeps hover detection in lockstep with the
 * deterministic per-seed sub-tile offsets the renderer applies to NPCs.
 */
function hashOffset01(n: number): number {
  let x = (n | 0) >>> 0;
  x = Math.imul(x ^ (x >>> 16), 0x85ebca6b);
  x = Math.imul(x ^ (x >>> 13), 0xc2b2ae35);
  x ^= x >>> 16;
  return (x >>> 0) / 0xffffffff;
}
