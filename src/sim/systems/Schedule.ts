import type { NPC } from "../types";
import type { OverworldMap } from "../Map";

export type ScheduleBand = "dawn" | "day" | "dusk" | "night";

/**
 * Returns the structure id where this NPC ought to be heading right now.
 * FF6-style: each role has a daypart preference for home/work/social.
 */
export function preferredDestination(
  npc: NPC,
  band: ScheduleBand,
  map: OverworldMap,
): string {
  const taverns = map.structures.filter((s) => s.kind === "town");
  const tavernId = taverns[0]?.id ?? npc.homeId;

  // Children (in-sim births under age 12) play between buildings during
  // day/dusk and return home at dawn/night. They don't follow adult careers.
  if ((npc.age ?? 99) < 12 && npc.parentIds && npc.parentIds.length > 0) {
    if (band === "dawn" || band === "night") return npc.homeId;
    // Day/dusk: pick a random nearby building to wander to.
    const playOptions = map.structures.filter(
      (s) =>
        s.kind === "town" || s.kind === "castle" ||
        s.kind === "shrine" || s.kind === "mill" ||
        s.kind === "library",
    );
    if (playOptions.length === 0) return npc.homeId;
    // Use the NPC's seed for deterministic but-varied destination cycling.
    const idx = ((npc.seed ^ Math.floor(Date.now() / 60_000)) >>> 0) % playOptions.length;
    return playOptions[idx].id;
  }

  switch (npc.role) {
    case "monarch":
      // monarch stays near the castle, with occasional walks to the town square
      if (band === "day" && Math.random() < 0.3) return taverns[0]?.id ?? npc.homeId;
      return npc.homeId;
    case "blacksmith":
    case "miner":
      if (band === "dawn" || band === "day" || band === "dusk") return npc.workId;
      return npc.homeId;
    case "scholar":
      if (band === "day" || band === "dusk") return npc.workId;
      if (band === "dawn") return npc.homeId;
      return tavernId;
    case "courier":
      if (band === "night") return npc.homeId;
      return npc.workId;
    case "guard":
      // guards work all bands but rotate
      return npc.workId;
    case "villager":
    default:
      if (band === "day") return tavernId;
      if (band === "dusk") return tavernId;
      return npc.homeId;
  }
}
