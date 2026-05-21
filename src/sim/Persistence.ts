import type { World } from "./World";
import type { NPC, Structure, WorldState } from "./types";
import { sanitizeName } from "../lib/sanitize";

/**
 * Save/load schema. Versioned so we can migrate when the data model changes
 * without invalidating existing kingdoms.
 *
 * Storage strategy:
 *   - Browser: localStorage (the dev preview, and the embedded webview when
 *     Tauri filesystem APIs aren't available)
 *   - Tauri: when available, also writes a JSON file to the app data dir so
 *     it survives across reinstalls / cache clears.
 */
export const SAVE_VERSION = 1;
const STORAGE_KEY = "kingdomos.kingdom.v1";

// ── Multi-slot support ────────────────────────────────────────────────────────
// Slots 0, 1, 2 each get their own storage key. The legacy single-key
// `kingdomos.kingdom.v1` maps to slot 0 for backward compatibility.

const SLOT_KEYS = [
  "kingdomos.kingdom.v1",          // slot 0 (legacy key)
  "kingdomos.kingdom.slot1.v1",    // slot 1
  "kingdomos.kingdom.slot2.v1",    // slot 2
] as const;

export const SLOT_COUNT = SLOT_KEYS.length;

export interface SlotMeta {
  slot: number;
  kingdomName?: string;
  monarchName?: string;
  year: number;
  day: number;
  population: number;
  savedAt: string;
  empty: boolean;
}

/** Read lightweight metadata about all save slots without fully parsing them. */
export function readAllSlotMeta(): SlotMeta[] {
  return SLOT_KEYS.map((key, slot) => {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return { slot, year: 0, day: 0, population: 0, savedAt: "", empty: true };
      const parsed = JSON.parse(raw) as Record<string, unknown>;
      return {
        slot,
        kingdomName: typeof parsed.kingdomName === "string" ? parsed.kingdomName : undefined,
        monarchName: typeof parsed.monarchName === "string" ? parsed.monarchName : undefined,
        year: typeof parsed.simTime === "number" ? Math.max(1, Math.floor(parsed.simTime / (56 * 24 * 60)) + 1) : 1,
        day: 0,
        population: Array.isArray(parsed.npcs) ? parsed.npcs.length : 0,
        savedAt: typeof parsed.savedAt === "string" ? parsed.savedAt : "",
        empty: false,
      };
    } catch {
      return { slot, year: 0, day: 0, population: 0, savedAt: "", empty: true };
    }
  });
}

export function writeSaveToSlot(save: SaveData, slot: number): void {
  const key = SLOT_KEYS[slot] ?? STORAGE_KEY;
  try {
    localStorage.setItem(key, JSON.stringify(save));
  } catch (err) {
    console.warn("[Persistence] slot write failed", err);
  }
}

export function readSaveFromSlot(slot: number): SaveData | null {
  const key = SLOT_KEYS[slot] ?? STORAGE_KEY;
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    return validateSave(JSON.parse(raw));
  } catch {
    return null;
  }
}

export function clearSaveSlot(slot: number): void {
  const key = SLOT_KEYS[slot] ?? STORAGE_KEY;
  try { localStorage.removeItem(key); } catch { /* ignore */ }
}

/** The active slot number, persisted across sessions. */
const ACTIVE_SLOT_KEY = "kingdomos.activeSlot";

export function getActiveSlot(): number {
  try {
    const v = localStorage.getItem(ACTIVE_SLOT_KEY);
    const n = v !== null ? parseInt(v, 10) : 0;
    return Number.isFinite(n) && n >= 0 && n < SLOT_COUNT ? n : 0;
  } catch { return 0; }
}

export function setActiveSlot(slot: number): void {
  try { localStorage.setItem(ACTIVE_SLOT_KEY, String(slot)); } catch { /* ignore */ }
}

