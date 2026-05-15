/**
 * "Where is this NPC right now, conceptually?" — pure logic for the
 * cutaway/dollhouse mode rendering. Returns the structure id the NPC
 * should be visually placed INSIDE when the player toggles cutaway on.
 *
 * Used by EntityLayer; lifted out of the engine layer so it can be
 * unit-tested in pure node without touching Pixi.
 *
 * Priority by activity:
 *   - sleeping     → home (where you sleep)
 *   - working      → work (or home as fallback)
 *   - celebrating  → home (party's at your house)
 *   - idle:
 *       specialist roles (smith, scholar, miner, guard) → work if it
 *         differs from home — "between tasks at the workplace" reads
 *         better than "loitering at home"
 *       villagers / monarch → home (they idle at the keep / cottage)
 *   - walking      → null (sim is mid-path; render normally outdoors)
 *
 * Returns null if the NPC has no sensible associated building (e.g. a
 * courier with no home/work, or a malformed save).
 */
export function associatedBuildingId(npc: {
  activity: string;
  homeId: string;
  workId: string;
  role: string;
}): string | null {
  if (npc.activity === "walking") return null;
  if (npc.activity === "sleeping") return npc.homeId || null;
  if (npc.activity === "working") {
    return npc.workId || npc.homeId || null;
  }
  if (npc.activity === "celebrating") return npc.homeId || null;
  if (npc.activity === "idle") {
    if (
      npc.role !== "villager" &&
      npc.role !== "monarch" &&
      npc.workId &&
      npc.workId !== npc.homeId
    ) {
      return npc.workId;
    }
    return npc.homeId || null;
  }
  return null;
}
