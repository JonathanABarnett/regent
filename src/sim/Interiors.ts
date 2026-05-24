import type { NPC, Structure, StructureKind } from "./types";

/**
 * Interior data model.
 *
 * Every structure kind has an `Interior` describing:
 *   - A bounded floor (in interior tiles, typically 8-16 wide)
 *   - A list of "stations": furniture pieces with a position + a tag that
 *     NPC activities can map to ("anvil", "throne", "hearth", etc.)
 *   - A floor + wall palette so the room reads as "this kind of building"
 *
 * NPCs aren't tracked in interior space by the simulation — they live on
 * the overworld at all times. When the player opens an interior view, we
 * compute a deterministic placement on the fly via `stationFor()` so the
 * scene reads coherently without adding any tick-time cost.
 *
 * Tier 3 (cutaway dollhouse mode) will reuse this same data model:
 *   - Same stations
 *   - Same NPC-placement function
 *   - Just rendered at world scale with semi-transparent roofs
 */

export type StationTag =
  | "anvil"        // smith works here
  | "bellows"      // smith's helper / breaks
  | "forge_fire"  // ambient (not a person-station)
  | "tools_rack"   // ambient
  | "throne"       // monarch sits here
  | "court_table"  // advisor sits here
  | "guard_post"   // captain stands here
  | "scholar_desk" // scholar reads / writes
  | "bookshelf"    // ambient
  | "candle"       // ambient
  | "hearth"       // idle / family gathering
  | "table"        // eating / talking
  | "bed"          // sleeping
  | "loom"         // villager work
  | "mill_wheel"   // mill worker
  | "ore_cart"     // miner
  | "pickaxe_rack" // miner
  | "lantern"      // mine ambient
  | "watch_floor"  // guard at watchtower
  | "telescope"    // watchtower ambient / astronomer's tower primary
  | "star_chart"   // astronomer's tower work desk
  | "altar"        // shrine ambient
  | "kneeler"      // shrine visitor
  | "campfire"     // camp ambient
  | "tent"         // camp visitor
  | "stone"        // standing stones ambient
  | "obelisk_face" // obelisk ambient
  | "well_mouth"   // wellspring ambient
  | "ruin_arch"    // ruin ambient
  | "wander";      // fallback: pick a free spot

export interface Station {
  /** Position in interior-tile coordinates (origin = top-left of floor). */
  x: number;
  y: number;
  tag: StationTag;
  /** Whether NPCs can be placed at this station, vs. it being decor-only. */
  npcSlot: boolean;
}

export interface Interior {
  /** Interior width in tiles. Each interior tile is rendered at ~16-24px. */
  width: number;
  height: number;
  /** Floor base color (palette varies per building type). */
  floor: string;
  floorAccent: string;
  /** Wall border color drawn around the floor. */
  wall: string;
  /** Atmosphere word for the header — "smoky", "cool", "warm", etc. */
  mood: string;
  /** Ordered list of stations + decor. */
  stations: Station[];
}

// ── Per-kind interior layouts ───────────────────────────────────────────

const COTTAGE: Interior = {
  width: 10,
  height: 7,
  floor: "#5e4a2a",
  floorAccent: "#3f2616",
  wall: "#8b6f47",
  mood: "warm",
  stations: [
    { x: 1, y: 1, tag: "bed", npcSlot: true },
    { x: 1, y: 4, tag: "bed", npcSlot: true },
    { x: 5, y: 4, tag: "table", npcSlot: true },
    { x: 5, y: 2, tag: "table", npcSlot: true },
    { x: 8, y: 5, tag: "hearth", npcSlot: false },
    { x: 8, y: 2, tag: "loom", npcSlot: true },
  ],
};

const FORGE: Interior = {
  width: 11,
  height: 7,
  floor: "#3f3f46",
  floorAccent: "#1c1917",
  wall: "#27272a",
  mood: "smoky",
  stations: [
    { x: 2, y: 3, tag: "forge_fire", npcSlot: false },
    { x: 4, y: 3, tag: "anvil", npcSlot: true },
    { x: 6, y: 4, tag: "bellows", npcSlot: true },
    { x: 8, y: 2, tag: "tools_rack", npcSlot: false },
    { x: 9, y: 5, tag: "tools_rack", npcSlot: false },
  ],
};