export interface SaveData {
  version: number;
  /** ISO-8601 timestamp the save was written */
  savedAt: string;
  /** real-world ms when this kingdom was first founded — anchors the calendar */
  foundedAtMs: number;
  /** Player-chosen kingdom name, fixed at founding. */
  kingdomName?: string;
  /** Player-chosen monarch name, fixed at founding. */
  monarchName?: string;
  /**
   * Optional one-line player-written kingdom motto. Persists across reigns
   * (it belongs to the kingdom, not the monarch). Capped at 80 chars on the
   * way in by the store's setIdentity; validateSave clamps again here as a
   * defense-in-depth pass against tampered files.
   */
  kingdomMotto?: string;
  /** Player-designed monarch appearance (CharacterSpec). */
  monarchSpec?: unknown;
  /** Player-designed pet appearance (PetSpec). */
  petSpec?: unknown;
  /** Real-world seconds the kingdom has been "lived" across all sessions */
  totalLifetimeSec: number;
  /** seed used to procgen this world */
  seed: number;
  /**
   * Map dimensions at the time the world was created. Saved so that reloading
   * always regenerates the same map regardless of future default-size changes.
   * New games use 192×128; old saves without these fields fall back to 96×64.
   */
  mapWidth?: number;
  mapHeight?: number;
  /**
   * Current exploration frontier radius in tiles, measured from the castle
   * center. The full explored mask is recomputed from this on load.
   */
  exploredRadius?: number;
  /** in-world simulation time (seconds since boot) */
  simTime: number;
  weather: string;
  loadFactor: number;
  npcs: SavedNpc[];
  pets?: SavedPet[];
  /** key/value of unlocked achievement ids → ISO timestamp */
  achievements?: Record<string, string>;
  /** journal entries chronologically */
  journal?: SavedJournalEntry[];
  /** Royal succession: monarch generation + reign start day + unbroken dynasty streak */
  succession?: { generation: number; reignStartDay: number; dynastyStreak?: number };
  /** Kingdom reputation score (-10..10). */
  reputation?: number;
  /** Faction loyalty scores. */
  factions?: { merchants: number; scholars: number; guard: number };
  /** LifeCycle system: which NPCs have come of age, retired, or formed bonds. */
  lifeCycle?: {
    cameOfAgeIds: string[];
    retiredIds: string[];
    bondKeys: string[];
    lastCheckedDay: number;
  };
  /** Usurper system snapshot (optional — absent in pre-usurper saves). */
  usurper?: {
    active: boolean;
    claimantId?: string;
    claimantName?: string;
    claimantTitle?: string;
    startedDay: number;
    decisionExpiresAt: number;
    lastCheckedDay: number;
    totalChallenges: number;
    totalRepelled: number;
  };
  /** Uprising system snapshot. */
  uprising?: {
    active: boolean;
    agitatorId?: string;
    agitatorName?: string;
    startedDay: number;
    decisionExpiresAt: number;
    lastCheckedDay: number;
    totalUprisings: number;
  };
  /** Royal vault — artifacts accumulated across all monarchs. */
  artifacts?: SavedArtifact[];
  /** Active or constructed buildings (we persist the active build; finished
   *  ones live inside map.structures, but the map itself is regenerated from
   *  seed so we also keep a stub list of "extra" structures to re-place). */
  construction?: {
    active: {
      kind: "watchtower" | "mill" | "shrine" | "astronomers_tower";
      startedDay: number;
      finishesOnDay: number;
      pos: { x: number; y: number };
    } | null;
    completed: Array<{
      id: string;
      kind: "watchtower" | "mill" | "shrine" | "astronomers_tower";
      name: string;
      pos: { x: number; y: number };
      size: { x: number; y: number };
    }>;
  };
  /** Aspirations system — active ids + map of completed ids → ISO timestamp. */
  aspirations?: {
    active: string[];
    completed: Record<string, string>;
  };
  /**
   * Active Royal Edict + its expiry day. Optional; absent when no edict is
   * proclaimed. Hydrated by Edicts.hydrate() which validates the id.
   */
  edicts?: {
    activeId: string | null;
    endsOnDay: number;
  };
  /** Per-day stats snapshots for the sparklines panel. Oldest first. */
  history?: Array<{
    day: number;
    year: number;
    population: number;
    gold: number;
    vault: number;
    /** Added later; back-compat default is 0 on validate. */
    tomes: number;
  }>;
  /**
   * Spontaneous map landmarks discovered by the NarrativeDirector's
   * emergence branch (standing_stones, ruin, camp, wellspring, obelisk).
   * Separate from `construction.completed` because those are player-built
   * additions; landmarks are world-driven.
   */
  landmarks?: Array<{
    id: string;
    kind: string;
    name: string;
    pos: { x: number; y: number };
    size: { x: number; y: number };
  }>;
}

export interface SavedArtifact {
  id: string;
  kind: "scroll" | "relic" | "gem" | "tome" | "weapon" | "treasure";
  name: string;
  origin?: string;
  obtainedOnDay: number;
  obtainedOnYear: number;
}

export interface SavedPet {
  id: string;
  name: string;
  kind: "dog" | "cat";
  pos: { x: number; y: number };
  followingNpcId?: string;
}

export interface SavedJournalEntry {
  id: string;
  day: number;
  year: number;
  season: string;
  text: string;
  kind: "life" | "weather" | "event" | "milestone" | "system";
  /**
   * Optional structure this entry refers to ("highkeep", "rivermouth", "ironhearth", …).
   * When present, the JournalPanel renders a pin button that snaps the
   * camera to that structure's center. Old saves predate this field — UI
   * gracefully omits the pin button when undefined.
   */
  targetStructureId?: string;
}

export interface SavedNpc {
  id: string;
  role: NPC["role"];
  name?: string;
  pos: { x: number; y: number };
  facing: NPC["facing"];
  homeId: string;
  workId: string;
  seed: number;
  /** Optional persistent stats — relationships, age, etc. */
  age?: number;
  partnerId?: string;
  /** In-world day when this NPC was married (for anniversary events). */
  partneredOnDay?: number;
  /** Ids of this NPC's parents (set only for in-sim newborns). */
  parentIds?: string[];
  /** Personality trait — restored on load, generated from seed on first spawn. */
  trait?: string;
}

export function serialize(
  world: World,
  lifetimeSec: number,
  extras: {
    achievements?: Record<string, string>;
    journal?: SavedJournalEntry[];
    kingdomName?: string;
    monarchName?: string;
    kingdomMotto?: string;
    monarchSpec?: unknown;
    petSpec?: unknown;
    succession?: { generation: number; reignStartDay: number; dynastyStreak?: number };
    artifacts?: SavedArtifact[];
    construction?: SaveData["construction"];
  } = {},
): SaveData {
  return {
    version: SAVE_VERSION,
    savedAt: new Date().toISOString(),
    foundedAtMs: world.calendar.cfg.foundedAtMs,
    kingdomName: extras.kingdomName,
    monarchName: extras.monarchName,
    kingdomMotto: extras.kingdomMotto,
    monarchSpec: extras.monarchSpec,
    petSpec: extras.petSpec,
    totalLifetimeSec: lifetimeSec,
    seed: world.state.seed,
    mapWidth: world.map.width,
    mapHeight: world.map.height,
    exploredRadius: world.exploration.snapshot(),
    simTime: world.state.time,
    weather: world.state.weather,
    loadFactor: world.state.loadFactor,
    npcs: world.npcs.map((n) => ({
      id: n.id,
      role: n.role,
      name: n.name,
      pos: { x: n.pos.x, y: n.pos.y },
      facing: n.facing,
      homeId: n.homeId,
      workId: n.workId,
      seed: n.seed,
      age: n.age,
      partnerId: n.partnerId,
      partneredOnDay: n.partneredOnDay,
      parentIds: n.parentIds,
      trait: n.trait,
    })),
    pets: world.pets.map((p) => ({
      id: p.id,
      name: p.name,
      kind: p.kind,
      pos: { x: p.pos.x, y: p.pos.y },
      followingNpcId: p.followingNpcId,
    })),
    achievements: extras.achievements,
    journal: extras.journal,
    succession: extras.succession,
    artifacts: extras.artifacts,
    construction: extras.construction,
    aspirations: {
      active: world.aspirations.active,
      completed: world.aspirations.completed,
    },
    history: world.history.snapshots,
    landmarks: world.discoveries.snapshot(),
    edicts: world.edicts.snapshot(),
    usurper: world.usurper.snapshot(),
    uprising: world.uprising.snapshot(),
    reputation: world.reputation.snapshot(),
    lifeCycle: world.lifeCycle.snapshot(),
    factions: world.factions.snapshot(),
  };
}

