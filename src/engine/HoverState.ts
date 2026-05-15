/**
 * Lightweight module-level state for "what NPC is the mouse over right now".
 * Written by the NpcInspect tooltip (which already does the pick), read by
 * the EntityLayer (which draws a highlight ring under that NPC's sprite).
 *
 * A module global is acceptable here because there's only ever one cursor
 * and one Pixi stage in this app — no concurrency concerns.
 */

export const hoverState: { npcId: string | null } = { npcId: null };

export function setHoveredNpc(id: string | null) {
  hoverState.npcId = id;
}