const LIBRARY: Interior = {
  width: 11,
  height: 7,
  floor: "#451a03",
  floorAccent: "#1a0e07",
  wall: "#7c2d12",
  mood: "quiet",
  stations: [
    { x: 1, y: 1, tag: "bookshelf", npcSlot: false },
    { x: 1, y: 5, tag: "bookshelf", npcSlot: false },
    { x: 9, y: 1, tag: "bookshelf", npcSlot: false },
    { x: 9, y: 5, tag: "bookshelf", npcSlot: false },
    { x: 4, y: 2, tag: "scholar_desk", npcSlot: true },
    { x: 7, y: 4, tag: "scholar_desk", npcSlot: true },
    { x: 5, y: 5, tag: "candle", npcSlot: false },
  ],
};

const MINE: Interior = {
  width: 10,
  height: 7,
  floor: "#44403c",
  floorAccent: "#1c1917",
  wall: "#57534e",
  mood: "damp",
  stations: [
    { x: 1, y: 3, tag: "ore_cart", npcSlot: false },
    { x: 3, y: 4, tag: "pickaxe_rack", npcSlot: true },
    { x: 5, y: 2, tag: "pickaxe_rack", npcSlot: true },
    { x: 6, y: 5, tag: "lantern", npcSlot: false },
    { x: 8, y: 3, tag: "ore_cart", npcSlot: false },
  ],
};

const CASTLE: Interior = {
  width: 13,
  height: 8,
  floor: "#52525b",
  floorAccent: "#27272a",
  wall: "#71717a",
  mood: "stately",
  stations: [
    { x: 6, y: 1, tag: "throne", npcSlot: true },
    { x: 3, y: 4, tag: "court_table", npcSlot: true },
    { x: 9, y: 4, tag: "court_table", npcSlot: true },
    { x: 1, y: 6, tag: "guard_post", npcSlot: true },
    { x: 11, y: 6, tag: "guard_post", npcSlot: true },
    { x: 4, y: 6, tag: "candle", npcSlot: false },
    { x: 8, y: 6, tag: "candle", npcSlot: false },
  ],
};

const WATCHTOWER: Interior = {
  width: 6,
  height: 6,
  floor: "#78716c",
  floorAccent: "#44403c",
  wall: "#9ca3af",
  mood: "windswept",
  stations: [
    { x: 2, y: 1, tag: "telescope", npcSlot: false },
    { x: 2, y: 3, tag: "watch_floor", npcSlot: true },
    { x: 4, y: 4, tag: "lantern", npcSlot: false },
  ],
};

const MILL: Interior = {
  width: 9,
  height: 6,
  floor: "#854d0e",
  floorAccent: "#451a03",
  wall: "#a16207",
  mood: "warm",
  stations: [
    { x: 1, y: 2, tag: "mill_wheel", npcSlot: false },
    { x: 4, y: 3, tag: "loom", npcSlot: true },
    { x: 6, y: 4, tag: "table", npcSlot: true },
  ],
};

const ASTRONOMERS_TOWER: Interior = {
  width: 6,
  height: 8,
  // Stone floor, deep-blue wall (night-sky feel), brass accents.
  floor: "#3f3f46",
  floorAccent: "#27272a",
  wall: "#1e293b",
  mood: "still",
  stations: [
    { x: 3, y: 1, tag: "telescope", npcSlot: true },     // observer at the eyepiece
    { x: 2, y: 4, tag: "star_chart", npcSlot: true },    // chart-keeper at the desk
    { x: 5, y: 3, tag: "candle", npcSlot: false },
    { x: 1, y: 6, tag: "bookshelf", npcSlot: false },
  ],
};