// ── Validation ──────────────────────────────────────────────────────────────

const NPCS_MAX_FROM_SAVE = 500;     // cap absolute roster from save (defends memory bombs)
const JOURNAL_MAX_FROM_SAVE = 5000;
const ACHIEVEMENTS_MAX_FROM_SAVE = 200;
const TEXT_MAX = 200;
const SAVE_SIZE_MAX_BYTES = 4 * 1024 * 1024; // 4 MB
const VALID_FACINGS = new Set(["n", "s", "e", "w"]);
const VALID_NPC_ROLES = new Set([
  "villager", "courier", "scholar", "blacksmith", "miner", "guard", "monarch",
]);
const VALID_PET_KINDS = new Set(["dog", "cat"]);
const VALID_JOURNAL_KINDS = new Set(["life", "weather", "event", "milestone", "system"]);
const VALID_ARTIFACT_KINDS = new Set(["scroll", "relic", "gem", "tome", "weapon", "treasure"]);
const ARTIFACTS_MAX_FROM_SAVE = 200;

function isPlainObject(x: unknown): x is Record<string, unknown> {
  return typeof x === "object" && x !== null && !Array.isArray(x);
}

function safeNumber(v: unknown, def = 0): number {
  if (typeof v !== "number") return def;
  if (!Number.isFinite(v)) return def;
  return v;
}

function safeInt(v: unknown, def = 0, min = -Number.MAX_SAFE_INTEGER, max = Number.MAX_SAFE_INTEGER): number {
  const n = safeNumber(v, def);
  return Math.max(min, Math.min(max, Math.floor(n)));
}

function safeString(v: unknown, max = TEXT_MAX): string {
  if (typeof v !== "string") return "";
  return sanitizeName(v, max);
}

/**
 * Returns a fully-sanitized SaveData object or null if the input is too
 * broken to recover. Never throws.
 */
