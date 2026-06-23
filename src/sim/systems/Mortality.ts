import type { World } from "../World";
import { plantGrave } from "./Graves";

/**
 * Take a named villager's life as the direct consequence of a player's
 * choice — the permanent loss that makes a decision weigh something. This
 * is the other half of "choices change the world": welcoming a family
 * raises a cottage that stays; a hard call costs a life, and a gravestone
 * stays by the keep to prove it.
 *
 * Mirrors the death bookkeeping the Disasters / LifeEvents systems already
 * do (roster removal, partner/child relationship cleanup, a "life" journal
 * line, a grave, a remembrance record), but reusable from a decision's
 * onChoose handler. Refuses to take the monarch (succession is its own
 * path) — returns null in that case.
 *
 * `causeLine` is the prose written to the chronicle; pass it pre-built so
 * the caller can name the specific dilemma. Grief about a surviving partner
 * is appended automatically.
 *
 * Returns the deceased's name on success, or null if the npc is gone /
 * is the monarch / has no name.
 */
export function takeNpcLife(world: World, npcId: string, causeLine: string): string | null {
  const idx = world.npcs.findIndex((n) => n.id === npcId);
  if (idx < 0) return null;
  const npc = world.npcs[idx];
  if (npc.role === "monarch" || !npc.name) return null;

  world.npcs.splice(idx, 1);

  const partner = npc.partnerId ? world.npcs.find((n) => n.id === npc.partnerId) : undefined;
  const children = world.npcs.filter((n) => n.parentIds?.includes(npc.id));

  // Sever relationships so the grief surfaces and no dangling refs remain.
  if (partner) {
    partner.partnerId = undefined;
    partner.partneredOnDay = undefined;
  }
  for (const child of children) {
    if (child.parentIds) child.parentIds = child.parentIds.filter((id) => id !== npc.id);
  }

  let line = causeLine;
  if (partner?.name) {
    line += ` ${partner.name} was at the bedside.`;
  } else if (children.length > 0) {
    const names = children.filter((c) => c.name).map((c) => c.name!).slice(0, 2).join(" and ");
    if (names) {
      line += ` Their ${children.length === 1 ? "child" : "children"}${names ? ` — ${names} —` : ""} survive them.`;
    }
  }
  world.journal.write(line, "life", { fromDecision: true });

  plantGrave(world, npc.name);
  world.remembrance.record(npc.name, world.state.day, world.state.year);
  // Loss weighs on the realm.
  world.mood.adjust(-1.5);
  return npc.name;
}