const SHRINE: Interior = {
  width: 8,
  height: 6,
  floor: "#a8a29e",
  floorAccent: "#57534e",
  wall: "#d6d3d1",
  mood: "still",
  stations: [
    { x: 4, y: 1, tag: "altar", npcSlot: false },
    { x: 3, y: 3, tag: "kneeler", npcSlot: true },
    { x: 5, y: 3, tag: "kneeler", npcSlot: true },
    { x: 1, y: 4, tag: "candle", npcSlot: false },
    { x: 6, y: 4, tag: "candle", npcSlot: false },
  ],
};

const STANDING_STONES: Interior = {
  width: 7,
  height: 7,
  floor: "#3a4d2d",
  floorAccent: "#1f2937",
  wall: "#1f2937",
  mood: "watchful",
  stations: [
    { x: 1, y: 2, tag: "stone", npcSlot: false },
    { x: 3, y: 1, tag: "stone", npcSlot: false },
    { x: 5, y: 2, tag: "stone", npcSlot: false },
    { x: 5, y: 4, tag: "stone", npcSlot: false },
    { x: 3, y: 5, tag: "stone", npcSlot: false },
    { x: 1, y: 4, tag: "stone", npcSlot: false },
  ],
};

const RUIN: Interior = {
  width: 9,
  height: 6,
  floor: "#3f3f46",
  floorAccent: "#1c1917",
  wall: "#78716c",
  mood: "abandoned",
  stations: [
    { x: 4, y: 1, tag: "ruin_arch", npcSlot: false },
    { x: 2, y: 4, tag: "candle", npcSlot: false },
    { x: 6, y: 3, tag: "table", npcSlot: false },
  ],
};

const CAMP: Interior = {
  width: 8,
  height: 6,
  floor: "#3a4d2d",
  floorAccent: "#1f2937",
  wall: "#854d0e",
  mood: "warm",
  stations: [
    { x: 2, y: 2, tag: "tent", npcSlot: true },
    { x: 5, y: 2, tag: "tent", npcSlot: true },
    { x: 3, y: 4, tag: "campfire", npcSlot: false },
  ],
};

const WELLSPRING: Interior = {
  width: 6,
  height: 6,
  floor: "#3a4d2d",
  floorAccent: "#1f2937",
  wall: "#9ca3af",
  mood: "cool",
  stations: [
    { x: 2, y: 2, tag: "well_mouth", npcSlot: false },
  ],
};

const OBELISK: Interior = {
  width: 6,
  height: 8,
  floor: "#3a4d2d",
  floorAccent: "#1f2937",
  wall: "#52525b",
  mood: "unreadable",
  stations: [
    { x: 2, y: 1, tag: "obelisk_face", npcSlot: false },
  ],
};

// Graves are outdoor markers — no real interior. Stub provided only so the
// StructureKind record stays exhaustive; cutaway view should never open a grave.
const GRAVE: Interior = {
  width: 1,
  height: 1,
  floor: "#3f3f46",
  floorAccent: "#27272a",
  wall: "#52525b",
  mood: "quiet",
  stations: [],
};

const INTERIORS: Record<StructureKind, Interior> = {
  castle: CASTLE,
  town: COTTAGE,
  library: LIBRARY,
  forge: FORGE,
  mine: MINE,
  watchtower: WATCHTOWER,
  mill: MILL,
  shrine: SHRINE,
  standing_stones: STANDING_STONES,
  ruin: RUIN,
  camp: CAMP,
  wellspring: WELLSPRING,
  obelisk: OBELISK,
  astronomers_tower: ASTRONOMERS_TOWER,
  grave: GRAVE,
};

/** Public lookup. Returns the cottage layout for unknown kinds as a safety net. */
export function interiorFor(kind: StructureKind): Interior {
  return INTERIORS[kind] ?? COTTAGE;
}

// ── NPC station placement ───────────────────────────────────────────────

/**
 * Map an NPC's role + activity to a preferred station tag. The interior view
 * then assigns each NPC to a real Station of that tag (or a wander fallback).
 */