export function validateSave(rawInput: unknown): SaveData | null {
  if (!isPlainObject(rawInput)) return null;
  let raw: Record<string, unknown> = rawInput;
  const incomingVersion = safeNumber(raw.version, 0);
  // Try to migrate older saves forward. If no path exists or the migration
  // returns null, treat the input as too broken to recover.
  if (incomingVersion !== SAVE_VERSION) {
    const migrated = migrateSave(raw, incomingVersion);
    if (!migrated) return null;
    raw = migrated;
  }
  const seed = safeInt(raw.seed, 0, 0, 2 ** 31 - 1);
  // Defensive cap on foundedAtMs: not in the future >1d, not before 2020-01-01.
  const now = Date.now();
  const foundedAtMs = (() => {
    const n = safeNumber(raw.foundedAtMs, now);
    return Math.max(1_577_836_800_000, Math.min(now + 86_400_000, n));
  })();
  const npcsRaw = Array.isArray(raw.npcs) ? raw.npcs : [];
  const npcs: SavedNpc[] = [];
  for (const item of npcsRaw.slice(0, NPCS_MAX_FROM_SAVE)) {
    if (!isPlainObject(item)) continue;
    const role = String(item.role);
    if (!VALID_NPC_ROLES.has(role)) continue;
    const facing = VALID_FACINGS.has(String(item.facing)) ? (item.facing as SavedNpc["facing"]) : "s";
    const pos = isPlainObject(item.pos)
      ? { x: safeNumber((item.pos as Record<string, unknown>).x, 0), y: safeNumber((item.pos as Record<string, unknown>).y, 0) }
      : { x: 0, y: 0 };
    let parentIds: string[] | undefined;
    if (Array.isArray(item.parentIds)) {
      const cleaned: string[] = [];
      // Walk the whole array but stop once we have 2 valid string entries.
      // This way `[42, null, "real_parent"]` still preserves "real_parent",
      // while `[a, b, c, d, e]` correctly caps to ["a", "b"].
      for (const p of item.parentIds as unknown[]) {
        if (cleaned.length >= 2) break;
        const s = safeString(p, 80);
        if (s) cleaned.push(s);
      }
      if (cleaned.length) parentIds = cleaned;
    }
    npcs.push({
      id: safeString(item.id, 80) || `npc_unknown_${npcs.length}`,
      role: role as SavedNpc["role"],
      name: item.name === undefined ? undefined : safeString(item.name, 64),
      pos,
      facing,
      homeId: safeString(item.homeId, 64) || "highkeep",
      workId: safeString(item.workId, 64) || "highkeep",
      seed: safeInt(item.seed, 0, 0, 2 ** 31 - 1),
      age: item.age === undefined ? undefined : Math.max(0, Math.min(200, safeNumber(item.age, 30))),
      partnerId: item.partnerId === undefined ? undefined : safeString(item.partnerId, 80),
      partneredOnDay: item.partneredOnDay === undefined ? undefined : safeInt(item.partneredOnDay, 0, 0, 1_000_000),
      parentIds,
      trait: item.trait === undefined ? undefined : safeString(item.trait, 32),
    });
  }
  // Pets
  const petsRaw = Array.isArray(raw.pets) ? raw.pets : [];
  const pets: SavedPet[] = [];
  for (const item of petsRaw.slice(0, 8)) {
    if (!isPlainObject(item)) continue;
    const kind = String(item.kind);
    if (!VALID_PET_KINDS.has(kind)) continue;
    pets.push({
      id: safeString(item.id, 80) || `pet_${pets.length}`,
      name: safeString(item.name, 64) || "pet",
      kind: kind as SavedPet["kind"],
      pos: isPlainObject(item.pos)
        ? { x: safeNumber((item.pos as Record<string, unknown>).x, 0), y: safeNumber((item.pos as Record<string, unknown>).y, 0) }
        : { x: 0, y: 0 },
      followingNpcId: item.followingNpcId === undefined ? undefined : safeString(item.followingNpcId, 80),
    });
  }
  // Achievements (id → ISO timestamp). Strict on count and key length.
  const ach: Record<string, string> = {};
  if (isPlainObject(raw.achievements)) {
    let n = 0;
    for (const [k, v] of Object.entries(raw.achievements)) {
      if (n++ >= ACHIEVEMENTS_MAX_FROM_SAVE) break;
      if (k.length > 64) continue;
      if (typeof v !== "string") continue;
      ach[k] = safeString(v, 32);
    }
  }
  // Journal — keep newest entries first when capping
  const journal: SavedJournalEntry[] = [];
  if (Array.isArray(raw.journal)) {
    const slice = raw.journal.slice(-JOURNAL_MAX_FROM_SAVE);
    for (const item of slice) {
      if (!isPlainObject(item)) continue;
      const kind = String(item.kind);
      if (!VALID_JOURNAL_KINDS.has(kind)) continue;
      journal.push({
        id: safeString(item.id, 64) || `j_${journal.length}`,
        day: safeInt(item.day, 1, 0, 100_000),
        year: safeInt(item.year, 1, 0, 10_000),
        season: safeString(item.season, 16) || "spring",
        text: safeString(item.text, 240),
        kind: kind as SavedJournalEntry["kind"],
        targetStructureId:
          item.targetStructureId === undefined
            ? undefined
            : safeString(item.targetStructureId, 64) || undefined,
      });
    }
  }
  return {
    version: SAVE_VERSION,
    savedAt: safeString(raw.savedAt, 40) || new Date().toISOString(),
    foundedAtMs,
    kingdomName: raw.kingdomName === undefined ? undefined : safeString(raw.kingdomName, 32),
    monarchName: raw.monarchName === undefined ? undefined : safeString(raw.monarchName, 32),
    // Motto is capped at 80 (matches KINGDOM_MOTTO_MAX in the store), and
    // empty-string is normalized to undefined so renderers can use a simple
    // truthy check.
    kingdomMotto:
      raw.kingdomMotto === undefined
        ? undefined
        : (safeString(raw.kingdomMotto, 80) || undefined),
    monarchSpec: raw.monarchSpec, // re-validated by CharacterSpec consumers downstream
    petSpec: raw.petSpec,
    totalLifetimeSec: safeNumber(raw.totalLifetimeSec, 0),
    seed,
    mapWidth: raw.mapWidth === undefined ? undefined : safeInt(raw.mapWidth, 96, 32, 1024),
    mapHeight: raw.mapHeight === undefined ? undefined : safeInt(raw.mapHeight, 64, 32, 512),
    exploredRadius: raw.exploredRadius === undefined ? undefined : safeInt(raw.exploredRadius, 28, 1, 512),
    simTime: Math.max(0, safeNumber(raw.simTime, 0)),
    weather: safeString(raw.weather, 16) || "clear",
    loadFactor: Math.max(0, Math.min(1, safeNumber(raw.loadFactor, 0))),
    npcs,
    pets,
    achievements: ach,
    journal,
    succession: isPlainObject(raw.succession)
      ? {
          generation: safeInt((raw.succession as Record<string, unknown>).generation, 1, 1, 1000),
          reignStartDay: safeInt(
            (raw.succession as Record<string, unknown>).reignStartDay,
            1,
            0,
            10_000_000,
          ),
          dynastyStreak: safeInt(
            (raw.succession as Record<string, unknown>).dynastyStreak,
            0,
            0,
            10_000,
          ),
        }
      : undefined,
    artifacts: Array.isArray(raw.artifacts)
      ? raw.artifacts
          .slice(0, ARTIFACTS_MAX_FROM_SAVE)
          .filter(isPlainObject)
          .map((item, idx) => {
            const kind = String(item.kind);
            if (!VALID_ARTIFACT_KINDS.has(kind)) return null;
            return {
              id: safeString(item.id, 80) || `art_${idx}`,
              kind: kind as SavedArtifact["kind"],
              name: safeString(item.name, 80) || "Unknown artifact",
              origin: item.origin === undefined ? undefined : safeString(item.origin, 120),
              obtainedOnDay: safeInt(item.obtainedOnDay, 1, 0, 100_000),
              obtainedOnYear: safeInt(item.obtainedOnYear, 1, 0, 10_000),
            } as SavedArtifact;
          })
          .filter((x): x is SavedArtifact => x !== null)
      : undefined,
    construction: validateConstruction(raw.construction),
    aspirations: validateAspirations(raw.aspirations),
    history: validateHistory(raw.history),
    landmarks: validateLandmarks(raw.landmarks),
    edicts: validateEdicts(raw.edicts),
    usurper: validateUsurper(raw.usurper),
    uprising: validateUprising(raw.uprising),
    factions: validateFactions(raw.factions),
    reputation: typeof raw.reputation === "number" && Number.isFinite(raw.reputation)
      ? Math.max(-10, Math.min(10, Math.round(raw.reputation as number)))
      : undefined,
    lifeCycle: validateLifeCycle(raw.lifeCycle),
  };
}

function validateFactions(raw: unknown): SaveData["factions"] {
  if (!isPlainObject(raw)) return undefined;
  const c = (v: unknown) =>
    typeof v === "number" && isFinite(v) ? Math.max(-10, Math.min(10, v)) : 0;
  return { merchants: c(raw.merchants), scholars: c(raw.scholars), guard: c(raw.guard) };
}

function validateLifeCycle(raw: unknown): SaveData["lifeCycle"] {
  if (!isPlainObject(raw)) return undefined;
  const toStrArr = (v: unknown, cap: number): string[] => {
    if (!Array.isArray(v)) return [];
    return (v as unknown[]).slice(0, cap).filter((x): x is string => typeof x === "string");
  };
  return {
    cameOfAgeIds: toStrArr(raw.cameOfAgeIds, 500),
    retiredIds: toStrArr(raw.retiredIds, 200),
    bondKeys: toStrArr(raw.bondKeys, 500),
    lastCheckedDay: safeInt(raw.lastCheckedDay, -1, -1, 100_000),
  };
}

