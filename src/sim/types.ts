// Shared simulation types. No Pixi imports allowed in src/sim.

export type TileKind =
  | "ocean"
  | "coast"
  | "river"
  | "plain"
  | "forest"
  | "hill"
  | "mountain"
  | "snow";

export interface Tile {
  kind: TileKind;
  walkable: boolean;
  /** decoration variant index 0..3 — used by renderer for tree/grass tuft variation */
  variant: number;
  /** elevation 0..1 */
  elevation: number;
  /**
   * Whether this tile has been revealed by the Exploration system.
   * Starts false for tiles outside the initial castle radius; the renderer
   * tints unexplored tiles dark so the terrain silhouette is visible but the
   * detail is hidden. Persisted indirectly — only the reveal radius is saved;
   * the explored mask is recomputed from it on load.
   */
  explored: boolean;
}

export interface Vec2 {
  x: number;
  y: number;
}

export type StructureKind =
  | "castle"
  | "town"
  | "library"
  | "forge"
  | "mine"
  | "watchtower"
  | "mill"
  | "shrine"
  | "astronomers_tower"
  // Spontaneous discoveries placed by the NarrativeDirector. Lower-stakes
  // than player-commissioned construction — no cost, no decision; the
  // chronicle just notes "an old shrine was found in the eastern woods."
  | "standing_stones"
  | "ruin"
  | "camp"
  | "wellspring"
  | "obelisk"
  // Memorial grave — placed automatically when a notable named NPC dies.
  // 1×1 tile, doesn't block paths, accumulates near the castle.
  | "grave";

export interface Structure {
  id: string;
  kind: StructureKind;
  name: string;
  /** tile coordinate */
  pos: Vec2;
  /** footprint in tiles */
  size: Vec2;
}

export type NPCRole =
  | "villager"
  | "courier"
  | "scholar"
  | "blacksmith"
  | "miner"
  | "guard"
  | "monarch";

export type NPCActivity =
  | "idle"
  | "walking"
  | "working"
  | "sleeping"
  | "celebrating";

export type PetKind = "dog" | "cat";

export interface Pet {
  /** Unique id; persisted in save. */
  id: string;
  name: string;
  kind: PetKind;
  pos: Vec2;
  prevPos: Vec2;
  facing: "n" | "s" | "e" | "w";
  /** When set, the pet follows this NPC. Otherwise it wanders near the castle. */
  followingNpcId?: string;
  /**
   * Sprite-set key in the SpriteFactory. Defaults to `pet_dog` / `pet_cat`,
   * but the pet creator can set a custom key (e.g. `pet_custom`) so the pet
   * uses a player-designed appearance.
   */
  spriteKey?: string;
  /** Sim-time until which the pet shows a delighted heart (just petted).
   *  Transient — set by World.petThePet, never persisted. */
  heartUntil?: number;
}

export type NPCTrait =
  | "joyful"
  | "grim"
  | "curious"
  | "stoic"
  | "kind"
  | "ambitious"
  | "anxious"
  | "wise";

export interface NPC {
  id: string;
  role: NPCRole;
  /** display name, persistent across sessions (e.g. "Berta the Smith") */
  name?: string;
  /** in-world age in days; advances with sim time */
  age?: number;
  /** id of another NPC this one is paired with (optional) */
  partnerId?: string;
  /** In-world day when this NPC was married. Used for anniversary events. */
  partneredOnDay?: number;
  /**
   * Ids of this NPC's parents, if known. Only set on NPCs born through
   * LifeEvents.tryBirth — initial-spawn NPCs leave this undefined since they
   * have no in-sim genealogy. Length 1 (single parent) or 2 (both parents).
   */
  parentIds?: string[];
  /** personality trait — flavors journal entries when this NPC is mentioned */
  trait?: NPCTrait;
  /** tile-space position (fractional) */
  pos: Vec2;
  /** previous tile-space position — renderer interpolates between pos and prevPos */
  prevPos: Vec2;
  facing: "n" | "s" | "e" | "w";
  homeId: string;
  workId: string;
  activity: NPCActivity;
  /** active path of tile coords; pop from end */
  path: Vec2[];
  /** seconds remaining in current activity */
  activityTimer: number;
  /** seed for per-NPC palette/personality variation */
  seed: number;
  /** display label / speech bubble text (transient) */
  speech?: string;
  speechUntil?: number;
  /** Sim-time until which this NPC glows with the crown's favor (heart
   *  indicator). Transient — set by World.blessNpc, never persisted. */
  blessedUntil?: number;
}

export type WeatherKind = "clear" | "cloudy" | "rain" | "storm" | "snow";

export type Season = "spring" | "summer" | "autumn" | "winter";

export interface WorldState {
  /** simulation time in seconds since boot */
  time: number;
  /** in-world hour 0..24 */
  hour: number;
  /** in-world day number, anchored to real wall-clock since founding */
  day: number;
  /** in-world year */
  year: number;
  /** current season */
  season: Season;
  /** named day-of-week, e.g. "Moonday" */
  dayOfWeek: string;
  weather: WeatherKind;
  /** 0..1, rolling average of "external pressure" — drives mines/airships */
  loadFactor: number;
  /** count of active flavor events the narrative director has fired in the last 60s */
  recentNarrativeEvents: number;
  seed: number;
}