function preferredStationFor(npc: NPC, kind: StructureKind): StationTag {
  // Monarchs and similar
  if (npc.role === "monarch") return "throne";
  // Activity-driven first
  if (npc.activity === "sleeping") return "bed";
  // Role-specific working stations
  if (npc.activity === "working") {
    if (kind === "forge" && npc.role === "blacksmith") return "anvil";
    if (kind === "library" && npc.role === "scholar") return "scholar_desk";
    if (kind === "mine" && npc.role === "miner") return "pickaxe_rack";
    if (kind === "mill") return "loom";
    if (kind === "watchtower" && npc.role === "guard") return "watch_floor";
    if (kind === "castle" && npc.role === "guard") return "guard_post";
  }
  // Idle defaults
  if (kind === "shrine") return "kneeler";
  if (kind === "camp") return "tent";
  if (kind === "library") return "scholar_desk";
  return "hearth";
}

/**
 * Pick the actual Station object (with x, y coordinates) for an NPC inside
 * a given building. Deterministic per (npc.id, building.id) so the layout
 * is stable while the interior view is open.
 *
 * Strategy:
 *   1. Get the NPC's preferred station tag (above)
 *   2. Find all open Stations of that tag in this interior
 *   3. If multiple, pick one by hashing the npc.id to disambiguate
 *   4. If none of the preferred kind, fall back to any npcSlot Station
 *   5. If still nothing, return null and the view places them along a wall
 */
export function stationFor(
  npc: NPC,
  building: Structure,
  takenStationIndices: ReadonlySet<number>,
): { station: Station | null; index: number } {
  const interior = interiorFor(building.kind);
  const preferred = preferredStationFor(npc, building.kind);

  // First try the preferred tag
  const preferredIndices: number[] = [];
  interior.stations.forEach((s, i) => {
    if (s.tag === preferred && s.npcSlot && !takenStationIndices.has(i)) {
      preferredIndices.push(i);
    }
  });
  if (preferredIndices.length > 0) {
    const idx = preferredIndices[hashInt(npc.id) % preferredIndices.length];
    return { station: interior.stations[idx], index: idx };
  }

  // Fallback: any available npcSlot
  const anyAvailable: number[] = [];
  interior.stations.forEach((s, i) => {
    if (s.npcSlot && !takenStationIndices.has(i)) anyAvailable.push(i);
  });
  if (anyAvailable.length > 0) {
    const idx = anyAvailable[hashInt(npc.id) % anyAvailable.length];
    return { station: interior.stations[idx], index: idx };
  }

  // No station — the view should put this NPC at a wander spot
  return { station: null, index: -1 };
}

function hashInt(s: string): number {
  let h = 2166136261 >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Pretty label for a station tag, used in tooltips / detail text.
 */
export function stationLabel(tag: StationTag): string {
  switch (tag) {
    case "anvil": return "at the anvil";
    case "bellows": return "at the bellows";
    case "forge_fire": return "the forge fire";
    case "tools_rack": return "the tool rack";
    case "throne": return "on the throne";
    case "court_table": return "at the council table";
    case "guard_post": return "at the guard post";
    case "scholar_desk": return "at the scribe's desk";
    case "bookshelf": return "the bookshelves";
    case "candle": return "a candle";
    case "hearth": return "by the hearth";
    case "table": return "at the table";
    case "bed": return "in bed";
    case "loom": return "at the loom";
    case "mill_wheel": return "the millstone";
    case "ore_cart": return "an ore cart";
    case "pickaxe_rack": return "the pickaxe rack";
    case "lantern": return "a lantern";
    case "watch_floor": return "at the lookout";
    case "telescope": return "the far-glass";
    case "star_chart": return "a star chart";
    case "altar": return "the altar";
    case "kneeler": return "the kneeler";
    case "campfire": return "the campfire";
    case "tent": return "a tent";
    case "stone": return "a standing stone";
    case "obelisk_face": return "the obelisk";
    case "well_mouth": return "the well";
    case "ruin_arch": return "a fallen archway";
    case "wander": return "wandering";
  }
}