function validateUsurper(raw: unknown): SaveData["usurper"] {
  if (!isPlainObject(raw)) return undefined;
  return {
    active: Boolean(raw.active),
    claimantId: typeof raw.claimantId === "string" ? safeString(raw.claimantId, 80) : undefined,
    claimantName: typeof raw.claimantName === "string" ? safeString(raw.claimantName, 64) : undefined,
    claimantTitle: typeof raw.claimantTitle === "string" ? safeString(raw.claimantTitle, 32) : undefined,
    startedDay: safeInt(raw.startedDay, 0, 0, 100_000),
    decisionExpiresAt: safeNumber(raw.decisionExpiresAt, 0),
    lastCheckedDay: safeInt(raw.lastCheckedDay, 0, 0, 100_000),
    totalChallenges: safeInt(raw.totalChallenges, 0, 0, 10_000),
    totalRepelled: safeInt(raw.totalRepelled, 0, 0, 10_000),
  };
}

function validateUprising(raw: unknown): SaveData["uprising"] {
  if (!isPlainObject(raw)) return undefined;
  return {
    active: Boolean(raw.active),
    agitatorId: typeof raw.agitatorId === "string" ? safeString(raw.agitatorId, 80) : undefined,
    agitatorName: typeof raw.agitatorName === "string" ? safeString(raw.agitatorName, 64) : undefined,
    startedDay: safeInt(raw.startedDay, 0, 0, 100_000),
    decisionExpiresAt: safeNumber(raw.decisionExpiresAt, 0),
    lastCheckedDay: safeInt(raw.lastCheckedDay, 0, 0, 100_000),
    totalUprisings: safeInt(raw.totalUprisings, 0, 0, 10_000),
  };
}

const VALID_EDICT_IDS = new Set(["hospitality", "studious", "frugal", "open_court"]);

function validateEdicts(raw: unknown): SaveData["edicts"] {
  if (!isPlainObject(raw)) return undefined;
  const rawId = raw.activeId;
  const activeId =
    typeof rawId === "string" && VALID_EDICT_IDS.has(rawId) ? rawId : null;
  const endsOnDay = safeInt(raw.endsOnDay, 0, 0, 1_000_000);
  return { activeId, endsOnDay };
}

const VALID_LANDMARK_KINDS = new Set([
  "standing_stones",
  "ruin",
  "camp",
  "wellspring",
  "obelisk",
]);

function validateLandmarks(raw: unknown): SaveData["landmarks"] {
  if (!Array.isArray(raw)) return undefined;
  const out: NonNullable<SaveData["landmarks"]> = [];
  for (const item of raw.slice(0, 50)) {
    if (!isPlainObject(item)) continue;
    const k = String(item.kind);
    if (!VALID_LANDMARK_KINDS.has(k)) continue;
    out.push({
      id: safeString(item.id, 80) || `landmark_${out.length}`,
      kind: k,
      name: safeString(item.name, 64) || k,
      pos: isPlainObject(item.pos)
        ? {
            x: safeNumber((item.pos as Record<string, unknown>).x, 0),
            y: safeNumber((item.pos as Record<string, unknown>).y, 0),
          }
        : { x: 0, y: 0 },
      size: isPlainObject(item.size)
        ? {
            x: safeNumber((item.size as Record<string, unknown>).x, 2),
            y: safeNumber((item.size as Record<string, unknown>).y, 2),
          }
        : { x: 2, y: 2 },
    });
  }
  return out;
}

const HISTORY_MAX = 90;
function validateHistory(raw: unknown): SaveData["history"] {
  if (!Array.isArray(raw)) return undefined;
  const out: NonNullable<SaveData["history"]> = [];
  for (const item of raw.slice(-HISTORY_MAX)) {
    if (!isPlainObject(item)) continue;
    const day = safeInt(item.day, -1, 0, 100_000);
    const year = safeInt(item.year, -1, 0, 10_000);
    if (day < 0 || year < 0) continue;
    out.push({
      day,
      year,
      population: safeInt(item.population, 0, 0, 10_000),
      gold: safeInt(item.gold, 0, 0, 999_999),
      vault: safeInt(item.vault, 0, 0, 1_000),
      // tomes was added after the initial release; old saves without it
      // default to 0 so the sparkline just flats for the pre-upgrade days.
      tomes: safeInt(item.tomes, 0, 0, 999_999),
    });
  }
  return out;
}

const ASPIRATIONS_MAX_ACTIVE = 16;
const ASPIRATIONS_MAX_COMPLETED = 100;

function validateAspirations(raw: unknown): SaveData["aspirations"] {
  if (!isPlainObject(raw)) return undefined;
  const active: string[] = [];
  if (Array.isArray(raw.active)) {
    for (const v of (raw.active as unknown[]).slice(0, ASPIRATIONS_MAX_ACTIVE)) {
      const s = safeString(v, 64);
      if (s) active.push(s);
    }
  }
  const completed: Record<string, string> = {};
  if (isPlainObject(raw.completed)) {
    let n = 0;
    for (const [k, v] of Object.entries(raw.completed)) {
      if (n++ >= ASPIRATIONS_MAX_COMPLETED) break;
      if (k.length > 64) continue;
      if (typeof v !== "string") continue;
      completed[k] = safeString(v, 32);
    }
  }
  return { active, completed };
}

const VALID_BUILD_KINDS = new Set(["watchtower", "mill", "shrine", "astronomers_tower"]);

function validateConstruction(raw: unknown): SaveData["construction"] {
  if (!isPlainObject(raw)) return undefined;
  // active
  let active: NonNullable<SaveData["construction"]>["active"] = null;
  if (isPlainObject(raw.active)) {
    const k = String(raw.active.kind);
    if (VALID_BUILD_KINDS.has(k)) {
      active = {
        kind: k as "watchtower" | "mill" | "shrine" | "astronomers_tower",
        startedDay: safeInt(raw.active.startedDay, 1, 0, 100_000),
        finishesOnDay: safeInt(raw.active.finishesOnDay, 1, 0, 100_000),
        pos: isPlainObject(raw.active.pos)
          ? {
              x: safeNumber((raw.active.pos as Record<string, unknown>).x, 0),
              y: safeNumber((raw.active.pos as Record<string, unknown>).y, 0),
            }
          : { x: 0, y: 0 },
      };
    }
  }
  const completed: NonNullable<SaveData["construction"]>["completed"] = [];
  if (Array.isArray(raw.completed)) {
    for (const item of raw.completed.slice(0, 50)) {
      if (!isPlainObject(item)) continue;
      const k = String(item.kind);
      if (!VALID_BUILD_KINDS.has(k)) continue;
      completed.push({
        id: safeString(item.id, 80) || `build_${completed.length}`,
        kind: k as "watchtower" | "mill" | "shrine" | "astronomers_tower",
        name: safeString(item.name, 64) || k,
        pos: isPlainObject(item.pos)
          ? {
              x: safeNumber((item.pos as Record<string, unknown>).x, 0),
              y: safeNumber((item.pos as Record<string, unknown>).y, 0),
            }
          : { x: 0, y: 0 },
        size: isPlainObject(item.size)
          ? {
              x: safeNumber((item.size as Record<string, unknown>).x, 2),
              y: safeNumber((item.size as Record<string, unknown>).y, 2),
            }
          : { x: 2, y: 2 },
      });
    }
  }
  return { active, completed };
}

/** Apply a save in-place to a freshly constructed World seeded with the same seed. */
export function applySave(world: World, save: SaveData): void {
  if (save.version !== SAVE_VERSION) {
    console.warn(`[Persistence] save version ${save.version} ≠ current ${SAVE_VERSION}; ignoring`);
    return;
  }
  (world.state as WorldState).time = save.simTime;
  world.state.weather = save.weather as WorldState["weather"];
  world.state.loadFactor = save.loadFactor;
  // NPC roster: replace by id where possible. Also reconstruct any newborns
  // (NPCs that exist in the save but not in the freshly-spawned world). Without
  // this, children born in a prior session vanish on reload.
  const byId = new Map(world.npcs.map((n) => [n.id, n]));
  for (const saved of save.npcs) {
    const live = byId.get(saved.id);
    if (live) {
      live.pos = { ...saved.pos };
      live.prevPos = { ...saved.pos };
      live.facing = saved.facing;
      if (saved.name) live.name = saved.name;
      if (saved.age !== undefined) live.age = saved.age;
      if (saved.partnerId) live.partnerId = saved.partnerId;
      if (saved.partneredOnDay !== undefined) live.partneredOnDay = saved.partneredOnDay;
      if (saved.parentIds && saved.parentIds.length) live.parentIds = [...saved.parentIds];
      if (saved.trait) live.trait = saved.trait as typeof live.trait;
    } else {
      // Newborn from a prior session — reconstruct as a fresh NPC. pushNpc
      // enforces the runtime cap so a malicious save can't blow memory.
      world.pushNpc({
        id: saved.id,
        role: saved.role,
        name: saved.name,
        age: saved.age,
        partnerId: saved.partnerId,
        partneredOnDay: saved.partneredOnDay,
        parentIds: saved.parentIds ? [...saved.parentIds] : undefined,
        trait: saved.trait as NPC["trait"] | undefined,
        pos: { ...saved.pos },
        prevPos: { ...saved.pos },
        facing: saved.facing,
        homeId: saved.homeId,
        workId: saved.workId,
        activity: "idle",
        path: [],
        activityTimer: 0,
        seed: saved.seed,
      });
    }
  }
  // Restore pets, if any.
  if (save.pets) {
    world.pets.length = 0;
    for (const p of save.pets) {
      world.pets.push({
        id: p.id,
        name: p.name,
        kind: p.kind,
        pos: { ...p.pos },
        prevPos: { ...p.pos },
        facing: "s",
        followingNpcId: p.followingNpcId,
      });
    }
  }
  // Seed the life-events system with the current day so we don't replay
  // marriages/births/deaths from day 1 just because the session restarted.
  // The cast survives because LifeEvents.lastProcessedDay is private —
  // we touch it intentionally as a save-load concession.
  (world.lifeEvents as unknown as { lastProcessedDay: number }).lastProcessedDay =
    world.state.day;
  // Restore exploration frontier (silently — no journal entries on load).
  if (save.exploredRadius !== undefined) {
    world.exploration.restore(save.exploredRadius);
  }
  // Restore succession state if present.
  if (save.succession) {
    world.succession.state.generation = save.succession.generation;
    world.succession.state.reignStartDay = save.succession.reignStartDay;
    world.succession.state.dynastyStreak = save.succession.dynastyStreak ?? 0;
  }
  // Restore vault contents
  if (save.artifacts) {
    world.treasury.hydrate(save.artifacts);
  }
  // Restore construction: re-place completed buildings on the map and resume
  // any in-progress build.
  if (save.construction) {
    for (const c of save.construction.completed) {
      if (world.map.structures.some((s) => s.id === c.id)) continue;
      world.map.structures.push({
        id: c.id,
        kind: c.kind,
        name: c.name,
        pos: { ...c.pos },
        size: { ...c.size },
      });
      world.map.landmarks.set(c.id, {
        x: c.pos.x + Math.floor(c.size.x / 2),
        y: c.pos.y + Math.floor(c.size.y / 2),
      });
      // make walkable
      for (let dy = 0; dy < c.size.y; dy++) {
        for (let dx = 0; dx < c.size.x; dx++) {
          const t = world.map.tiles[(c.pos.y + dy) * world.map.width + (c.pos.x + dx)];
          if (t) t.walkable = true;
        }
      }
    }
    world.construction.hydrate(save.construction.active);
  }

  // "Welcome back, monarch X" — if the player has been gone a meaningful
  // stretch, write a single journal entry summarizing the gap. This is the
  // moment the wall-clock calendar pays off: returning to a world that has
  // moved on without you should *feel* like that.
  // Restore aspirations (active + completed) if present.
  if (save.aspirations) {
    world.aspirations.hydrate(save.aspirations.active, save.aspirations.completed);
  }
  // Restore the per-day history sparkline buffer.
  if (save.history) {
    world.history.hydrate(save.history);
  }
  // Restore the active Royal Edict (if any). Edicts.hydrate validates the
  // id against EDICT_DEFS internally, so we can hand it the raw shape; any
  // unknown id (renamed/removed in a future version) silently clears.
  if (save.edicts) {
    const allowed = ["hospitality", "studious", "frugal", "open_court"] as const;
    type EdictId = (typeof allowed)[number];
    const id = save.edicts.activeId;
    const safeId: EdictId | null = id && (allowed as readonly string[]).includes(id)
      ? (id as EdictId)
      : null;
    world.edicts.hydrate({ activeId: safeId, endsOnDay: save.edicts.endsOnDay });
  }
  // Re-place narrative-discovered landmarks. The map itself regenerates
  // from seed each load so the procgen structures come back automatically,
  // but landmarks are runtime additions and need to be restored.
  if (save.landmarks) {
    for (const l of save.landmarks) {
      if (world.map.structures.some((s) => s.id === l.id)) continue;
      world.map.structures.push({
        id: l.id,
        kind: l.kind as Structure["kind"],
        name: l.name,
        pos: { ...l.pos },
        size: { ...l.size },
      });
      world.map.landmarks.set(l.id, {
        x: l.pos.x + Math.floor(l.size.x / 2),
        y: l.pos.y + Math.floor(l.size.y / 2),
      });
      // Make the footprint walkable
      for (let dy = 0; dy < l.size.y; dy++) {
        for (let dx = 0; dx < l.size.x; dx++) {
          const t = world.map.tiles[(l.pos.y + dy) * world.map.width + (l.pos.x + dx)];
          if (t) t.walkable = true;
        }
      }
    }
  }
  // Restore usurper + uprising state.
  if (save.usurper) world.usurper.hydrate(save.usurper);
  if (save.uprising) world.uprising.hydrate(save.uprising);
  // Restore reputation and lifecycle progression.
  if (save.reputation !== undefined) world.reputation.hydrate(save.reputation);
  if (save.lifeCycle) world.lifeCycle.hydrate(save.lifeCycle);
  if (save.factions) world.factions.hydrate(save.factions);

  writeWelcomeBack(world, save);
}

function writeWelcomeBack(world: World, save: SaveData) {
  const lastSavedAt = save.savedAt ? new Date(save.savedAt).getTime() : 0;
  if (!lastSavedAt || Number.isNaN(lastSavedAt)) return;
  const realMsAway = Date.now() - lastSavedAt;
  if (realMsAway < 5 * 60 * 1000) return; // skip short reopens (< 5 min)

  const hoursAway = Math.floor(realMsAway / (60 * 60 * 1000));
  const daysAway = Math.floor(hoursAway / 24);

  // ── Time-away phrase ──────────────────────────────────────────────────────
  let timePhrase: string;
  if (hoursAway < 2) timePhrase = "an hour";
  else if (hoursAway < 24) timePhrase = `${hoursAway} hours`;
  else timePhrase = `${daysAway} day${daysAway === 1 ? "" : "s"}`;

  // ── Population + treasury snapshot ────────────────────────────────────────
  const pop = world.npcs.length;
  const gold = Math.floor(world.economy.state.gold);
  const { year, season, day } = world.state;
  const seasonLabel = season.charAt(0).toUpperCase() + season.slice(1);

  // ── Find notable deaths and births recorded while away ────────────────────
  // "While away" = journal entries more recent than the save timestamp.
  // We approximate by looking for life entries since we don't timestamp them
  // precisely; instead we read from the saved journal (pre-load) for names.
  const journalEntries = save.journal ?? [];
  const lastSaveEntryIdx = journalEntries.length - 1;
  // Deaths are identified by keywords in recent "life" entries.
  const recentLife = journalEntries
    .slice(Math.max(0, lastSaveEntryIdx - 20))
    .filter((e) => e.kind === "life");
  const deaths = recentLife.filter(
    (e) => e.text.includes("laid to rest") ||
           e.text.includes("passed") ||
           e.text.includes("closed their eyes") ||
           e.text.includes("bells tolled") ||
           e.text.includes("procession"),
  );
  const births = recentLife.filter(
    (e) => e.text.includes("was born") ||
           e.text.includes("welcomed") ||
           e.text.includes("new cry") ||
           e.text.includes("healthy birth"),
  );

  // ── Build the steward's report ────────────────────────────────────────────
  // Delivers 2-4 lines as separate journal entries so each point is readable.
  const lines: Array<{ text: string; kind: "system" | "life" | "milestone" }> = [];

  // Opening: time away + current date.
  const STEWARD_OPENINGS = [
    `The steward meets you at the door — ${timePhrase} away, and ${seasonLabel} of year ${year} is already well underway.`,
    `A ${timePhrase} passed in the world outside. The scribes have the date: ${seasonLabel}, year ${year}, day ${day}.`,
    `${timePhrase} gone. The kingdom noted it and moved on. It is now ${seasonLabel} of year ${year}.`,
    `The chronicle marks your return after ${timePhrase}. Year ${year}, ${seasonLabel}. Day ${day}.`,
  ];
  lines.push({
    text: STEWARD_OPENINGS[Math.floor(Math.random() * STEWARD_OPENINGS.length)],
    kind: "system",
  });

  // Population + gold line.
  const POP_LINES = [
    `The kingdom numbers ${pop} souls. The treasury holds ${gold} gold.`,
    `${pop} people call this land home. The treasury: ${gold} gold.`,
    `Headcount: ${pop}. The treasury reports ${gold} gold — the scribes checked twice.`,
  ];
  lines.push({ text: POP_LINES[Math.floor(Math.random() * POP_LINES.length)], kind: "system" });

  // Births while away.
  if (births.length > 0) {
    const count = births.length;
    lines.push({
      text: count === 1
        ? `While you were away, a child was born to the kingdom. The herald left a note.`
        : `While you were away, ${count} children were born to the kingdom. The herald has the names.`,
      kind: "life",
    });
  }

  // Deaths while away (with extra weight — loss should feel felt).
  if (deaths.length > 0) {
    const DEATH_AWAY_LINES = [
      `The kingdom also mourned ${deaths.length === 1 ? "a passing" : `${deaths.length} passings`} in your absence. The chronicle has the names.`,
      `${deaths.length === 1 ? "One soul was" : `${deaths.length} souls were`} laid to rest while you were away. The scribes wrote it down, as they always do.`,
      `${deaths.length === 1 ? "Someone dear to the kingdom is gone." : `${deaths.length} are gone.`} The candles are lit. The chronicle remembers them.`,
    ];
    lines.push({
      text: DEATH_AWAY_LINES[Math.floor(Math.random() * DEATH_AWAY_LINES.length)],
      kind: "life",
    });
  }

  // Closing line for long absences.
  if (daysAway >= 3) {
    const LONG_AWAY = [
      "Three days or more. The kingdom kept going, as kingdoms do. It missed nothing — except, perhaps, you.",
      "The gates were closed, but the fields still turned and the forge still ran. That is what a kingdom is.",
    ];
    lines.push({
      text: LONG_AWAY[Math.floor(Math.random() * LONG_AWAY.length)],
      kind: "system",
    });
  }

  // Queue after App wires the onJournal callback.
  setTimeout(() => {
    for (const line of lines) {
      try {
        world.journal.write(line.text, line.kind);
      } catch {
        /* ignore */
      }
    }
  }, 250);
}

export function writeSave(save: SaveData): void {
  const slot = getActiveSlot();
  writeSaveToSlot(save, slot);
  // Best-effort Tauri filesystem mirror; ignore if not available
  void writeTauriCopy(save);
}

export function readSave(): SaveData | null {
  const slot = getActiveSlot();
  return readSaveFromSlot(slot);
}

export function clearSave(): void {
  const slot = getActiveSlot();
  clearSaveSlot(slot);
}

/**
 * Trigger a browser download of the current save as a JSON file.
 * Filename includes kingdom name (if any) and ISO date for archival.
 */
export function exportSave(save: SaveData): void {
  if (typeof document === "undefined") return;
  const blob = new Blob([JSON.stringify(save, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  const safeKingdom = (save.kingdomName ?? "kingdom").replace(/[^a-zA-Z0-9]/g, "_").slice(0, 24);
  const dateStr = new Date().toISOString().slice(0, 10);
  a.href = url;
  a.download = `${safeKingdom}-${dateStr}.kingdomos.json`;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Import a save from a user-selected file. Returns the parsed-and-validated
 * SaveData or null if the file is unreadable or fails validation.
 */
export async function importSaveFromFile(file: File): Promise<SaveData | null> {
  if (file.size > SAVE_SIZE_MAX_BYTES) {
    console.warn(`[Persistence] import: file too large (${file.size} bytes)`);
    return null;
  }
  try {
    const text = await file.text();
    const parsed = JSON.parse(text);
    return validateSave(parsed);
  } catch (err) {
    console.warn("[Persistence] import: parse failed", err);
    return null;
  }
}

/** Persist the parsed-and-validated import as the active save and trigger reload. */
export function commitImportedSave(save: SaveData): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(save));
  } catch (err) {
    console.warn("[Persistence] commitImportedSave failed", err);
  }
}

/**
 * Lift an older save shape forward to the current SAVE_VERSION. Returns the
 * migrated object (still loosely typed; full validation runs after) or null
 * if no migration path exists.
 *
 * Each migration is a small pure function: take the raw object as the
 * previous version expected it, return the raw object as the next version
 * expects it. Stack migrations to walk N→N+1→…→current.
 *
 * No migrations are needed yet (we're at v1) but the scaffold is here so a
 * future v2 doesn't have to invent the architecture under deadline.
 */
function migrateSave(raw: Record<string, unknown>, fromVersion: number): Record<string, unknown> | null {
  let current: Record<string, unknown> = { ...raw };
  let v = fromVersion;
  // Migration chain — each step bumps version by 1.
  if (v === 0) { current = migrateV0ToV1(current); v = 1; }
  // Future migrations:
  //   if (v === 1) { current = migrateV1ToV2(current); v = 2; }
  //   if (v === 2) { current = migrateV2ToV3(current); v = 3; }
  if (v !== SAVE_VERSION) {
    console.warn(`[Persistence] no migration path from v${fromVersion} to v${SAVE_VERSION}`);
    return null;
  }
  return current;
}

/**
 * Migrate a v0 save (pre-release internal builds) up to v1.
 *
 * v0 saves predate several fields that the v1 schema considers optional but
 * the systems expect to find sensibly defaulted. The migration adds those
 * fields with safe placeholders rather than letting validateSave drop them.
 *
 * This is the canonical example of a save migration. When v2 ships, write
 * `migrateV1ToV2(raw)` in the same shape, chain it above.
 */
function migrateV0ToV1(raw: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = { ...raw, version: 1 };

  // v0 NPCs may be missing trait, parentIds, partnerId, age.
  if (Array.isArray(out.npcs)) {
    out.npcs = (out.npcs as unknown[]).map((n) => {
      if (!n || typeof n !== "object") return n;
      const npc = n as Record<string, unknown>;
      return {
        ...npc,
        // age defaulted to 30 if absent — adult, neither too old nor too young
        age: npc.age ?? 30,
      };
      // trait, partnerId, parentIds are optional in the v1 schema — leave undefined
    });
  }

  // v0 had no succession block; default to first generation.
  if (out.succession === undefined) {
    out.succession = { generation: 1, reignStartDay: 1 };
  }

  // v0 had no artifacts / construction / aspirations blocks. Leave as empty.
  if (out.artifacts === undefined) out.artifacts = [];
  if (out.construction === undefined) out.construction = { active: null, completed: [] };
  if (out.aspirations === undefined) out.aspirations = { active: [], completed: {} };

  // v0 had no journal — leave as empty so the new validator doesn't drop it.
  if (out.journal === undefined) out.journal = [];

  return out;
}

async function writeTauriCopy(save: SaveData): Promise<void> {
  if (typeof window === "undefined" || !("__TAURI_INTERNALS__" in window)) return;
  try {
    const fs = await import("@tauri-apps/plugin-fs");
    await fs.writeTextFile("kingdom.json", JSON.stringify(save, null, 2), {
      baseDir: fs.BaseDirectory.AppData,
    });
  } catch (err) {
    // non-fatal: localStorage write already succeeded
    console.warn("[Persistence] Tauri mirror failed", err);
  }
}
